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
	eventscommonv1 "github.com/nihfery/takein/gen/go/takein/events/common/v1"
	customereventsv1 "github.com/nihfery/takein/gen/go/takein/events/customer/v1"
	"github.com/nihfery/takein/services/customer-service/internal/customer"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type Repository struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

const profileColumns = `id,user_id,customer_code,phone_number,gender,date_of_birth,religion,allergies,avatar,address_line_1,address_line_2,city,state,country,status,display_name,email,created_at,updated_at`

func (r *Repository) ProfileByUser(ctx context.Context, userID int64) (map[string]any, error) {
	return r.one(ctx, `SELECT `+profileColumns+` FROM customer_profiles WHERE user_id=$1`, userID)
}
func (r *Repository) UpdateProfile(ctx context.Context, userID int64, values map[string]any) (map[string]any, error) {
	return r.mutate(ctx, "customer.profile_updated", `UPDATE customer_profiles SET phone_number=COALESCE(NULLIF($2,''),phone_number),gender=COALESCE(NULLIF($3,''),gender),date_of_birth=COALESCE(NULLIF($4,'')::date,date_of_birth),religion=COALESCE(NULLIF($5,''),religion),allergies=COALESCE(NULLIF($6,''),allergies),address_line_1=COALESCE(NULLIF($7,''),address_line_1),address_line_2=COALESCE(NULLIF($8,''),address_line_2),city=COALESCE(NULLIF($9,''),city),state=COALESCE(NULLIF($10,''),state),country=COALESCE(NULLIF($11,''),country),updated_at=now()WHERE user_id=$1 RETURNING `+profileColumns, userID, text(values, "phone_number"), text(values, "gender"), text(values, "date_of_birth"), text(values, "religion"), text(values, "allergies"), text(values, "address_line_1"), text(values, "address_line_2"), text(values, "city"), text(values, "state"), text(values, "country"))
}
func (r *Repository) Activity(ctx context.Context, userID int64, limit, offset int32) ([]map[string]any, error) {
	return r.many(ctx, `SELECT a.id,a.booking_id,a.created_at,a.updated_at FROM customer_activities a JOIN customer_profiles c ON c.id=a.customer_id WHERE c.user_id=$1 ORDER BY a.created_at DESC LIMIT $2 OFFSET $3`, userID, limit, offset)
}
func (r *Repository) ActivitySummary(ctx context.Context, userID int64) (map[string]any, error) {
	return r.one(ctx, `SELECT count(a.id) AS total_bookings,max(a.created_at) AS last_activity_at FROM customer_profiles c LEFT JOIN customer_activities a ON a.customer_id=c.id WHERE c.user_id=$1 GROUP BY c.id`, userID)
}
func (r *Repository) Favorites(ctx context.Context, userID int64) ([]int64, error) {
	rows, err := r.pool.Query(ctx, `SELECT f.branch_id FROM customer_favorites f JOIN customer_profiles c ON c.id=f.customer_id WHERE c.user_id=$1 ORDER BY f.created_at DESC`, userID)
	if err != nil {
		return nil, translate(err)
	}
	defer rows.Close()
	values, err := pgx.CollectRows(rows, pgx.RowTo[int64])
	if err != nil {
		return nil, translate(err)
	}
	if values == nil {
		values = []int64{}
	}
	return values, nil
}
func (r *Repository) AddFavorite(ctx context.Context, userID, branchID int64) error {
	tag, err := r.pool.Exec(ctx, `INSERT INTO customer_favorites(customer_id,branch_id) SELECT id,$2 FROM customer_profiles WHERE user_id=$1 ON CONFLICT(customer_id,branch_id) DO NOTHING`, userID, branchID)
	if err != nil {
		return translate(err)
	}
	if tag.RowsAffected() == 0 {
		var exists bool
		if err = r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM customer_profiles WHERE user_id=$1)`, userID).Scan(&exists); err != nil {
			return translate(err)
		}
		if !exists {
			return customer.ErrNotFound
		}
	}
	return nil
}
func (r *Repository) RemoveFavorite(ctx context.Context, userID, branchID int64) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM customer_favorites f USING customer_profiles c WHERE f.customer_id=c.id AND c.user_id=$1 AND f.branch_id=$2`, userID, branchID)
	return translate(err)
}
func (r *Repository) CreateReview(ctx context.Context, userID, bookingID, branchID int64, input customer.ReviewInput) (map[string]any, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var customerID int64
	if err = tx.QueryRow(ctx, `SELECT id FROM customer_profiles WHERE user_id=$1`, userID).Scan(&customerID); err != nil {
		return nil, translate(err)
	}
	var providerID, projectedBranchID int64
	if err = tx.QueryRow(ctx, `SELECT provider_id,branch_id FROM customer_activities WHERE customer_id=$1 AND booking_id=$2 AND branch_id=$3`, customerID, bookingID, branchID).Scan(&providerID, &projectedBranchID); err != nil {
		return nil, translate(err)
	}
	rows, err := tx.Query(ctx, `INSERT INTO branch_reviews(booking_id,customer_id,branch_id,provider_id,rating,comment,images)VALUES($1,$2,$3,$4,$5,$6,$7)RETURNING id,booking_id,customer_id,branch_id,provider_id,rating,comment,images,created_at,updated_at`, bookingID, customerID, projectedBranchID, providerID, input.Rating, nullable(input.Comment), jsonValue(input.ImageObjectIDs))
	if err != nil {
		return nil, translate(err)
	}
	branchReview, err := pgx.CollectOneRow(rows, pgx.RowToMap)
	rows.Close()
	if err != nil {
		return nil, translate(err)
	}
	var staffReview map[string]any
	if input.StaffID != nil {
		staffRating := input.Rating
		if input.StaffRating != nil {
			staffRating = *input.StaffRating
		}
		staffComment := input.StaffComment
		if staffComment == "" {
			staffComment = input.Comment
		}
		staffRows, insertErr := tx.Query(ctx, `INSERT INTO staff_reviews(booking_id,customer_id,staff_id,provider_id,branch_id,rating,comment)VALUES($1,$2,$3,$4,$5,$6,$7)RETURNING id,booking_id,customer_id,staff_id,provider_id,branch_id,rating,comment,created_at,updated_at`, bookingID, customerID, *input.StaffID, providerID, projectedBranchID, staffRating, nullable(staffComment))
		if insertErr != nil {
			return nil, translate(insertErr)
		}
		staffReview, err = pgx.CollectOneRow(staffRows, pgx.RowToMap)
		staffRows.Close()
		if err != nil {
			return nil, translate(err)
		}
	}
	value := map[string]any{"branch_review": branchReview, "staff_review": staffReview}
	eventID := uuid.New()
	now := time.Now().UTC()
	staffID := ""
	if input.StaffID != nil {
		staffID = fmt.Sprint(*input.StaffID)
	}
	message := &customereventsv1.ReviewCreated{Metadata: eventMetadata(eventID, now, fmt.Sprint(branchReview["id"])), ReviewId: fmt.Sprint(branchReview["id"]), BookingId: fmt.Sprint(bookingID), CustomerId: fmt.Sprint(customerID), BranchId: fmt.Sprint(projectedBranchID), StaffId: staffID, Rating: input.Rating, Comment: input.Comment, CreatedAt: now.Format(time.RFC3339Nano), ProviderId: fmt.Sprint(providerID)}
	payload, marshalErr := proto.Marshal(message)
	if marshalErr != nil {
		return nil, marshalErr
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,occurred_at)VALUES($1,'review',$2,'customer.review_created',1,$3,'{"content-type":"application/protobuf"}'::jsonb,$4)`, eventID, fmt.Sprint(branchReview["id"]), payload, now)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return value, nil
}
func (r *Repository) HasReview(ctx context.Context, userID, bookingID int64) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM branch_reviews r JOIN customer_profiles c ON c.id=r.customer_id WHERE c.user_id=$1 AND r.booking_id=$2)`, userID, bookingID).Scan(&exists)
	return exists, err
}
func (r *Repository) List(ctx context.Context) ([]map[string]any, error) {
	return r.many(ctx, `SELECT `+profileColumns+` FROM customer_profiles ORDER BY id LIMIT 500`)
}
func (r *Repository) ByID(ctx context.Context, id int64) (map[string]any, error) {
	return r.one(ctx, `SELECT `+profileColumns+` FROM customer_profiles WHERE id=$1`, id)
}
func (r *Repository) Delete(ctx context.Context, id int64) error {
	return r.delete(ctx, id, `DELETE FROM customer_profiles WHERE id=$1`, id)
}
func (r *Repository) Toggle(ctx context.Context, id int64) (map[string]any, error) {
	return r.mutate(ctx, "customer.status_changed", `UPDATE customer_profiles SET status=CASE status WHEN 'active' THEN 'inactive' ELSE 'active' END,updated_at=now()WHERE id=$1 RETURNING `+profileColumns, id)
}

