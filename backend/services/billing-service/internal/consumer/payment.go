package consumer

import (
	"context"
	"strconv"

	paymenteventsv1 "github.com/nihfery/takein/gen/go/takein/events/payment/v1"
	takeinkafka "github.com/nihfery/takein/libs/go/kafka"
	"github.com/nihfery/takein/services/billing-service/internal/billing"
	postgresrepo "github.com/nihfery/takein/services/billing-service/internal/persistence/postgres"
	"github.com/twmb/franz-go/pkg/kgo"
	"google.golang.org/protobuf/proto"
)

type PaymentProcessor struct {
	repository *postgresrepo.Repository
	client     *kgo.Client
	dlq        string
	maxRetries int
}

func NewPaymentProcessor(repository *postgresrepo.Repository, client *kgo.Client, dlq string, maxRetries int) *PaymentProcessor {
	return &PaymentProcessor{repository: repository, client: client, dlq: dlq, maxRetries: maxRetries}
}

func (p *PaymentProcessor) Run(ctx context.Context) error {
	for {
		fetches := p.client.PollFetches(ctx)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if failures := fetches.Errors(); len(failures) > 0 {
			takeinkafka.ObserveConsumeError("billing-service-worker", failures[0].Topic)
			return failures[0].Err
		}
		iterator := fetches.RecordIter()
		for !iterator.Done() {
			record := iterator.Next()
			if err := p.process(ctx, record); err != nil {
				takeinkafka.ObserveConsumeError("billing-service-worker", record.Topic)
				if err = retry(ctx, p.client, record, p.dlq, p.maxRetries, err); err != nil {
					return err
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
	if message.GetSubscriptionId() == "" {
		return nil
	}
	paymentID, err := strconv.ParseInt(message.GetPaymentId(), 10, 64)
	if err != nil {
		return err
	}
	subscriptionID, err := strconv.ParseInt(message.GetSubscriptionId(), 10, 64)
	if err != nil {
		return err
	}
	providerID, err := strconv.ParseInt(message.GetProviderId(), 10, 64)
	if err != nil {
		return err
	}
	_, _, err = p.repository.ApplyPaymentState(ctx, billing.PaymentStateInput{EventID: recordHeader(record, "event_id"), EventType: recordHeader(record, "event_type"), Status: message.GetStatus(), Currency: message.GetCurrency(), Topic: record.Topic, PaymentID: paymentID, SubscriptionID: subscriptionID, ProviderID: providerID, AmountMinor: message.GetAmountMinorUnits(), Partition: record.Partition, Offset: record.Offset})
	return err
}

func (p *PaymentProcessor) Process(ctx context.Context, record *kgo.Record) error {
	return p.process(ctx, record)
}

func retry(ctx context.Context, client *kgo.Client, record *kgo.Record, dlq string, maxRetries int, failure error) error {
	count, _ := strconv.Atoi(recordHeader(record, "retry_count"))
	topic := record.Topic
	if count >= maxRetries {
		topic = dlq
	}
	copyRecord := &kgo.Record{Topic: topic, Key: record.Key, Value: record.Value, Headers: append([]kgo.RecordHeader{}, record.Headers...)}
	copyRecord.Headers = append(copyRecord.Headers, kgo.RecordHeader{Key: "retry_count", Value: []byte(strconv.Itoa(count + 1))}, kgo.RecordHeader{Key: "failure", Value: []byte(failure.Error())})
	return client.ProduceSync(ctx, copyRecord).FirstErr()
}

func recordHeader(record *kgo.Record, key string) string {
	for index := len(record.Headers) - 1; index >= 0; index-- {
		if record.Headers[index].Key == key {
			return string(record.Headers[index].Value)
		}
	}
	return ""
}
