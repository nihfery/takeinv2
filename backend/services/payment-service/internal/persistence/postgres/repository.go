package postgres

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	eventscommonv1 "github.com/nihfery/takein/gen/go/takein/events/common/v1"
	paymenteventsv1 "github.com/nihfery/takein/gen/go/takein/events/payment/v1"
	"github.com/nihfery/takein/services/payment-service/internal/payment"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type Repository struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

const columns = `id,COALESCE(booking_id,0),subscription_id,provider_id,branch_id,customer_id,payment_type,round(amount*100)::bigint,currency,status,payment_method,idempotency_key,paid_at,created_at,updated_at`
const joinedColumns = `p.id,COALESCE(p.booking_id,0),p.subscription_id,p.provider_id,p.branch_id,p.customer_id,p.payment_type,round(p.amount*100)::bigint,p.currency,p.status,p.payment_method,p.idempotency_key,p.paid_at,p.created_at,p.updated_at`

func (r *Repository) CreateCharge(ctx context.Context, input payment.ChargeInput, gateway payment.GatewayResponse) (payment.Charge, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return payment.Charge{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	query := `INSERT INTO payments(booking_id,customer_id,payment_type,amount,currency,status,payment_method,idempotency_key,subscription_id,provider_id,branch_id) VALUES(NULLIF($1,0),NULLIF($2,0),$3,$4::numeric/100,COALESCE(NULLIF($5,''),'IDR'),'pending',$6,$7,NULLIF($8,0),NULLIF($9,0),NULLIF($10,0))`
	if input.SubscriptionID > 0 {
		query += ` ON CONFLICT(provider_id,subscription_id) WHERE subscription_id IS NOT NULL DO UPDATE SET updated_at=payments.updated_at`
	} else {
		query += ` ON CONFLICT(customer_id,idempotency_key) DO UPDATE SET updated_at=payments.updated_at`
	}
	query += ` RETURNING ` + columns
	value, err := scanPayment(tx.QueryRow(ctx, query, input.BookingID, input.CustomerID, input.PaymentType, input.AmountMinor, input.Currency, input.PaymentMethod, input.IdempotencyKey, input.SubscriptionID, input.ProviderID, input.BranchID))
	if err != nil {
		return payment.Charge{}, translate(err)
	}
	raw := string(gateway.Raw)
	if !json.Valid([]byte(raw)) {
		raw = `{}`
	}
	_, err = tx.Exec(ctx, `INSERT INTO payment_gateway_transactions(payment_id,gateway,payment_channel,provider_order_id,provider_transaction_id,provider_status,deeplink_url,expires_at,raw_response)VALUES($1,'midtrans',$2,$3,$4,$5,$6,$7,$8::jsonb)ON CONFLICT(provider_order_id)DO UPDATE SET provider_status=EXCLUDED.provider_status,raw_response=EXCLUDED.raw_response,updated_at=now()`, value.ID, nullable(input.PaymentChannel), gateway.OrderID, nullable(gateway.TransactionID), gateway.Status, nullable(gateway.RedirectURL), gateway.ExpiresAt, raw)
	if err != nil {
		return payment.Charge{}, err
	}
	if err = outbox(ctx, tx, value, "payment.created"); err != nil {
		return payment.Charge{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return payment.Charge{}, err
	}
	value.PaymentChannel = input.PaymentChannel
	return payment.Charge{Payment: value, OrderID: gateway.OrderID, RedirectURL: gateway.RedirectURL, Token: gateway.Token, ExpiresAt: gateway.ExpiresAt, PaymentChannel: input.PaymentChannel}, nil
}

func (r *Repository) ChargeByIdempotency(ctx context.Context, input payment.ChargeInput) (payment.Charge, error) {
	query := `SELECT ` + joinedColumns + `,COALESCE(g.provider_order_id,''),COALESCE(g.deeplink_url,''),g.expires_at,COALESCE(g.payment_channel,''),COALESCE(g.raw_response,'{}'::jsonb)
		FROM payments p JOIN payment_gateway_transactions g ON g.payment_id=p.id`
	args := []any{}
	if input.SubscriptionID > 0 {
		query += ` WHERE p.provider_id=$1 AND p.subscription_id=$2`
		args = append(args, input.ProviderID, input.SubscriptionID)
	} else {
		query += ` WHERE p.customer_id=$1 AND p.idempotency_key=$2`
		args = append(args, input.CustomerID, input.IdempotencyKey)
	}
	return scanCharge(r.pool.QueryRow(ctx, query, args...))
}

func (r *Repository) LockCharge(ctx context.Context, scope string) (func(), error) {
	connection, err := r.pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	if _, err = connection.Exec(ctx, `SELECT pg_advisory_lock(hashtextextended($1::text,0))`, scope); err != nil {
		connection.Release()
		return nil, err
	}
	var once sync.Once
	return func() {
		once.Do(func() {
			unlockContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_, _ = connection.Exec(unlockContext, `SELECT pg_advisory_unlock(hashtextextended($1::text,0))`, scope)
			connection.Release()
		})
	}, nil
}

func (r *Repository) ByBooking(ctx context.Context, bookingID int64) (payment.Payment, error) {
	return scanPayment(r.pool.QueryRow(ctx, `SELECT `+columns+` FROM payments WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1`, bookingID))
}

func (r *Repository) ByID(ctx context.Context, paymentID int64) (payment.Payment, error) {
	return scanPayment(r.pool.QueryRow(ctx, `SELECT `+columns+` FROM payments WHERE id=$1`, paymentID))
}

func (r *Repository) ListProvider(ctx context.Context, filter payment.ProviderFilter) ([]payment.Payment, error) {
	rows, err := r.pool.Query(ctx, `SELECT `+columns+` FROM payments
		WHERE provider_id=$1 AND ($2::bigint IS NULL OR branch_id=$2)
		  AND (NULLIF($3,'') IS NULL OR status=$3)
		  AND (NULLIF($4,'') IS NULL OR payment_type=$4)
		ORDER BY created_at DESC,id DESC LIMIT 500`, filter.ProviderID, filter.BranchID, filter.Status, filter.PaymentType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []payment.Payment{}
	for rows.Next() {
		value, scanErr := scanPayment(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		items = append(items, value)
	}
	return items, rows.Err()
}

func (r *Repository) ManualConfirm(ctx context.Context, bookingID, customerID int64) (payment.Payment, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return payment.Payment{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	value, err := scanPayment(tx.QueryRow(ctx, `SELECT `+columns+` FROM payments WHERE booking_id=$1 AND customer_id=$2 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, bookingID, customerID))
	if err != nil {
		return payment.Payment{}, translate(err)
	}
	if value.PaymentType == "pay_at_salon" {
		return payment.Payment{}, payment.ErrPayAtSalon
	}
	if value.Status == "paid" {
		return payment.Payment{}, payment.ErrAlreadyPaid
	}
	if !payment.CanTransition(value.Status, "paid") {
		return payment.Payment{}, payment.ErrInvalidTransition
	}
	value, err = scanPayment(tx.QueryRow(ctx, `UPDATE payments SET status='paid',paid_at=COALESCE(paid_at,now()),updated_at=now() WHERE id=$1 RETURNING `+columns, value.ID))
	if err != nil {
		return payment.Payment{}, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO payment_gateway_transactions(payment_id,gateway,provider_status) VALUES($1,'manual','manually_confirmed') ON CONFLICT(payment_id) DO UPDATE SET gateway='manual',provider_status='manually_confirmed',expires_at=NULL,updated_at=now()`, value.ID)
	if err != nil {
		return payment.Payment{}, err
	}
	if err = outbox(ctx, tx, value, "payment.paid"); err != nil {
		return payment.Payment{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return payment.Payment{}, err
	}
	return value, nil
}

func (r *Repository) ExpirePending(ctx context.Context, before time.Time) (int64, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	rows, err := tx.Query(ctx, `SELECT `+joinedColumns+` FROM payments p
		JOIN payment_gateway_transactions g ON g.payment_id=p.id
		WHERE p.status IN ('unpaid','pending') AND g.expires_at IS NOT NULL AND g.expires_at<=$1
		ORDER BY g.expires_at,p.id FOR UPDATE OF p SKIP LOCKED LIMIT 100`, before)
	if err != nil {
		return 0, err
	}
	items := []payment.Payment{}
	for rows.Next() {
		value, scanErr := scanPayment(rows)
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
		items[index], err = scanPayment(tx.QueryRow(ctx, `UPDATE payments SET status='expired',updated_at=now() WHERE id=$1 AND status IN ('unpaid','pending') RETURNING `+columns, items[index].ID))
		if err != nil {
			return 0, err
		}
		if _, err = tx.Exec(ctx, `UPDATE payment_gateway_transactions SET provider_status='expire',updated_at=now() WHERE payment_id=$1`, items[index].ID); err != nil {
			return 0, err
		}
		if err = outbox(ctx, tx, items[index], "payment.expired"); err != nil {
			return 0, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return 0, err
	}
	return int64(len(items)), nil
}

func (r *Repository) ProcessNotification(ctx context.Context, notification payment.Notification, raw []byte) (payment.Payment, bool, error) {
	hash := sha256.Sum256(raw)
	signatureHash := sha256.Sum256([]byte(notification.SignatureKey))
	notificationHash := hex.EncodeToString(hash[:])
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return payment.Payment{}, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	result, err := tx.Exec(ctx, `INSERT INTO webhook_notifications(notification_hash,provider_order_id,provider_transaction_id,transaction_status,signature_key_hash)VALUES($1,$2,$3,$4,$5)ON CONFLICT DO NOTHING`, notificationHash, notification.OrderID, nullable(notification.TransactionID), notification.TransactionStatus, hex.EncodeToString(signatureHash[:]))
	if err != nil {
		return payment.Payment{}, false, err
	}
	if result.RowsAffected() == 0 {
		value, findErr := scanPayment(tx.QueryRow(ctx, `SELECT `+joinedColumns+` FROM payments p JOIN payment_gateway_transactions g ON g.payment_id=p.id WHERE g.provider_order_id=$1`, notification.OrderID))
		if findErr != nil {
			return payment.Payment{}, true, findErr
		}
		if err = tx.Commit(ctx); err != nil {
			return payment.Payment{}, true, err
		}
		return value, true, nil
	}
	value, err := scanPayment(tx.QueryRow(ctx, `SELECT `+joinedColumns+` FROM payments p JOIN payment_gateway_transactions g ON g.payment_id=p.id WHERE g.provider_order_id=$1 FOR UPDATE OF p`, notification.OrderID))
	if err != nil {
		return payment.Payment{}, false, translate(err)
	}
	target, err := payment.StatusFromNotification(notification.TransactionStatus, notification.FraudStatus)
	if err != nil {
		return payment.Payment{}, false, err
	}
	if !payment.CanTransition(value.Status, target) {
		return payment.Payment{}, false, payment.ErrInvalidTransition
	}
	if target != value.Status {
		value, err = scanPayment(tx.QueryRow(ctx, `UPDATE payments SET status=$2,paid_at=CASE WHEN $2='paid' THEN COALESCE(paid_at,now()) ELSE paid_at END,updated_at=now()WHERE id=$1 RETURNING `+columns, value.ID, target))
		if err != nil {
			return payment.Payment{}, false, err
		}
		if err = outbox(ctx, tx, value, "payment."+target); err != nil {
			return payment.Payment{}, false, err
		}
	}
	rawJSON := string(raw)
	if !json.Valid(raw) {
		rawJSON = `{}`
	}
	_, err = tx.Exec(ctx, `UPDATE payment_gateway_transactions SET provider_transaction_id=COALESCE(NULLIF($2,''),provider_transaction_id),provider_status=$3,fraud_status=NULLIF($4,''),raw_notification=$5::jsonb,updated_at=now()WHERE provider_order_id=$1`, notification.OrderID, notification.TransactionID, notification.TransactionStatus, notification.FraudStatus, rawJSON)
	if err != nil {
		return payment.Payment{}, false, err
	}
	_, err = tx.Exec(ctx, `UPDATE webhook_notifications SET processed_at=now(),result_status=$2 WHERE notification_hash=$1`, notificationHash, target)
	if err != nil {
		return payment.Payment{}, false, err
	}
	if err = tx.Commit(ctx); err != nil {
		return payment.Payment{}, false, err
	}
	return value, false, nil
}

func outbox(ctx context.Context, tx pgx.Tx, value payment.Payment, eventType string) error {
	eventID := uuid.New()
	message := &paymenteventsv1.PaymentChanged{Metadata: &eventscommonv1.EventMetadata{EventId: eventID.String(), EventVersion: 1, OccurredAt: timestamppb.Now(), Producer: "payment-service", AggregateId: strconv.FormatInt(value.ID, 10)}, PaymentId: strconv.FormatInt(value.ID, 10), Status: value.Status, ChangeType: eventType, AmountMinorUnits: value.AmountMinor, Currency: value.Currency}
	if value.BookingID > 0 {
		message.BookingId = strconv.FormatInt(value.BookingID, 10)
	}
	if value.CustomerID != nil {
		message.CustomerId = strconv.FormatInt(*value.CustomerID, 10)
	}
	if value.SubscriptionID != nil {
		message.SubscriptionId = strconv.FormatInt(*value.SubscriptionID, 10)
	}
	if value.ProviderID != nil {
		message.ProviderId = strconv.FormatInt(*value.ProviderID, 10)
	}
	payload, err := proto.Marshal(message)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,occurred_at)VALUES($1,'payment',$2,$3,1,$4,'{"content-type":"application/protobuf"}'::jsonb,$5)`, eventID, fmt.Sprint(value.ID), eventType, payload, time.Now().UTC())
	return err
}

type rowScanner interface{ Scan(...any) error }

func scanPayment(row rowScanner) (payment.Payment, error) {
	var value payment.Payment
	err := row.Scan(&value.ID, &value.BookingID, &value.SubscriptionID, &value.ProviderID, &value.BranchID, &value.CustomerID, &value.PaymentType, &value.AmountMinor, &value.Currency, &value.Status, &value.PaymentMethod, &value.IdempotencyKey, &value.PaidAt, &value.CreatedAt, &value.UpdatedAt)
	return value, translate(err)
}

func scanCharge(row rowScanner) (payment.Charge, error) {
	var value payment.Charge
	var raw []byte
	err := row.Scan(&value.Payment.ID, &value.Payment.BookingID, &value.Payment.SubscriptionID, &value.Payment.ProviderID, &value.Payment.BranchID, &value.Payment.CustomerID, &value.Payment.PaymentType, &value.Payment.AmountMinor, &value.Payment.Currency, &value.Payment.Status, &value.Payment.PaymentMethod, &value.Payment.IdempotencyKey, &value.Payment.PaidAt, &value.Payment.CreatedAt, &value.Payment.UpdatedAt, &value.OrderID, &value.RedirectURL, &value.ExpiresAt, &value.PaymentChannel, &raw)
	if err != nil {
		return payment.Charge{}, translate(err)
	}
	value.Payment.PaymentChannel = value.PaymentChannel
	var response struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(raw, &response)
	value.Token = response.Token
	return value, nil
}
func translate(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return payment.ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return payment.ErrConflict
	}
	return err
}
func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}
