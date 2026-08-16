package consumer

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	takeinkafka "github.com/nihfery/takein/libs/go/kafka"
	"github.com/twmb/franz-go/pkg/kgo"
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
			takeinkafka.ObserveConsumeError("audit-service-worker", errs[0].Topic)
			return errs[0].Err
		}
		iter := fetches.RecordIter()
		for !iter.Done() {
			record := iter.Next()
			if err := p.process(ctx, record); err != nil {
				takeinkafka.ObserveConsumeError("audit-service-worker", record.Topic)
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
	eventID, err := uuid.Parse(header(record, "event_id"))
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
	resourceType := strings.TrimPrefix(strings.TrimSuffix(record.Topic, ".events.v1"), "takein.")
	_, err = tx.Exec(ctx, `INSERT INTO audit_records(event_id,action,resource_type,resource_id,request_id,correlation_id,trace_id,created_at)VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz,now()))`, eventID, eventType, resourceType, string(record.Key), nullable(header(record, "request_id")), nullable(header(record, "correlation_id")), nullable(header(record, "trace_id")), nullable(header(record, "occurred_at")))
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (p *Processor) Process(ctx context.Context, record *kgo.Record) error {
	return p.process(ctx, record)
}
func (p *Processor) retry(ctx context.Context, record *kgo.Record, failure error) error {
	count, _ := strconv.Atoi(header(record, "retry_count"))
	topic := record.Topic
	if count >= p.maxRetries {
		topic = p.dlq
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
func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}
func trim(value string, max int) string {
	if len(value) > max {
		return value[:max]
	}
	return value
}
