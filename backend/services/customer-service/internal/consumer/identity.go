package consumer

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	bookingeventsv1 "github.com/nihfery/takein/gen/go/takein/events/booking/v1"
	eventscommonv1 "github.com/nihfery/takein/gen/go/takein/events/common/v1"
	customereventsv1 "github.com/nihfery/takein/gen/go/takein/events/customer/v1"
	identityeventsv1 "github.com/nihfery/takein/gen/go/takein/events/identity/v1"
	"github.com/nihfery/takein/libs/go/kafkaconsumer"
	"github.com/twmb/franz-go/pkg/kgo"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type DomainProcessor struct{ pool *pgxpool.Pool }

func NewDomainProcessor(pool *pgxpool.Pool) *DomainProcessor {
	return &DomainProcessor{pool: pool}
}

// NewIdentityProcessor is retained for callers that still use the original
// constructor name. The processor now handles all customer projections.
func NewIdentityProcessor(pool *pgxpool.Pool) *DomainProcessor {
	return NewDomainProcessor(pool)
}

func (p *DomainProcessor) Process(ctx context.Context, record *kgo.Record) error {
	eventID, err := uuid.Parse(kafkaconsumer.Header(record, "event_id"))
	if err != nil {
		return errors.New("event_id header is missing or invalid")
	}
	eventType := kafkaconsumer.Header(record, "event_type")
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	result, err := tx.Exec(ctx, `INSERT INTO inbox_events(event_id,topic,partition_id,offset_id,event_type) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, eventID, record.Topic, record.Partition, record.Offset, eventType)
	if err != nil || result.RowsAffected() == 0 {
		if err != nil {
			return err
		}
		return tx.Commit(ctx)
	}
	if record.Topic == "takein.booking.events.v1" {
		if err = projectBookingActivity(ctx, tx, eventType, record.Value); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}

	var customerID, userID int64
	status := "active"
	switch eventType {
	case "identity.user_registered":
		message := &identityeventsv1.UserRegistered{}
		if err = proto.Unmarshal(record.Value, message); err != nil {
			return err
		}
		if message.GetRole() != "customer" {
			return tx.Commit(ctx)
		}
		userID, err = strconv.ParseInt(message.GetUserId(), 10, 64)
		if err != nil {
			return err
		}
		var birthDate any
		if message.GetDateOfBirth() != "" {
			parsed, parseErr := time.Parse("2006-01-02", message.GetDateOfBirth())
			if parseErr != nil {
				return fmt.Errorf("invalid date_of_birth: %w", parseErr)
			}
			birthDate = parsed
		}
		err = tx.QueryRow(ctx, `INSERT INTO customer_profiles(user_id,customer_code,phone_number,gender,date_of_birth,religion,allergies,status,display_name,email) VALUES($1,$2,NULLIF($3,''),NULLIF($4,''),$5,NULLIF($6,''),NULLIF($7,''),'active',NULLIF($8,''),NULLIF($9,'')) ON CONFLICT(user_id) DO UPDATE SET display_name=COALESCE(NULLIF(EXCLUDED.display_name,''),customer_profiles.display_name),email=COALESCE(NULLIF(EXCLUDED.email,''),customer_profiles.email),updated_at=now() RETURNING id`, userID, "CUS-"+message.GetUserId(), message.GetPhoneNumber(), message.GetGender(), birthDate, message.GetReligion(), message.GetAllergies(), message.GetName(), message.GetEmail()).Scan(&customerID)
	case "identity.user_profile_updated":
		message := &identityeventsv1.UserProfileUpdated{}
		if err = proto.Unmarshal(record.Value, message); err != nil {
			return err
		}
		userID, err = strconv.ParseInt(message.GetUserId(), 10, 64)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE customer_profiles SET display_name=NULLIF($2,''),email=NULLIF($3,''),updated_at=now() WHERE user_id=$1`, userID, message.GetName(), message.GetEmail())
		if err != nil {
			return err
		}
		return tx.Commit(ctx)
	case "identity.user_disabled", "identity.user_status_changed":
		message := &identityeventsv1.UserStatusChanged{}
		if eventType == "identity.user_disabled" {
			disabled := &identityeventsv1.UserDisabled{}
			if err = proto.Unmarshal(record.Value, disabled); err != nil {
				return err
			}
			message.UserId, message.Status = disabled.GetUserId(), "inactive"
		} else if err = proto.Unmarshal(record.Value, message); err != nil {
			return err
		}
		userID, err = strconv.ParseInt(message.GetUserId(), 10, 64)
		if err != nil {
			return err
		}
		if message.GetStatus() != "active" {
			status = "inactive"
		}
		err = tx.QueryRow(ctx, `UPDATE customer_profiles SET status=$2,updated_at=now() WHERE user_id=$1 RETURNING id`, userID, status).Scan(&customerID)
		if errors.Is(err, pgx.ErrNoRows) {
			return tx.Commit(ctx)
		}
	default:
		return tx.Commit(ctx)
	}
	if err != nil {
		return err
	}
	if eventType == "identity.user_registered" {
		if _, err = tx.Exec(ctx, `
			INSERT INTO customer_activities(customer_id,booking_id,provider_id,branch_id,booking_date,status,total_price_minor_units,currency,created_at,updated_at)
			SELECT $1,booking_id,provider_id,branch_id,booking_date,status,total_price_minor_units,currency,created_at,updated_at
			FROM pending_customer_activities WHERE user_id=$2
			ON CONFLICT(customer_id,booking_id) DO UPDATE
			SET provider_id=EXCLUDED.provider_id,branch_id=EXCLUDED.branch_id,booking_date=EXCLUDED.booking_date,status=EXCLUDED.status,
				total_price_minor_units=EXCLUDED.total_price_minor_units,currency=EXCLUDED.currency,
				created_at=LEAST(customer_activities.created_at,EXCLUDED.created_at),
				updated_at=GREATEST(customer_activities.updated_at,EXCLUDED.updated_at)`, customerID, userID); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `DELETE FROM pending_customer_activities WHERE user_id=$1`, userID); err != nil {
			return err
		}
	}
	return writeCustomerEvent(ctx, tx, customerID, userID, status, "customer.profile_projected")
}

