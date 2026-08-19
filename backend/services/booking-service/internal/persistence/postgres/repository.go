package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	bookingeventsv1 "github.com/nihfery/takein/gen/go/takein/events/booking/v1"
	eventscommonv1 "github.com/nihfery/takein/gen/go/takein/events/common/v1"
	"github.com/nihfery/takein/libs/go/domainmetrics"
	"github.com/nihfery/takein/services/booking-service/internal/booking"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type Repository struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

const columns = `id,booking_code,provider_id,customer_id,branch_id,staff_id,booking_type,to_char(booking_date,'YYYY-MM-DD'),participant_count,status,starts_at,ends_at,actual_started_at,actual_ended_at,total_duration,round(total_price*100)::bigint,currency,payment_type,COALESCE(payment_channel,''),round(payment_amount*100)::bigint,round(dp_amount*100)::bigint,customer_name,customer_phone,notes,queue_number,checked_in_at,completed_at,held_at,hold_expires_at,expired_at,idempotency_key,created_at,updated_at`

func (r *Repository) Create(ctx context.Context, input booking.CreateInput) (booking.Booking, error) {
	if input.IdempotencyKey == "" {
		return booking.Booking{}, booking.ErrIdempotencyMismatch
	}
	actorType := input.IdempotencyActor
	if actorType == "" {
		actorType = "customer"
	}
	actorID := input.IdempotencyID
	if actorID == 0 {
		actorID = input.CustomerID
	}
	if actorID <= 0 || actorType != "customer" && actorType != "provider" && actorType != "admin" {
		return booking.Booking{}, booking.ErrIdempotencyMismatch
	}
	bookingDate := input.BookingDate
	if bookingDate == "" {
		location, _ := time.LoadLocation("Asia/Bangkok")
		if input.StartsAt != nil {
			bookingDate = input.StartsAt.In(location).Format("2006-01-02")
		} else {
			bookingDate = time.Now().In(location).Format("2006-01-02")
		}
	}
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return booking.Booking{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	result, err := tx.Exec(ctx, `INSERT INTO idempotency_records(actor_type,actor_id,idempotency_key,request_hash,locked_until)VALUES($1,$2,$3,$4,now()+interval '30 seconds')ON CONFLICT DO NOTHING`, actorType, actorID, input.IdempotencyKey, input.RequestHash)
	if err != nil {
		return booking.Booking{}, err
	}
	if result.RowsAffected() == 0 {
		var requestHash string
		var resourceID *int64
		err = tx.QueryRow(ctx, `SELECT request_hash,resource_id FROM idempotency_records WHERE actor_type=$1 AND actor_id=$2 AND idempotency_key=$3`, actorType, actorID, input.IdempotencyKey).Scan(&requestHash, &resourceID)
		if err != nil {
			return booking.Booking{}, err
		}
		if requestHash != input.RequestHash {
			return booking.Booking{}, booking.ErrIdempotencyMismatch
		}
		if resourceID == nil {
			return booking.Booking{}, booking.ErrIdempotencyInProgress
		}
		value, findErr := scanBooking(tx.QueryRow(ctx, `SELECT `+columns+` FROM bookings WHERE id=$1`, *resourceID))
		if findErr != nil {
			return booking.Booking{}, findErr
		}
		if err = tx.Commit(ctx); err != nil {
			return booking.Booking{}, err
		}
		return value, nil
	}
	code := "TK-" + strings.ToUpper(strings.ReplaceAll(uuid.NewString(), "-", ""))[:12]
	status := input.Status
	if status == "" {
		status = "pending_hold"
	}
	holdExpires := time.Now().UTC().Add(3 * time.Minute)
	if input.Status == "" && (input.BookingType == "walk_in" || input.BookingType == "queue") {
		status = "waiting"
	}
	paymentType := input.PaymentType
	if paymentType == "" {
		paymentType = "pay_at_salon"
	}
	participantCount := input.ParticipantCount
	if participantCount == 0 {
		participantCount = 1
	}
	var queueNumber *int32
	if (input.BookingType == "queue" || input.BookingType == "walk_in") && input.StartsAt == nil {
		if input.BranchID == nil || *input.BranchID <= 0 {
			return booking.Booking{}, booking.ErrInvalidTransition
		}
		lockKey := fmt.Sprintf("booking-queue:%d:%s", *input.BranchID, bookingDate)
		if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, lockKey); err != nil {
			return booking.Booking{}, err
		}
		var next int32
		if err = tx.QueryRow(ctx, `SELECT COALESCE(max(queue_number),0)+1 FROM bookings WHERE branch_id=$1 AND booking_date=$2::date AND booking_type IN('queue','walk_in')`, input.BranchID, bookingDate).Scan(&next); err != nil {
			return booking.Booking{}, err
		}
		queueNumber = &next
	}
	var customerID any
	if input.CustomerID > 0 {
		customerID = input.CustomerID
	}
	value, err := scanBooking(tx.QueryRow(ctx, `INSERT INTO bookings(
		booking_code,provider_id,customer_id,branch_id,staff_id,booking_type,booking_date,status,starts_at,ends_at,
		total_duration,total_price,currency,payment_type,payment_channel,payment_amount,dp_amount,customer_name,customer_phone,notes,
		participant_count,queue_number,held_at,hold_expires_at,idempotency_key)
		VALUES($1,$2,$3,$4,$5,COALESCE(NULLIF($6,''),'scheduled'),$7::date,$8,$9,$10,$11,$12::numeric/100,
		COALESCE(NULLIF($13,''),'IDR'),$14,NULLIF($15,''),$16::numeric/100,$17::numeric/100,$18,$19,$20,$21,$22,
		CASE WHEN $8='pending_hold' THEN now() END,CASE WHEN $8='pending_hold' THEN $23::timestamptz END,$24)
		RETURNING `+columns,
		code, input.ProviderID, customerID, input.BranchID, input.StaffID, input.BookingType, bookingDate, status,
		input.StartsAt, input.EndsAt, input.TotalDuration, input.TotalPriceMinor, input.Currency, paymentType, input.PaymentChannel,
		input.PaymentAmount, input.DPAmount, nullable(input.CustomerName), nullable(input.CustomerPhone), nullable(input.Notes),
		participantCount, queueNumber, holdExpires, input.IdempotencyKey))
	if err != nil {
		return booking.Booking{}, translate(err)
	}
	for _, snapshot := range input.Services {
		_, err = tx.Exec(ctx, `INSERT INTO booking_services(booking_id,service_id,service_title,price,estimated_duration) VALUES($1,$2,$3,$4::numeric/100,$5)`, value.ID, snapshot.ServiceID, snapshot.Title, snapshot.PriceMinor, snapshot.Duration)
		if err != nil {
			return booking.Booking{}, err
		}
	}
	for _, participant := range input.Participants {
		var participantID int64
		var totalDuration int32
		var totalPrice int64
		for _, snapshot := range participant.Services {
			totalDuration += snapshot.Duration
			totalPrice += snapshot.PriceMinor
		}
		err = tx.QueryRow(ctx, `INSERT INTO booking_participants(booking_id,position,is_primary,name,phone,email,gender,age_group,description,provider_staff_id,starts_at,ends_at,total_duration,total_price) VALUES($1,$2,$3,$4,NULLIF($5,''),NULLIF($6,''),NULLIF($7,''),NULLIF($8,''),NULLIF($9,''),$10,$11,$12,$13,$14::numeric/100) RETURNING id`, value.ID, participant.Position, participant.Primary, participant.Name, participant.Phone, participant.Email, participant.Gender, participant.AgeGroup, participant.Description, participant.StaffID, participant.StartsAt, participant.EndsAt, totalDuration, totalPrice).Scan(&participantID)
		if err != nil {
			return booking.Booking{}, err
		}
		for _, snapshot := range participant.Services {
			_, err = tx.Exec(ctx, `INSERT INTO booking_participant_services(booking_participant_id,service_id,service_title,price,estimated_duration) VALUES($1,$2,$3,$4::numeric/100,$5)`, participantID, snapshot.ServiceID, snapshot.Title, snapshot.PriceMinor, snapshot.Duration)
			if err != nil {
				return booking.Booking{}, err
			}
		}
		if participant.StaffID != nil && participant.StartsAt != nil && participant.EndsAt != nil {
			_, err = tx.Exec(ctx, `INSERT INTO booking_staff_slots(booking_id,participant_id,source_key,staff_id,starts_at,ends_at,active)VALUES($1,$2,$3,$4,$5,$6,$7)`, value.ID, participantID, fmt.Sprintf("participant:%d", participantID), participant.StaffID, participant.StartsAt, participant.EndsAt, activeBookingStatus(status))
			if err != nil {
				return booking.Booking{}, translate(err)
			}
		}
	}
	if input.StaffID != nil && input.StartsAt != nil && input.EndsAt != nil && !hasIndependentParticipantSlot(input.Participants) {
		_, err = tx.Exec(ctx, `INSERT INTO booking_staff_slots(booking_id,source_key,staff_id,starts_at,ends_at,active)VALUES($1,'booking',$2,$3,$4,$5)`, value.ID, input.StaffID, input.StartsAt, input.EndsAt, activeBookingStatus(status))
		if err != nil {
			return booking.Booking{}, translate(err)
		}
	}
	if err = writeOutbox(ctx, tx, value, "booking.created"); err != nil {
		return booking.Booking{}, err
	}
	response, _ := json.Marshal(value)
	_, err = tx.Exec(ctx, `UPDATE idempotency_records SET resource_id=$4,response_status=201,response_body=$5::jsonb,completed_at=now(),locked_until=now() WHERE actor_type=$1 AND actor_id=$2 AND idempotency_key=$3`, actorType, actorID, input.IdempotencyKey, value.ID, string(response))
	if err != nil {
		return booking.Booking{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return booking.Booking{}, err
	}
	return value, nil
}

func (r *Repository) ListCustomer(ctx context.Context, customerID int64) ([]booking.Booking, error) {
	return r.list(ctx, `SELECT `+columns+` FROM bookings WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 500`, customerID)
}
func (r *Repository) ListProvider(ctx context.Context, filter booking.ProviderListFilter) ([]booking.Booking, error) {
	return r.list(ctx, `SELECT `+columns+` FROM bookings
		WHERE provider_id=$1
		  AND ($2::bigint IS NULL OR branch_id=$2)
		  AND (NULLIF($3,'')::date IS NULL OR booking_date=NULLIF($3,'')::date)
		  AND (NULLIF($4,'')::date IS NULL OR booking_date>=NULLIF($4,'')::date)
		  AND (NULLIF($5,'')::date IS NULL OR booking_date<=NULLIF($5,'')::date)
		  AND (NULLIF($6,'') IS NULL OR booking_type=$6)
		  AND (NULLIF($7,'') IS NULL OR status=$7)
		  AND ($8<>'queue' OR booking_type IN ('scheduled','queue','walk_in','manual','group'))
		ORDER BY booking_date DESC,COALESCE(queue_number,2147483647),COALESCE(starts_at,created_at),id DESC LIMIT 500`,
		filter.ProviderID, filter.BranchID, filter.BookingDate, filter.DateFrom, filter.DateTo, filter.BookingType, filter.Status, filter.Mode)
}
func (r *Repository) AdminList(ctx context.Context) ([]booking.Booking, error) {
	return r.list(ctx, `SELECT `+columns+` FROM bookings ORDER BY created_at DESC LIMIT 500`)
}
func (r *Repository) ByID(ctx context.Context, id int64) (booking.Booking, error) {
	return scanBooking(r.pool.QueryRow(ctx, `SELECT `+columns+` FROM bookings WHERE id=$1`, id))
}
func (r *Repository) ByCode(ctx context.Context, code string) (booking.Booking, error) {
	return scanBooking(r.pool.QueryRow(ctx, `SELECT `+columns+` FROM bookings WHERE booking_code=$1`, code))
}
func (r *Repository) Availability(ctx context.Context, staffID int64, starts, ends time.Time, ignoreBookingID *int64) (bool, error) {
	var available bool
	err := r.pool.QueryRow(ctx, `SELECT NOT EXISTS(SELECT 1 FROM booking_staff_slots WHERE staff_id=$1 AND starts_at<$3 AND ends_at>$2 AND active AND ($4::bigint IS NULL OR booking_id<>$4))`, staffID, starts, ends, ignoreBookingID).Scan(&available)
	return available, err
}
func (r *Repository) ServiceIDs(ctx context.Context, bookingID int64) ([]int64, error) {
	rows, err := r.pool.Query(ctx, `SELECT service_id FROM booking_services WHERE booking_id=$1 ORDER BY id`, bookingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
func (r *Repository) PricingItems(ctx context.Context, bookingID int64) ([]int64, int64, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT bps.service_id,round(bps.price*100)::bigint
		FROM booking_participant_services bps
		JOIN booking_participants bp ON bp.id=bps.booking_participant_id
		WHERE bp.booking_id=$1
		ORDER BY bp.position,bps.id`, bookingID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	ids := []int64{}
	var subtotal int64
	for rows.Next() {
		var id, price int64
		if err = rows.Scan(&id, &price); err != nil {
			return nil, 0, err
		}
		ids = append(ids, id)
		subtotal += price
	}
	if err = rows.Err(); err != nil {
		return nil, 0, err
	}
	if len(ids) > 0 {
		return ids, subtotal, nil
	}
	rows, err = r.pool.Query(ctx, `
		SELECT bs.service_id,round(bs.price*100)::bigint
		FROM bookings b
		JOIN booking_services bs ON bs.booking_id=b.id
		CROSS JOIN LATERAL generate_series(1,b.participant_count)
		WHERE b.id=$1
		ORDER BY bs.id`, bookingID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, price int64
		if err = rows.Scan(&id, &price); err != nil {
			return nil, 0, err
		}
		ids = append(ids, id)
		subtotal += price
	}
	return ids, subtotal, rows.Err()
}
func (r *Repository) Reschedule(ctx context.Context, id, customerID, staffID int64, starts, ends time.Time) (booking.Booking, error) {
	var independentParticipants bool
	if err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM booking_participants WHERE booking_id=$1 AND provider_staff_id IS NOT NULL AND starts_at IS NOT NULL AND ends_at IS NOT NULL)`, id).Scan(&independentParticipants); err != nil {
		return booking.Booking{}, err
	}
	if independentParticipants {
		return booking.Booking{}, booking.ErrInvalidTransition
	}
	return r.mutate(ctx, "booking.rescheduled", `UPDATE bookings SET staff_id=$3,booking_date=($4 AT TIME ZONE 'Asia/Bangkok')::date,starts_at=$4,ends_at=$5,status=CASE WHEN status='confirmed' THEN 'confirmed' ELSE status END,updated_at=now()WHERE id=$1 AND customer_id=$2 AND status IN('pending_hold','pending_payment','confirmed') RETURNING `+columns, id, customerID, staffID, starts, ends)
}
func (r *Repository) Finalize(ctx context.Context, id, customerID int64, input booking.FinalizeInput) (booking.Booking, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return booking.Booking{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	current, err := scanBooking(tx.QueryRow(ctx, `SELECT `+columns+` FROM bookings WHERE id=$1 FOR UPDATE`, id))
	if err != nil {
		return booking.Booking{}, err
	}
	if current.CustomerID == nil || *current.CustomerID != customerID {
		return booking.Booking{}, booking.ErrForbidden
	}
	if current.Status != "pending_hold" {
		if current.PaymentType == input.PaymentType && current.PaymentChannel == normalizedPaymentChannel(input.PaymentType, input.PaymentChannel) {
			if err = tx.Commit(ctx); err != nil {
				return booking.Booking{}, err
			}
			return current, nil
		}
		return booking.Booking{}, booking.ErrInvalidTransition
	}
	if current.HoldExpiresAt == nil || !current.HoldExpiresAt.After(time.Now().UTC()) || current.ParticipantCount != input.ParticipantCount {
		return booking.Booking{}, booking.ErrInvalidTransition
	}
	if current.ParticipantCount > 1 {
		if _, err = tx.Exec(ctx, `INSERT INTO booking_participants(booking_id,position,is_primary,name) VALUES($1,1,true,'Customer') ON CONFLICT(booking_id,position) DO NOTHING`, id); err != nil {
			return booking.Booking{}, err
		}
		for index, guest := range input.Guests {
			_, err = tx.Exec(ctx, `INSERT INTO booking_participants(booking_id,position,is_primary,name,phone,email,gender,age_group,description)
				VALUES($1,$2,false,$3,NULLIF($4,''),NULLIF($5,''),NULLIF($6,''),NULLIF($7,''),NULLIF($8,''))
				ON CONFLICT(booking_id,position) DO UPDATE SET name=EXCLUDED.name,phone=EXCLUDED.phone,email=EXCLUDED.email,gender=EXCLUDED.gender,age_group=EXCLUDED.age_group,description=EXCLUDED.description,updated_at=now()`, id, index+2, guest.Name, guest.Phone, guest.Email, guest.Gender, guest.AgeGroup, guest.Description)
			if err != nil {
				return booking.Booking{}, err
			}
		}
	}
	value, err := scanBooking(tx.QueryRow(ctx, `UPDATE bookings SET
		status=CASE WHEN $3='pay_at_salon' THEN CASE WHEN booking_type='queue' THEN 'waiting' ELSE 'confirmed' END ELSE 'pending_payment' END,
		total_price=COALESCE($5::numeric/100,total_price),
		payment_type=$3,payment_channel=CASE WHEN $3='pay_at_salon' THEN NULL ELSE NULLIF($4,'') END,
		payment_amount=CASE WHEN $3='pay_at_salon' THEN 0 WHEN $3='dp' THEN CASE WHEN dp_amount>0 THEN LEAST(dp_amount,COALESCE($5::numeric/100,total_price)) ELSE round(COALESCE($5::numeric/100,total_price)*0.30,2) END ELSE COALESCE($5::numeric/100,total_price) END,
		notes=COALESCE(NULLIF($6,''),notes),hold_expires_at=NULL,updated_at=now()
		WHERE id=$1 AND customer_id=$2 RETURNING `+columns, id, customerID, input.PaymentType, input.PaymentChannel, input.TotalPriceMinor, input.Notes))
	if err != nil {
		return booking.Booking{}, translate(err)
	}
	if err = writeOutbox(ctx, tx, value, "booking.finalized"); err != nil {
		return booking.Booking{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return booking.Booking{}, err
	}
	return value, nil
}
func (r *Repository) ExtendHold(ctx context.Context, id, customerID int64, duration time.Duration) (booking.Booking, error) {
	seconds := int64(duration.Seconds())
	return r.mutate(ctx, "booking.hold_extended", `UPDATE bookings SET hold_expires_at=GREATEST(hold_expires_at,now())+($3*interval '1 second'),updated_at=now() WHERE id=$1 AND customer_id=$2 AND status='pending_hold' AND hold_expires_at>now() RETURNING `+columns, id, customerID, seconds)
}
func (r *Repository) Cancel(ctx context.Context, id, customerID int64) (booking.Booking, error) {
	value, err := r.ByID(ctx, id)
	if err != nil {
		return booking.Booking{}, err
	}
	if value.CustomerID == nil || *value.CustomerID != customerID {
		return booking.Booking{}, booking.ErrForbidden
	}
	if value.Status == "customer_cancelled" || value.Status == "cancelled" {
		return value, nil
	}
	if !booking.CanTransition(value.Status, "customer_cancelled") && !booking.CanTransition(value.Status, "cancelled") {
		return booking.Booking{}, booking.ErrInvalidTransition
	}
	return r.mutate(ctx, "booking.cancelled", `UPDATE bookings SET status='customer_cancelled',updated_at=now()WHERE id=$1 AND customer_id=$2 RETURNING `+columns, id, customerID)
}
func (r *Repository) AdminTransition(ctx context.Context, id int64, status string) (booking.Booking, error) {
	current, err := r.ByID(ctx, id)
	if err != nil {
		return booking.Booking{}, err
	}
	if !booking.CanTransition(current.Status, status) {
		return booking.Booking{}, booking.ErrInvalidTransition
	}
	return r.mutate(ctx, "booking.status_changed", `UPDATE bookings SET status=$2,updated_at=now()WHERE id=$1 AND status=$3 RETURNING `+columns, id, status, current.Status)
}

func (r *Repository) ProviderTransition(ctx context.Context, id, providerID int64, branchScope *int64, status string, staffID *int64) (booking.Booking, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return booking.Booking{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	current, err := scanBooking(tx.QueryRow(ctx, `SELECT `+columns+` FROM bookings WHERE id=$1 FOR UPDATE`, id))
	if err != nil {
		return booking.Booking{}, translate(err)
	}
	if current.ProviderID != providerID || branchScope != nil && (current.BranchID == nil || *current.BranchID != *branchScope) {
		return booking.Booking{}, booking.ErrForbidden
	}
	if current.Status == status {
		if err = tx.Commit(ctx); err != nil {
			return booking.Booking{}, err
		}
		return current, nil
	}
	if !booking.CanTransition(current.Status, status) {
		return booking.Booking{}, booking.ErrInvalidTransition
	}
	value, err := scanBooking(tx.QueryRow(ctx, `UPDATE bookings SET
		status=$2,
		staff_id=COALESCE($3,staff_id),
		checked_in_at=CASE WHEN $2='checked_in' THEN COALESCE(checked_in_at,now()) ELSE checked_in_at END,
		actual_started_at=CASE WHEN $2='in_progress' THEN COALESCE(actual_started_at,now()) ELSE actual_started_at END,
		actual_ended_at=CASE WHEN $2='completed' THEN COALESCE(actual_ended_at,now()) ELSE actual_ended_at END,
		completed_at=CASE WHEN $2='completed' THEN COALESCE(completed_at,now()) ELSE completed_at END,
		hold_expires_at=CASE WHEN $2 IN('cancelled','provider_cancelled','no_show') THEN NULL ELSE hold_expires_at END,
		idempotency_key=CASE WHEN $2 IN('cancelled','provider_cancelled','no_show') THEN NULL ELSE idempotency_key END,
		updated_at=now()
		WHERE id=$1 AND status=$4 RETURNING `+columns, id, status, staffID, current.Status))
	if err != nil {
		return booking.Booking{}, translate(err)
	}
	eventType := map[string]string{
		"checked_in": "booking.checked_in", "in_progress": "booking.started", "completed": "booking.completed",
		"cancelled": "booking.cancelled", "provider_cancelled": "booking.cancelled", "no_show": "booking.no_show",
	}[status]
	if eventType == "" {
		eventType = "booking.status_changed"
	}
	if err = writeOutbox(ctx, tx, value, eventType); err != nil {
		return booking.Booking{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return booking.Booking{}, err
	}
	return value, nil
}

func (r *Repository) ProviderUpdateDetails(ctx context.Context, id, providerID int64, branchScope *int64, customerName, customerPhone, notes string) (booking.Booking, error) {
	return r.mutate(ctx, "booking.details_updated", `UPDATE bookings SET
		customer_name=NULLIF($4,''),
		customer_phone=NULLIF($5,''),
		notes=NULLIF($6,''),
		updated_at=now()
		WHERE id=$1 AND provider_id=$2 AND ($3::bigint IS NULL OR branch_id=$3)
		RETURNING `+columns, id, providerID, branchScope, customerName, customerPhone, notes)
}

func (r *Repository) EligibleReviewStaff(ctx context.Context, bookingID int64) ([]int64, error) {
	rows, err := r.pool.Query(ctx, `SELECT staff_id FROM (
		SELECT staff_id FROM bookings WHERE id=$1 AND staff_id IS NOT NULL
		UNION
		SELECT provider_staff_id FROM booking_participants WHERE booking_id=$1 AND provider_staff_id IS NOT NULL
	) eligible ORDER BY staff_id`, bookingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	staffIDs := []int64{}
	for rows.Next() {
		var staffID int64
		if err = rows.Scan(&staffID); err != nil {
			return nil, err
		}
		staffIDs = append(staffIDs, staffID)
	}
	return staffIDs, rows.Err()
}

func (r *Repository) ApplyPaymentState(ctx context.Context, input booking.PaymentStateInput) (booking.Booking, bool, error) {
	eventID, err := uuid.Parse(input.EventID)
	if err != nil || input.PaymentID <= 0 || input.BookingID <= 0 {
		return booking.Booking{}, false, booking.ErrInvalidTransition
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return booking.Booking{}, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	current, err := scanBooking(tx.QueryRow(ctx, `SELECT `+columns+` FROM bookings WHERE id=$1 FOR UPDATE`, input.BookingID))
	if err != nil {
		return booking.Booking{}, false, translate(err)
	}
	if input.Topic != "" {
		result, insertErr := tx.Exec(ctx, `INSERT INTO inbox_events(event_id,topic,partition_id,offset_id,event_type) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, eventID, input.Topic, input.Partition, input.Offset, input.EventType)
		if insertErr != nil {
			return booking.Booking{}, false, insertErr
		}
		if result.RowsAffected() == 0 {
			if err = tx.Commit(ctx); err != nil {
				return booking.Booking{}, false, err
			}
			return current, false, nil
		}
	} else {
		var exists bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM payment_projection WHERE event_id=$1)`, eventID).Scan(&exists); err != nil {
			return booking.Booking{}, false, err
		}
		if exists {
			if err = tx.Commit(ctx); err != nil {
				return booking.Booking{}, false, err
			}
			return current, false, nil
		}
	}
	_, err = tx.Exec(ctx, `INSERT INTO payment_projection(payment_id,booking_id,status,event_id) VALUES($1,$2,$3,$4)
		ON CONFLICT(payment_id) DO UPDATE SET status=EXCLUDED.status,event_id=EXCLUDED.event_id,updated_at=now()`, input.PaymentID, input.BookingID, input.Status, eventID)
	if err != nil {
		return booking.Booking{}, false, err
	}
	target := current.Status
	switch input.Status {
	case "paid":
		expectedAmount := current.PaymentAmount
		if current.PaymentType == "pay_at_salon" {
			expectedAmount = current.TotalPriceMinor
		}
		if expectedAmount != input.AmountMinor || !strings.EqualFold(current.Currency, input.Currency) {
			return booking.Booking{}, false, booking.ErrPaymentMismatch
		}
		if current.Status == "pending_payment" || current.Status == "pending_hold" {
			target = "confirmed"
		}
	case "failed", "expired", "cancelled":
		if current.Status == "pending_payment" {
			target = "payment_expired"
		}
	case "refunded":
		if current.Status == "completed" || current.Status == "order_completed" {
			target = "refund_completed"
		}
	case "pending", "unpaid":
	default:
		return booking.Booking{}, false, booking.ErrInvalidTransition
	}
	applied := target != current.Status
	if applied {
		current, err = scanBooking(tx.QueryRow(ctx, `UPDATE bookings SET status=$2,hold_expires_at=CASE WHEN $2='confirmed' THEN NULL ELSE hold_expires_at END,updated_at=now() WHERE id=$1 AND status=$3 RETURNING `+columns, current.ID, target, current.Status))
		if err != nil {
			return booking.Booking{}, false, translate(err)
		}
		if err = writeOutbox(ctx, tx, current, "booking.payment_state_applied"); err != nil {
			return booking.Booking{}, false, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return booking.Booking{}, false, err
	}
	return current, applied, nil
}

func (r *Repository) ExpireHolds(ctx context.Context, before time.Time) (int64, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	rows, err := tx.Query(ctx, `SELECT `+columns+` FROM bookings WHERE status='pending_hold' AND hold_expires_at<=$1 ORDER BY hold_expires_at,id FOR UPDATE SKIP LOCKED LIMIT 100`, before)
	if err != nil {
		return 0, err
	}
	items := []booking.Booking{}
	for rows.Next() {
		value, scanErr := scanBooking(rows)
		if scanErr != nil {
			rows.Close()
			return 0, scanErr
		}
		items = append(items, value)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return 0, err
	}
	rows.Close()
	for index := range items {
		items[index], err = scanBooking(tx.QueryRow(ctx, `UPDATE bookings SET status='expired_hold',expired_at=now(),updated_at=now() WHERE id=$1 AND status='pending_hold' RETURNING `+columns, items[index].ID))
		if err != nil {
			return 0, err
		}
		if err = writeOutbox(ctx, tx, items[index], "booking.hold_expired"); err != nil {
			return 0, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return 0, err
	}
	expired := int64(len(items))
	domainmetrics.BookingHoldsExpired(expired)
	return expired, nil
}

func (r *Repository) list(ctx context.Context, query string, args ...any) ([]booking.Booking, error) {
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, translate(err)
	}
	defer rows.Close()
	result := []booking.Booking{}
	for rows.Next() {
		value, scanErr := scanBooking(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		result = append(result, value)
	}
	return result, rows.Err()
}
func (r *Repository) mutate(ctx context.Context, eventType, query string, args ...any) (booking.Booking, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return booking.Booking{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	value, err := scanBooking(tx.QueryRow(ctx, query, args...))
	if err != nil {
		return booking.Booking{}, translate(err)
	}
	if err = writeOutbox(ctx, tx, value, eventType); err != nil {
		return booking.Booking{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return booking.Booking{}, err
	}
	return value, nil
}
func writeOutbox(ctx context.Context, tx pgx.Tx, value booking.Booking, eventType string) error {
	eventID := uuid.New()
	message := &bookingeventsv1.BookingChanged{Metadata: &eventscommonv1.EventMetadata{EventId: eventID.String(), EventVersion: 1, OccurredAt: timestamppb.Now(), Producer: "booking-service"}, BookingId: fmt.Sprint(value.ID), BookingCode: value.BookingCode, ProviderId: fmt.Sprint(value.ProviderID), Status: value.Status, ChangeType: eventType, PaymentType: value.PaymentType, TotalPriceMinorUnits: value.TotalPriceMinor, Currency: value.Currency, BookingDate: value.BookingDate}
	if value.CustomerID != nil {
		message.CustomerId = fmt.Sprint(*value.CustomerID)
	}
	if value.BranchID != nil {
		message.BranchId = fmt.Sprint(*value.BranchID)
	}
	if value.StaffID != nil {
		message.StaffId = fmt.Sprint(*value.StaffID)
	}
	payload, err := proto.Marshal(message)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,occurred_at)VALUES($1,'booking',$2,$3,1,$4,'{"content-type":"application/protobuf"}'::jsonb,now())`, eventID, fmt.Sprint(value.ID), eventType, payload)
	return err
}

type rowScanner interface{ Scan(...any) error }

func scanBooking(row rowScanner) (booking.Booking, error) {
	var value booking.Booking
	err := row.Scan(&value.ID, &value.BookingCode, &value.ProviderID, &value.CustomerID, &value.BranchID, &value.StaffID, &value.BookingType, &value.BookingDate, &value.ParticipantCount, &value.Status, &value.StartsAt, &value.EndsAt, &value.ActualStartedAt, &value.ActualEndedAt, &value.TotalDuration, &value.TotalPriceMinor, &value.Currency, &value.PaymentType, &value.PaymentChannel, &value.PaymentAmount, &value.DPAmount, &value.CustomerName, &value.CustomerPhone, &value.Notes, &value.QueueNumber, &value.CheckedInAt, &value.CompletedAt, &value.HeldAt, &value.HoldExpiresAt, &value.ExpiredAt, &value.IdempotencyKey, &value.CreatedAt, &value.UpdatedAt)
	return value, translate(err)
}
func translate(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return booking.ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23P01", "40P01":
			return booking.ErrSlotConflict
		case "23505":
			return booking.ErrIdempotencyMismatch
		}
	}
	return err
}
func nullable(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func hasIndependentParticipantSlot(participants []booking.Participant) bool {
	for _, participant := range participants {
		if participant.StaffID != nil && participant.StartsAt != nil && participant.EndsAt != nil {
			return true
		}
	}
	return false
}

func activeBookingStatus(status string) bool {
	switch status {
	case "pending", "pending_hold", "pending_payment", "confirmed", "waiting", "checked_in", "in_progress", "inprogress":
		return true
	default:
		return false
	}
}

func normalizedPaymentChannel(paymentType, paymentChannel string) string {
	if paymentType == "pay_at_salon" {
		return ""
	}
	return paymentChannel
}
