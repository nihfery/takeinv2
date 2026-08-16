package consumer

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	billingeventsv1 "github.com/nihfery/takein/gen/go/takein/events/billing/v1"
	bookingeventsv1 "github.com/nihfery/takein/gen/go/takein/events/booking/v1"
	paymenteventsv1 "github.com/nihfery/takein/gen/go/takein/events/payment/v1"
	providereventsv1 "github.com/nihfery/takein/gen/go/takein/events/provider/v1"
	takeinkafka "github.com/nihfery/takein/libs/go/kafka"
	"github.com/twmb/franz-go/pkg/kgo"
	"google.golang.org/protobuf/proto"
)

type Processor struct {
	pool       *pgxpool.Pool
	client     *kgo.Client
	dlq        string
	maxRetries int
}

func New(pool *pgxpool.Pool, client *kgo.Client, dlq string, maxRetries int) *Processor {
	return &Processor{pool: pool, client: client, dlq: dlq, maxRetries: maxRetries}
}
func (p *Processor) Run(ctx context.Context) error {
	for {
		fetches := p.client.PollFetches(ctx)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if errs := fetches.Errors(); len(errs) > 0 {
			takeinkafka.ObserveConsumeError("notification-service-worker", errs[0].Topic)
			return errs[0].Err
		}
		iter := fetches.RecordIter()
		for !iter.Done() {
			record := iter.Next()
			if err := p.process(ctx, record); err != nil {
				takeinkafka.ObserveConsumeError("notification-service-worker", record.Topic)
				if retryErr := p.retry(ctx, record, err); retryErr != nil {
					return retryErr
				}
			}
			if err := p.client.CommitRecords(ctx, record); err != nil {
				return err
			}
		}
	}
}
func (p *Processor) process(ctx context.Context, record *kgo.Record) error {
	eventIDText := header(record, "event_id")
	eventID, err := uuid.Parse(eventIDText)
	if err != nil {
		return errors.New("event_id header is missing or invalid")
	}
	eventType := header(record, "event_type")
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	result, err := tx.Exec(ctx, `INSERT INTO inbox_events(event_id,topic,partition_id,offset_id,event_type)VALUES($1,$2,$3,$4,$5)ON CONFLICT DO NOTHING`, eventID, record.Topic, record.Partition, record.Offset, eventType)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return tx.Commit(ctx)
	}
	switch record.Topic {
	case "takein.booking.events.v1":
		message := &bookingeventsv1.BookingChanged{}
		if err = proto.Unmarshal(record.Value, message); err != nil {
			return err
		}
		userID, parseErr := strconv.ParseInt(message.CustomerId, 10, 64)
		if parseErr == nil && userID > 0 {
			data, _ := json.Marshal(map[string]any{"booking_id": message.BookingId, "booking_code": message.BookingCode, "status": message.Status})
			err = insertNotification(ctx, tx, userID, "booking_update", "Booking updated", fmt.Sprintf("Booking %s is now %s", message.BookingCode, message.Status), "/bookings/"+message.BookingCode, data)
			if err != nil {
				return err
			}
		}
	case "takein.payment.events.v1":
		message := &paymenteventsv1.PaymentChanged{}
		if err = proto.Unmarshal(record.Value, message); err != nil {
			return err
		}
		userID, parseErr := strconv.ParseInt(message.GetCustomerId(), 10, 64)
		if parseErr == nil && userID > 0 {
			data, _ := json.Marshal(map[string]any{"payment_id": message.GetPaymentId(), "booking_id": message.GetBookingId(), "status": message.GetStatus()})
			err = insertNotification(ctx, tx, userID, "payment_update", "Payment updated", fmt.Sprintf("Payment is now %s", message.GetStatus()), "/bookings", data)
			if err != nil {
				return err
			}
		}
	case "takein.billing.events.v1":
		message := &billingeventsv1.SubscriptionChanged{}
		if err = proto.Unmarshal(record.Value, message); err != nil {
			return err
		}
		providerID, parseErr := strconv.ParseInt(message.GetProviderId(), 10, 64)
		if parseErr == nil && providerID > 0 {
			var userID int64
			if err = tx.QueryRow(ctx, `SELECT user_id FROM provider_recipient_projection WHERE provider_id=$1`, providerID).Scan(&userID); err != nil {
				return fmt.Errorf("resolve provider notification recipient: %w", err)
			}
			data, _ := json.Marshal(map[string]any{"subscription_id": message.GetSubscriptionId(), "status": message.GetStatus()})
			err = insertNotification(ctx, tx, userID, "subscription_update", "Subscription updated", fmt.Sprintf("Subscription is now %s", message.GetStatus()), "/provider/subscriptions", data)
			if err != nil {
				return err
			}
		}
	case "takein.provider.events.v1":
		if strings.HasPrefix(eventType, "provider.role_") {
			// Role events do not identify the provider owner's notification
			// recipient and must never overwrite that projection.
			break
		}
		message := &providereventsv1.ProviderChanged{}
		if err = proto.Unmarshal(record.Value, message); err != nil {
			return err
		}
		providerID, parseErr := strconv.ParseInt(message.GetProviderId(), 10, 64)
		if parseErr != nil || providerID <= 0 {
			return errors.New("provider event has an invalid provider_id")
		}
		if eventType == "provider.deleted" {
			if _, err = tx.Exec(ctx, `DELETE FROM provider_recipient_projection WHERE provider_id=$1`, providerID); err != nil {
				return err
			}
			break
		}
		userID, parseErr := strconv.ParseInt(message.GetUserId(), 10, 64)
		if parseErr != nil || userID <= 0 {
			// Branch and staff events share this topic but do not carry identity
			// recipient data; only provider aggregate events update the mapping.
			break
		}
		if _, err = tx.Exec(ctx, `INSERT INTO provider_recipient_projection(provider_id,user_id) VALUES($1,$2) ON CONFLICT(provider_id) DO UPDATE SET user_id=EXCLUDED.user_id,updated_at=now()`, providerID, userID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (p *Processor) Process(ctx context.Context, record *kgo.Record) error {
	return p.process(ctx, record)
}
func insertNotification(ctx context.Context, tx pgx.Tx, userID int64, notificationType, title, body, url string, data []byte) error {
	var notificationID int64
	err := tx.QueryRow(ctx, `INSERT INTO notifications(user_id,type,title,body,url,data)VALUES($1,$2,$3,$4,$5,$6::jsonb)RETURNING id`, userID, notificationType, title, body, url, string(data)).Scan(&notificationID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO delivery_attempts(id,notification_id,channel,status,attempt_count,next_attempt_at)VALUES($1,$2,'in_app','sent',1,NULL)`, uuid.New(), notificationID)
	return err
}
func (p *Processor) retry(ctx context.Context, record *kgo.Record, failure error) error {
	count, _ := strconv.Atoi(header(record, "retry_count"))
	topic := record.Topic
	if count >= p.maxRetries {
		topic = record.Topic + ".dlq"
		if p.dlq != "" && record.Topic == "takein.notification.events.v1" {
			topic = p.dlq
		}
	}
	copyRecord := &kgo.Record{Topic: topic, Key: record.Key, Value: record.Value, Headers: append([]kgo.RecordHeader{}, record.Headers...)}
	copyRecord.Headers = append(copyRecord.Headers, kgo.RecordHeader{Key: "retry_count", Value: []byte(strconv.Itoa(count + 1))}, kgo.RecordHeader{Key: "failure", Value: []byte(trim(failure.Error(), 500))})
	return p.client.ProduceSync(ctx, copyRecord).FirstErr()
}
func header(record *kgo.Record, key string) string {
	for index := len(record.Headers) - 1; index >= 0; index-- {
		if record.Headers[index].Key == key {
			return string(record.Headers[index].Value)
		}
	}
	return ""
}
func trim(value string, max int) string {
	if len(value) > max {
		return value[:max]
	}
	return value
}