func (r *Repository) ListProviderCustomers(ctx context.Context, providerID int64, branchID *int64, search string) (map[string]any, error) {
	items, err := r.many(ctx, `SELECT c.id,c.user_id,c.customer_code,c.display_name,c.email,c.phone_number,c.status,
		count(a.booking_id)::bigint AS provider_bookings_count,
		COALESCE(sum(a.total_price_minor_units) FILTER (WHERE COALESCE(a.status,'') NOT IN ('pending_hold','expired_hold','payment_expired','cancelled','canceled','provider_cancelled','customer_cancelled')),0)::bigint AS provider_total_spent_minor_units,
		max(a.booking_date)::text AS provider_last_booking_date
	FROM customer_profiles c JOIN customer_activities a ON a.customer_id=c.id
	WHERE a.provider_id=$1 AND ($2::bigint IS NULL OR a.branch_id=$2)
	  AND ($3='' OR c.display_name ILIKE '%'||$3||'%' OR c.email ILIKE '%'||$3||'%' OR c.customer_code ILIKE '%'||$3||'%' OR c.phone_number ILIKE '%'||$3||'%')
	GROUP BY c.id ORDER BY max(a.booking_date) DESC NULLS LAST,c.id DESC LIMIT 500`, providerID, branchID, strings.TrimSpace(search))
	if err != nil {
		return nil, err
	}
	summary, err := r.one(ctx, `SELECT count(DISTINCT customer_id)::bigint AS total_customers,
		count(*) FILTER (WHERE booking_count>1)::bigint AS returning_customers,
		count(*) FILTER (WHERE booked_this_month)::bigint AS new_this_month,
		COALESCE(sum(booking_count),0)::bigint AS total_bookings
	FROM (SELECT customer_id,count(*)::bigint booking_count,bool_or(booking_date>=date_trunc('month',CURRENT_DATE)::date) booked_this_month FROM customer_activities
		WHERE provider_id=$1 AND ($2::bigint IS NULL OR branch_id=$2) GROUP BY customer_id) scoped`, providerID, branchID)
	if err != nil {
		return nil, err
	}
	return map[string]any{"customers": items, "summary": summary, "search": strings.TrimSpace(search)}, nil
}

