package kafkaconsumer

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"
)

func TestSanitizeBoundsAndFlattensFailure(t *testing.T) {
	value := sanitize(errors.New("secret\n" + strings.Repeat("x", 800)))
	if strings.Contains(value, "\n") || len(value) != 512 {
		t.Fatalf("unexpected sanitized failure length=%d value=%q", len(value), value)
	}
}

func TestRetryRecordPreservesSourceUntilBudgetIsExhausted(t *testing.T) {
	failedAt := time.Date(2026, time.August, 16, 9, 30, 0, 123, time.UTC)
	source := &kgo.Record{
		Topic:     "takein.booking.events.v1",
		Partition: 3,
		Offset:    42,
		Key:       []byte("booking-1"),
		Value:     []byte("payload"),
		Headers: []kgo.RecordHeader{
			{Key: "traceparent", Value: []byte("trace-value")},
			{Key: "attempts", Value: []byte("1")},
		},
	}

	retry := retryRecord(source, errors.New("temporary\npostgres failure"), "booking-consumer-v1", "", 2, failedAt)
	if retry.Topic != source.Topic {
		t.Fatalf("retry topic = %q, want %q", retry.Topic, source.Topic)
	}
	if got := Header(retry, "attempts"); got != "2" {
		t.Fatalf("attempts = %q, want 2", got)
	}
	if got := Header(retry, "sanitized_error"); got != "temporary postgres failure" {
		t.Fatalf("sanitized_error = %q", got)
	}
	if got := Header(retry, "failed_at"); got != failedAt.Format(time.RFC3339Nano) {
		t.Fatalf("failed_at = %q", got)
	}
	if got := Header(retry, "consumer_group"); got != "booking-consumer-v1" {
		t.Fatalf("consumer_group = %q", got)
	}
	if got := Header(retry, "partition"); got != "3" {
		t.Fatalf("partition = %q", got)
	}
	if got := Header(retry, "offset"); got != "42" {
		t.Fatalf("offset = %q", got)
	}
	if got := Header(retry, "traceparent"); got != "trace-value" {
		t.Fatalf("traceparent = %q", got)
	}
	if got := Header(source, "attempts"); got != "1" {
		t.Fatalf("source record was mutated: attempts = %q", got)
	}
}

func TestRetryRecordMovesToPerSourceDLQAfterBudget(t *testing.T) {
	source := &kgo.Record{
		Topic:   "takein.payment.events.v1",
		Key:     []byte("payment-1"),
		Value:   []byte("payload"),
		Headers: []kgo.RecordHeader{{Key: "attempts", Value: []byte("2")}},
	}

	dlq := retryRecord(source, errors.New("poison event"), "payment-consumer-v1", "", 2, time.Unix(0, 0))
	if dlq.Topic != "takein.payment.events.v1.dlq" {
		t.Fatalf("DLQ topic = %q", dlq.Topic)
	}
	if got := Header(dlq, "attempts"); got != "3" {
		t.Fatalf("attempts = %q, want 3", got)
	}
	if got := Header(dlq, "original_topic"); got != source.Topic {
		t.Fatalf("original_topic = %q", got)
	}

	override := retryRecord(source, errors.New("poison event"), "payment-consumer-v1", "custom.payment.dlq", 2, time.Unix(0, 0))
	if override.Topic != "custom.payment.dlq" {
		t.Fatalf("configured DLQ topic = %q", override.Topic)
	}
}
