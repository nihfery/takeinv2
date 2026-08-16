package kafkaconsumer

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	takeinkafka "github.com/nihfery/takein/libs/go/kafka"
	"github.com/twmb/franz-go/pkg/kgo"
)

type Handler func(context.Context, *kgo.Record) error

type Runner struct {
	Client        *kgo.Client
	Service       string
	ConsumerGroup string
	DLQTopic      string
	MaxRetries    int
	Handle        Handler
}

func (r Runner) Run(ctx context.Context) error {
	if r.MaxRetries < 0 {
		r.MaxRetries = 0
	}
	for {
		fetches := r.Client.PollFetches(ctx)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if failures := fetches.Errors(); len(failures) > 0 {
			takeinkafka.ObserveConsumeError(r.Service, failures[0].Topic)
			return failures[0].Err
		}
		iterator := fetches.RecordIter()
		for !iterator.Done() {
			record := iterator.Next()
			if err := r.Handle(ctx, record); err != nil {
				takeinkafka.ObserveConsumeError(r.Service, record.Topic)
				if retryErr := r.retry(ctx, record, err); retryErr != nil {
					return retryErr
				}
			}
			if err := r.Client.CommitRecords(ctx, record); err != nil {
				takeinkafka.ObserveConsumeError(r.Service, record.Topic)
				return err
			}
		}
	}
}

func (r Runner) retry(ctx context.Context, record *kgo.Record, failure error) error {
	copyRecord := retryRecord(record, failure, r.ConsumerGroup, r.DLQTopic, r.MaxRetries, time.Now().UTC())
	return r.Client.ProduceSync(ctx, copyRecord).FirstErr()
}

func retryRecord(record *kgo.Record, failure error, consumerGroup, dlqTopic string, maxRetries int, failedAt time.Time) *kgo.Record {
	attempts, _ := strconv.Atoi(Header(record, "attempts"))
	attempts++
	originalTopic := Header(record, "original_topic")
	if originalTopic == "" {
		originalTopic = record.Topic
	}
	topic := originalTopic
	toDLQ := attempts > maxRetries
	if toDLQ {
		topic = dlqTopic
		if topic == "" {
			topic = originalTopic + ".dlq"
		}
	}
	headers := copyHeaders(record.Headers, "attempts", "retry_count", "sanitized_error", "failure", "original_topic", "partition", "offset", "consumer_group", "failed_at")
	headers = append(headers,
		kgo.RecordHeader{Key: "original_topic", Value: []byte(originalTopic)},
		kgo.RecordHeader{Key: "partition", Value: []byte(strconv.Itoa(int(record.Partition)))},
		kgo.RecordHeader{Key: "offset", Value: []byte(strconv.FormatInt(record.Offset, 10))},
		kgo.RecordHeader{Key: "consumer_group", Value: []byte(consumerGroup)},
		kgo.RecordHeader{Key: "failed_at", Value: []byte(failedAt.UTC().Format(time.RFC3339Nano))},
		kgo.RecordHeader{Key: "attempts", Value: []byte(strconv.Itoa(attempts))},
		kgo.RecordHeader{Key: "sanitized_error", Value: []byte(sanitize(failure))},
	)
	return &kgo.Record{Topic: topic, Key: append([]byte(nil), record.Key...), Value: append([]byte(nil), record.Value...), Headers: headers}
}

func Header(record *kgo.Record, key string) string {
	for index := len(record.Headers) - 1; index >= 0; index-- {
		if record.Headers[index].Key == key {
			return string(record.Headers[index].Value)
		}
	}
	return ""
}

func copyHeaders(source []kgo.RecordHeader, excluded ...string) []kgo.RecordHeader {
	skip := make(map[string]bool, len(excluded))
	for _, key := range excluded {
		skip[key] = true
	}
	result := make([]kgo.RecordHeader, 0, len(source)+7)
	for _, header := range source {
		if !skip[header.Key] {
			result = append(result, kgo.RecordHeader{Key: header.Key, Value: append([]byte(nil), header.Value...)})
		}
	}
	return result
}

func sanitize(failure error) string {
	if failure == nil {
		return "unknown consumer failure"
	}
	message := strings.Join(strings.Fields(failure.Error()), " ")
	if len(message) > 512 {
		message = message[:512]
	}
	return message
}

func IsStopped(err error) bool { return errors.Is(err, context.Canceled) }