func (r *Repository) ListProviderReviews(ctx context.Context, providerID int64, branchID *int64, rating *int32) (map[string]any, error) {
	branchReviews, err := r.many(ctx, `SELECT r.id,r.booking_id,r.customer_id,r.branch_id,r.rating,r.comment,r.images,r.created_at,
		c.customer_code,c.display_name AS customer_name
	FROM branch_reviews r LEFT JOIN customer_profiles c ON c.id=r.customer_id
	WHERE r.provider_id=$1 AND ($2::bigint IS NULL OR r.branch_id=$2) AND ($3::smallint IS NULL OR r.rating=$3)
	ORDER BY r.created_at DESC LIMIT 500`, providerID, branchID, rating)
	if err != nil {
		return nil, err
	}
	staffReviews, err := r.many(ctx, `SELECT r.id,r.booking_id,r.customer_id,r.staff_id,r.branch_id,r.rating,r.comment,r.created_at,
		c.customer_code,c.display_name AS customer_name
	FROM staff_reviews r LEFT JOIN customer_profiles c ON c.id=r.customer_id
	WHERE r.provider_id=$1 AND ($2::bigint IS NULL OR r.branch_id=$2) AND ($3::smallint IS NULL OR r.rating=$3)
	ORDER BY r.created_at DESC LIMIT 500`, providerID, branchID, rating)
	if err != nil {
		return nil, err
	}
	summary, err := r.one(ctx, `SELECT
		(SELECT count(*) FROM branch_reviews WHERE provider_id=$1 AND ($2::bigint IS NULL OR branch_id=$2))+
		(SELECT count(*) FROM staff_reviews WHERE provider_id=$1 AND ($2::bigint IS NULL OR branch_id=$2)) AS total_reviews,
		COALESCE((SELECT round(avg(rating)::numeric,1) FROM branch_reviews WHERE provider_id=$1 AND ($2::bigint IS NULL OR branch_id=$2)),0) AS branch_average,
		COALESCE((SELECT round(avg(rating)::numeric,1) FROM staff_reviews WHERE provider_id=$1 AND ($2::bigint IS NULL OR branch_id=$2)),0) AS staff_average,
		(SELECT count(*) FROM branch_reviews WHERE provider_id=$1 AND ($2::bigint IS NULL OR branch_id=$2) AND rating=5)+
		(SELECT count(*) FROM staff_reviews WHERE provider_id=$1 AND ($2::bigint IS NULL OR branch_id=$2) AND rating=5) AS five_star`, providerID, branchID)
	if err != nil {
		return nil, err
	}
	return map[string]any{"branch_reviews": branchReviews, "staff_reviews": staffReviews, "summary": summary, "rating": rating}, nil
}
func (r *Repository) one(ctx context.Context, query string, args ...any) (map[string]any, error) {
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, translate(err)
	}
	defer rows.Close()
	value, err := pgx.CollectOneRow(rows, pgx.RowToMap)
	return value, translate(err)
}
func (r *Repository) many(ctx context.Context, query string, args ...any) ([]map[string]any, error) {
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, translate(err)
	}
	defer rows.Close()
	return pgx.CollectRows(rows, pgx.RowToMap)
}
func (r *Repository) mutate(ctx context.Context, eventType, query string, args ...any) (map[string]any, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return nil, translate(err)
	}
	value, err := pgx.CollectOneRow(rows, pgx.RowToMap)
	rows.Close()
	if err != nil {
		return nil, translate(err)
	}
	eventID := uuid.New()
	now := time.Now().UTC()
	message := &customereventsv1.CustomerChanged{Metadata: eventMetadata(eventID, now, fmt.Sprint(value["id"])), CustomerId: fmt.Sprint(value["id"]), UserId: fmt.Sprint(value["user_id"]), Status: fmt.Sprint(value["status"]), ChangeType: eventType}
	payload, marshalErr := proto.Marshal(message)
	if marshalErr != nil {
		return nil, marshalErr
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,occurred_at)VALUES($1,'customer',$2,$3,1,$4,'{"content-type":"application/protobuf"}'::jsonb,$5)`, eventID, fmt.Sprint(value["id"]), eventType, payload, now)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return value, nil
}
func (r *Repository) delete(ctx context.Context, id int64, query string, args ...any) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var userID int64
	if err = tx.QueryRow(ctx, `SELECT user_id FROM customer_profiles WHERE id=$1 FOR UPDATE`, id).Scan(&userID); err != nil {
		return translate(err)
	}
	result, err := tx.Exec(ctx, query, args...)
	if err != nil {
		return translate(err)
	}
	if result.RowsAffected() != 1 {
		return customer.ErrNotFound
	}
	eventID := uuid.New()
	now := time.Now().UTC()
	message := &customereventsv1.CustomerChanged{Metadata: eventMetadata(eventID, now, fmt.Sprint(id)), CustomerId: fmt.Sprint(id), UserId: fmt.Sprint(userID), Status: "deleted", ChangeType: "customer.deleted"}
	payload, marshalErr := proto.Marshal(message)
	if marshalErr != nil {
		return marshalErr
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,occurred_at)VALUES($1,'customer',$2,'customer.deleted',1,$3,'{"content-type":"application/protobuf"}'::jsonb,$4)`, eventID, fmt.Sprint(id), payload, now)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func translate(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return customer.ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return customer.ErrConflict
	}
	return err
}
func text(values map[string]any, key string) string { value, _ := values[key].(string); return value }
func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}
func jsonValue(value any) []byte { encoded, _ := json.Marshal(value); return encoded }
func eventMetadata(eventID uuid.UUID, occurredAt time.Time, aggregateID string) *eventscommonv1.EventMetadata {
	return &eventscommonv1.EventMetadata{EventId: eventID.String(), EventVersion: 1, OccurredAt: timestamppb.New(occurredAt), Producer: "customer-service", AggregateId: aggregateID}
}
