package postgres

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	billingeventsv1 "github.com/nihfery/takein/gen/go/takein/events/billing/v1"
	eventscommonv1 "github.com/nihfery/takein/gen/go/takein/events/common/v1"
	"github.com/nihfery/takein/services/billing-service/internal/billing"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type Repository struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }
func (r *Repository) Plans(ctx context.Context) ([]billing.Plan, error) {
	rows, err := r.pool.Query(ctx, `SELECT id,name,description,round(price*100)::bigint,duration_days,max_branches,is_active FROM subscription_plans WHERE is_active ORDER BY price,id LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []billing.Plan{}
	for rows.Next() {
		var value billing.Plan
		if err = rows.Scan(&value.ID, &value.Name, &value.Description, &value.PriceMinor, &value.DurationDays, &value.MaxBranches, &value.Active); err != nil {
			return nil, err
		}
		items = append(items, value)
	}
	return items, rows.Err()
}
func (r *Repository) Plan(ctx context.Context, id int64) (billing.Plan, error) {
	var value billing.Plan
	err := r.pool.QueryRow(ctx, `SELECT id,name,description,round(price*100)::bigint,duration_days,max_branches,is_active FROM subscription_plans WHERE id=$1 AND is_active`, id).Scan(&value.ID, &value.Name, &value.Description, &value.PriceMinor, &value.DurationDays, &value.MaxBranches, &value.Active)
	return value, translate(err)
}
func (r *Repository) Trial(ctx context.Context, id int64) (billing.Trial, error) {
	var value billing.Trial
	err := r.pool.QueryRow(ctx, `SELECT provider_id,starts_at,ends_at FROM provider_trials WHERE provider_id=$1`, id).Scan(&value.ProviderID, &value.StartsAt, &value.EndsAt)
	return value, translate(err)
}
func (r *Repository) CurrentSubscription(ctx context.Context, id int64) (billing.Subscription, error) {
	return scanSubscription(r.pool.QueryRow(ctx, `SELECT id,provider_id,plan_id,plan_name,round(price*100)::bigint,duration_days,max_branches,payment_status,subscription_status,starts_at,ends_at,midtrans_order_id FROM provider_subscriptions WHERE provider_id=$1 ORDER BY (subscription_status='active')DESC,ends_at DESC NULLS LAST,created_at DESC LIMIT 1`, id))
}
func (r *Repository) CreatePurchase(ctx context.Context, providerID int64, plan billing.Plan) (billing.Subscription, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return billing.Subscription{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, providerID); err != nil {
		return billing.Subscription{}, err
	}
	existing, findErr := scanSubscription(tx.QueryRow(ctx, `SELECT id,provider_id,plan_id,plan_name,round(price*100)::bigint,duration_days,max_branches,payment_status,subscription_status,starts_at,ends_at,midtrans_order_id FROM provider_subscriptions WHERE provider_id=$1 AND payment_status='pending' AND subscription_status='inactive' AND superseded_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE`, providerID))
	if findErr == nil {
		if existing.PlanID == nil || *existing.PlanID != plan.ID {
			return billing.Subscription{}, billing.ErrConflict
		}
		if err = tx.Commit(ctx); err != nil {
			return billing.Subscription{}, err
		}
		return existing, nil
	}
	if !errors.Is(findErr, billing.ErrNotFound) {
		return billing.Subscription{}, findErr
	}
	value, err := scanSubscription(tx.QueryRow(ctx, `INSERT INTO provider_subscriptions(provider_id,plan_id,plan_name,price,currency,duration_days,max_branches,payment_status,subscription_status)VALUES($1,$2,$3,$4::numeric/100,'IDR',$5,$6,'pending','inactive')RETURNING id,provider_id,plan_id,plan_name,round(price*100)::bigint,duration_days,max_branches,payment_status,subscription_status,starts_at,ends_at,midtrans_order_id`, providerID, plan.ID, plan.Name, plan.PriceMinor, plan.DurationDays, plan.MaxBranches))
	if err != nil {
		return billing.Subscription{}, err
	}
	if err = writeOutbox(ctx, tx, value, "billing.subscription_purchase_started"); err != nil {
		return billing.Subscription{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return billing.Subscription{}, err
	}
	return value, nil
}

func (r *Repository) AttachCharge(ctx context.Context, subscriptionID int64, charge billing.PaymentCharge) (billing.Subscription, error) {
	return scanSubscription(r.pool.QueryRow(ctx, `UPDATE provider_subscriptions SET midtrans_order_id=$2,deeplink_url=NULLIF($3,''),gateway_expires_at=NULLIF($4,'')::timestamptz,payment_channel=NULLIF($5,''),updated_at=now() WHERE id=$1 RETURNING id,provider_id,plan_id,plan_name,round(price*100)::bigint,duration_days,max_branches,payment_status,subscription_status,starts_at,ends_at,midtrans_order_id`, subscriptionID, charge.OrderID, charge.RedirectURL, charge.ExpiresAt, charge.PaymentChannel))
}

func (r *Repository) ApplyPaymentState(ctx context.Context, input billing.PaymentStateInput) (billing.Subscription, bool, error) {
	eventID, err := uuid.Parse(input.EventID)
	if err != nil || input.SubscriptionID <= 0 || input.ProviderID <= 0 {
		return billing.Subscription{}, false, billing.ErrNotFound
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return billing.Subscription{}, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	result, err := tx.Exec(ctx, `INSERT INTO inbox_events(event_id,topic,partition_id,offset_id,event_type) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, eventID, input.Topic, input.Partition, input.Offset, input.EventType)
	if err != nil {
		return billing.Subscription{}, false, err
	}
	value, err := scanSubscription(tx.QueryRow(ctx, `SELECT id,provider_id,plan_id,plan_name,round(price*100)::bigint,duration_days,max_branches,payment_status,subscription_status,starts_at,ends_at,midtrans_order_id FROM provider_subscriptions WHERE id=$1 AND provider_id=$2 FOR UPDATE`, input.SubscriptionID, input.ProviderID))
	if err != nil {
		return billing.Subscription{}, false, translate(err)
	}
	if result.RowsAffected() == 0 {
		if err = tx.Commit(ctx); err != nil {
			return billing.Subscription{}, false, err
		}
		return value, false, nil
	}
	if value.PriceMinor != input.AmountMinor || input.Currency != "IDR" {
		return billing.Subscription{}, false, errors.New("subscription payment amount or currency mismatch")
	}
	targetPayment, targetSubscription := value.PaymentStatus, value.Status
	eventType := ""
	switch input.Status {
	case "paid":
		targetPayment, targetSubscription, eventType = "paid", "active", "billing.subscription_activated"
	case "failed", "expired", "cancelled":
		targetPayment, targetSubscription, eventType = input.Status, "inactive", "billing.subscription_cancelled"
	case "refunded":
		targetPayment, targetSubscription, eventType = "refunded", "cancelled", "billing.subscription_cancelled"
	case "pending", "unpaid":
	default:
		return billing.Subscription{}, false, errors.New("unsupported subscription payment state")
	}
	applied := targetPayment != value.PaymentStatus || targetSubscription != value.Status
	if applied {
		if targetSubscription == "active" {
			_, err = tx.Exec(ctx, `UPDATE provider_subscriptions SET subscription_status='superseded',superseded_at=now(),updated_at=now() WHERE provider_id=$1 AND id<>$2 AND subscription_status='active'`, value.ProviderID, value.ID)
			if err != nil {
				return billing.Subscription{}, false, err
			}
		}
		value, err = scanSubscription(tx.QueryRow(ctx, `UPDATE provider_subscriptions SET payment_status=$2,subscription_status=$3,starts_at=CASE WHEN $3='active' THEN COALESCE(starts_at,now()) ELSE starts_at END,ends_at=CASE WHEN $3='active' THEN COALESCE(ends_at,now()+(duration_days*interval '1 day')) ELSE ends_at END,paid_at=CASE WHEN $2='paid' THEN COALESCE(paid_at,now()) ELSE paid_at END,updated_at=now() WHERE id=$1 RETURNING id,provider_id,plan_id,plan_name,round(price*100)::bigint,duration_days,max_branches,payment_status,subscription_status,starts_at,ends_at,midtrans_order_id`, value.ID, targetPayment, targetSubscription))
		if err != nil {
			return billing.Subscription{}, false, err
		}
		if err = writeOutbox(ctx, tx, value, eventType); err != nil {
			return billing.Subscription{}, false, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return billing.Subscription{}, false, err
	}
	return value, applied, nil
}

func writeOutbox(ctx context.Context, tx pgx.Tx, value billing.Subscription, eventType string) error {
	eventID := uuid.New()
	now := time.Now().UTC()
	message := &billingeventsv1.SubscriptionChanged{Metadata: &eventscommonv1.EventMetadata{EventId: eventID.String(), EventVersion: 1, OccurredAt: timestamppb.New(now), Producer: "billing-service", AggregateId: strconv.FormatInt(value.ID, 10)}, SubscriptionId: strconv.FormatInt(value.ID, 10), ProviderId: strconv.FormatInt(value.ProviderID, 10), Status: value.Status, ChangeType: eventType}
	payload, err := proto.Marshal(message)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,occurred_at) VALUES($1,'subscription',$2,$3,1,$4,'{"content-type":"application/protobuf"}'::jsonb,$5)`, eventID, fmt.Sprint(value.ID), eventType, payload, now)
	return err
}

type rowScanner interface{ Scan(...any) error }

func scanSubscription(row rowScanner) (billing.Subscription, error) {
	var value billing.Subscription
	err := row.Scan(&value.ID, &value.ProviderID, &value.PlanID, &value.PlanName, &value.PriceMinor, &value.DurationDays, &value.MaxBranches, &value.PaymentStatus, &value.Status, &value.StartsAt, &value.EndsAt, &value.OrderID)
	return value, translate(err)
}
func translate(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return billing.ErrNotFound
	}
	return err
}
