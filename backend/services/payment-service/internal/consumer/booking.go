package consumer

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	bookingeventsv1 "github.com/nihfery/takein/gen/go/takein/events/booking/v1"
	eventscommonv1 "github.com/nihfery/takein/gen/go/takein/events/common/v1"
	paymenteventsv1 "github.com/nihfery/takein/gen/go/takein/events/payment/v1"
	"github.com/nihfery/takein/libs/go/kafkaconsumer"
	"github.com/twmb/franz-go/pkg/kgo"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type BookingProcessor struct {
	pool *pgxpool.Pool
}

func NewBookingProcessor(pool *pgxpool.Pool) *BookingProcessor {
	return &BookingProcessor{pool: pool}
}

func (p *BookingProcessor) Process(ctx context.Context, record *kgo.Record) error {
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
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return tx.Commit(ctx)
	}
	if eventType != "booking.created" && eventType != "booking.completed" {
		return tx.Commit(ctx)
	}
	message := &bookingeventsv1.BookingChanged{}
	if err = proto.Unmarshal(record.Value, message); err != nil {
		return err
	}
	// A hold-only booking temporarily uses pay_at_salon until the customer
	// finalizes the actual payment preference. Projecting that transient state
	// would reserve the booking's unique payment row and race with a later
	// Midtrans charge.
	if message.GetPaymentType() != "pay_at_salon" || message.GetStatus() == "pending_hold" {
		return tx.Commit(ctx)
	}
	bookingID, err := strconv.ParseInt(message.GetBookingId(), 10, 64)
	if err != nil || bookingID <= 0 || message.GetTotalPriceMinorUnits() < 0 {
		return errors.New("booking payment projection contains invalid values")
	}
	providerID, _ := strconv.ParseInt(message.GetProviderId(), 10, 64)
	branchID, _ := strconv.ParseInt(message.GetBranchId(), 10, 64)
	customerID, _ := strconv.ParseInt(message.GetCustomerId(), 10, 64)
	status := "unpaid"
	var paidAt *time.Time
	if eventType == "booking.completed" {
		status = "paid"
		now := time.Now().UTC()
		paidAt = &now
	}
	var paymentID int64
	err = tx.QueryRow(ctx, `INSERT INTO payments(booking_id,provider_id,branch_id,customer_id,payment_type,amount,currency,status,payment_method,idempotency_key,paid_at)
		VALUES($1,NULLIF($2,0),NULLIF($3,0),NULLIF($4,0),'pay_at_salon',$5::numeric/100,COALESCE(NULLIF($6,''),'IDR'),$7,'pay_at_salon',$8,$9)
		ON CONFLICT(booking_id) WHERE booking_id IS NOT NULL DO UPDATE SET
			provider_id=COALESCE(EXCLUDED.provider_id,payments.provider_id),branch_id=COALESCE(EXCLUDED.branch_id,payments.branch_id),customer_id=COALESCE(EXCLUDED.customer_id,payments.customer_id),
			amount=EXCLUDED.amount,currency=EXCLUDED.currency,status=CASE WHEN EXCLUDED.status='paid' THEN 'paid' ELSE payments.status END,
			paid_at=CASE WHEN EXCLUDED.status='paid' THEN COALESCE(payments.paid_at,EXCLUDED.paid_at) ELSE payments.paid_at END,updated_at=now()
		RETURNING id`, bookingID, providerID, branchID, customerID, message.GetTotalPriceMinorUnits(), message.GetCurrency(), status, "booking:"+message.GetBookingId(), paidAt).Scan(&paymentID)
	if err != nil {
		return err
	}
	if err = writePaymentEvent(ctx, tx, paymentID, bookingID, providerID, customerID, message.GetTotalPriceMinorUnits(), message.GetCurrency(), status, "payment."+mapEventSuffix(status)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func mapEventSuffix(status string) string {
	if status == "paid" {
		return "paid"
	}
	return "created"
}

func writePaymentEvent(ctx context.Context, tx pgx.Tx, paymentID, bookingID, providerID, customerID, amountMinor int64, currency, status, eventType string) error {
	eventID := uuid.New()
	now := time.Now().UTC()
	message := &paymenteventsv1.PaymentChanged{
		Metadata:  &eventscommonv1.EventMetadata{EventId: eventID.String(), EventVersion: 1, OccurredAt: timestamppb.New(now), Producer: "payment-service", AggregateId: strconv.FormatInt(paymentID, 10)},
		PaymentId: strconv.FormatInt(paymentID, 10), BookingId: strconv.FormatInt(bookingID, 10), Status: status, ChangeType: eventType,
		AmountMinorUnits: amountMinor, Currency: currency,
	}
	if providerID > 0 {
		message.ProviderId = strconv.FormatInt(providerID, 10)
	}
	if customerID > 0 {
		message.CustomerId = strconv.FormatInt(customerID, 10)
	}
	payload, err := proto.Marshal(message)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,occurred_at) VALUES($1,'payment',$2,$3,1,$4,'{"content-type":"application/protobuf"}'::jsonb,$5)`, eventID, strconv.FormatInt(paymentID, 10), eventType, payload, now)
	return err
}