func projectBookingActivity(ctx context.Context, tx pgx.Tx, eventType string, payload []byte) error {
	if !strings.HasPrefix(eventType, "booking.") {
		return nil
	}
	message := &bookingeventsv1.BookingChanged{}
	if err := proto.Unmarshal(payload, message); err != nil {
		return err
	}
	// Provider-created walk-ins intentionally omit the customer account. A
	// present but malformed identifier is a broken event and must be retried or
	// routed to the DLQ instead of being acknowledged as successfully handled.
	rawCustomerID := strings.TrimSpace(message.GetCustomerId())
	if rawCustomerID == "" {
		return nil
	}
	userID, err := strconv.ParseInt(rawCustomerID, 10, 64)
	if err != nil {
		return fmt.Errorf("invalid booking customer_id: %w", err)
	}
	if userID <= 0 {
		return errors.New("invalid booking customer_id: must be positive")
	}
	bookingID, err := strconv.ParseInt(message.GetBookingId(), 10, 64)
	if err != nil {
		return fmt.Errorf("invalid booking_id: %w", err)
	}
	providerID, err := strconv.ParseInt(message.GetProviderId(), 10, 64)
	if err != nil || providerID <= 0 {
		return fmt.Errorf("invalid booking provider_id")
	}
	branchID, err := strconv.ParseInt(message.GetBranchId(), 10, 64)
	if err != nil || branchID <= 0 {
		return fmt.Errorf("invalid booking branch_id")
	}
	var bookingDate any
	if message.GetBookingDate() != "" {
		parsed, parseErr := time.Parse("2006-01-02", message.GetBookingDate())
		if parseErr != nil {
			return fmt.Errorf("invalid booking_date: %w", parseErr)
		}
		bookingDate = parsed
	}
	occurredAt := time.Now().UTC()
	if metadata := message.GetMetadata(); metadata != nil && metadata.GetOccurredAt() != nil && metadata.GetOccurredAt().IsValid() {
		occurredAt = metadata.GetOccurredAt().AsTime()
	}
	result, err := tx.Exec(ctx, `
		INSERT INTO customer_activities(customer_id,booking_id,provider_id,branch_id,booking_date,status,total_price_minor_units,currency,created_at,updated_at)
		SELECT id,$2,$4,$5,$6,$7,$8,$9,$3,$3 FROM customer_profiles WHERE user_id=$1
		ON CONFLICT(customer_id,booking_id) DO UPDATE
		SET provider_id=EXCLUDED.provider_id,branch_id=EXCLUDED.branch_id,booking_date=EXCLUDED.booking_date,status=EXCLUDED.status,
			total_price_minor_units=EXCLUDED.total_price_minor_units,currency=EXCLUDED.currency,
			created_at=LEAST(customer_activities.created_at,EXCLUDED.created_at),
			updated_at=GREATEST(customer_activities.updated_at,EXCLUDED.updated_at)`, userID, bookingID, occurredAt, providerID, branchID, bookingDate, message.GetStatus(), message.GetTotalPriceMinorUnits(), message.GetCurrency())
	if err != nil {
		return err
	}
	if result.RowsAffected() != 0 {
		return nil
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO pending_customer_activities(user_id,booking_id,provider_id,branch_id,booking_date,status,total_price_minor_units,currency,created_at,updated_at)
		VALUES($1,$2,$4,$5,$6,$7,$8,$9,$3,$3)
		ON CONFLICT(booking_id) DO UPDATE
		SET user_id=EXCLUDED.user_id,
			provider_id=EXCLUDED.provider_id,branch_id=EXCLUDED.branch_id,booking_date=EXCLUDED.booking_date,status=EXCLUDED.status,
			total_price_minor_units=EXCLUDED.total_price_minor_units,currency=EXCLUDED.currency,
			created_at=LEAST(pending_customer_activities.created_at,EXCLUDED.created_at),
			updated_at=GREATEST(pending_customer_activities.updated_at,EXCLUDED.updated_at)`, userID, bookingID, occurredAt, providerID, branchID, bookingDate, message.GetStatus(), message.GetTotalPriceMinorUnits(), message.GetCurrency())
	return err
}

func writeCustomerEvent(ctx context.Context, tx pgx.Tx, customerID, userID int64, status, eventType string) error {
	id := uuid.New()
	now := time.Now().UTC()
	message := &customereventsv1.CustomerChanged{Metadata: &eventscommonv1.EventMetadata{EventId: id.String(), EventVersion: 1, OccurredAt: timestamppb.New(now), Producer: "customer-service", AggregateId: strconv.FormatInt(customerID, 10)}, CustomerId: strconv.FormatInt(customerID, 10), UserId: strconv.FormatInt(userID, 10), Status: status, ChangeType: eventType}
	payload, err := proto.Marshal(message)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,occurred_at) VALUES($1,'customer',$2,$3,1,$4,'{"content-type":"application/protobuf"}'::jsonb,$5)`, id, strconv.FormatInt(customerID, 10), eventType, payload, now)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
