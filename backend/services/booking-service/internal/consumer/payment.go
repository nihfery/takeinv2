package consumer

import (
	"context"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
	paymenteventsv1 "github.com/nihfery/takein/gen/go/takein/events/payment/v1"
	takeinkafka "github.com/nihfery/takein/libs/go/kafka"
	"github.com/nihfery/takein/services/booking-service/internal/booking"
	postgresrepo "github.com/nihfery/takein/services/booking-service/internal/persistence/postgres"
	"github.com/twmb/franz-go/pkg/kgo"
	"google.golang.org/protobuf/proto"
)

type PaymentProcessor struct {
	pool       *pgxpool.Pool
	client     *kgo.Client
	dlq        string
	maxRetries int
	repository *postgresrepo.Repository
}

func NewPaymentProcessor(pool *pgxpool.Pool, client *kgo.Client, dlq string, maxRetries int) *PaymentProcessor {
	return &PaymentProcessor{pool: pool, client: client, dlq: dlq, maxRetries: maxRetries, repository: postgresrepo.New(pool)}
}
func (p *PaymentProcessor) Run(ctx context.Context) error {
	for {
		fetches := p.client.PollFetches(ctx)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if errs := fetches.Errors(); len(errs) > 0 {
			takeinkafka.ObserveConsumeError("booking-service-worker", errs[0].Topic)
			return errs[0].Err
		}
		iter := fetches.RecordIter()
		for !iter.Done() {
			record := iter.Next()
			if err := p.process(ctx, record); err != nil {
				takeinkafka.ObserveConsumeError("booking-service-worker", record.Topic)
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
func (p *PaymentProcessor) process(ctx context.Context, record *kgo.Record) error {
	message := &paymenteventsv1.PaymentChanged{}
	if err := proto.Unmarshal(record.Value, message); err != nil {
		return err
	}
	if message.GetBookingId() == "" {
		// Subscription payments share the payment topic and are owned by the
		// billing consumer, not the booking state machine.
		return nil
	}
	paymentID, err := strconv.ParseInt(message.PaymentId, 10, 64)
	if err != nil {
		return err
	}
	bookingID, err := strconv.ParseInt(message.BookingId, 10, 64)
	if err != nil {
		return err
	}
	_, _, err = p.repository.ApplyPaymentState(ctx, booking.PaymentStateInput{EventID: header(record, "event_id"), PaymentID: paymentID, BookingID: bookingID, Status: message.Status, AmountMinor: message.AmountMinorUnits, Currency: message.Currency, Topic: record.Topic, Partition: record.Partition, Offset: record.Offset, EventType: header(record, "event_type")})
	return err
}

func (p *PaymentProcessor) Process(ctx context.Context, record *kgo.Record) error {
	return p.process(ctx, record)
}
func (p *PaymentProcessor) retry(ctx context.Context, record *kgo.Record, failure error) error {
	count, _ := strconv.Atoi(header(record, "retry_count"))
	topic := record.Topic
	if count >= p.maxRetries {
		topic = p.dlq
	}
	copyRecord := &kgo.Record{Topic: topic, Key: record.Key, Value: record.Value, Headers: append([]kgo.RecordHeader{}, record.Headers...)}
	copyRecord.Headers = append(copyRecord.Headers, kgo.RecordHeader{Key: "retry_count", Value: []byte(strconv.Itoa(count + 1))}, kgo.RecordHeader{Key: "failure", Value: []byte(failure.Error())})
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
