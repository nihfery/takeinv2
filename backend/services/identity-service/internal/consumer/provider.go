package consumer

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	customereventsv1 "github.com/nihfery/takein/gen/go/takein/events/customer/v1"
	providereventsv1 "github.com/nihfery/takein/gen/go/takein/events/provider/v1"
	"github.com/nihfery/takein/libs/go/kafkaconsumer"
	"github.com/twmb/franz-go/pkg/kgo"
	"google.golang.org/protobuf/proto"
)

type ProviderProcessor struct{ pool *pgxpool.Pool }

func NewProviderProcessor(pool *pgxpool.Pool) *ProviderProcessor {
	return &ProviderProcessor{pool: pool}
}

func (p *ProviderProcessor) Process(ctx context.Context, record *kgo.Record) error {
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
	switch record.Topic {
	case "takein.provider.events.v1":
		if strings.HasPrefix(eventType, "provider.role_") {
			return tx.Commit(ctx)
		}
		message := &providereventsv1.ProviderChanged{}
		if err = proto.Unmarshal(record.Value, message); err != nil {
			return err
		}
		providerID, parseErr := strconv.ParseInt(message.GetProviderId(), 10, 64)
		if parseErr != nil {
			return parseErr
		}
		switch eventType {
		case "provider.profile_created":
			userID, userErr := strconv.ParseInt(message.GetUserId(), 10, 64)
			if userErr != nil {
				return userErr
			}
			_, err = tx.Exec(ctx, `UPDATE users SET provider_id=$2,updated_at=now() WHERE id=$1 AND role='provider'`, userID, providerID)
		case "provider.status_changed", "provider.deleted":
			status := "active"
			if message.GetStatus() != "active" || eventType == "provider.deleted" {
				status = "inactive"
			}
			_, err = tx.Exec(ctx, `UPDATE users SET status=$2,updated_at=now() WHERE provider_id=$1`, providerID, status)
		}
	case "takein.customer.events.v1":
		message := &customereventsv1.CustomerChanged{}
		if err = proto.Unmarshal(record.Value, message); err != nil {
			return err
		}
		userID, parseErr := strconv.ParseInt(message.GetUserId(), 10, 64)
		if parseErr != nil || userID <= 0 {
			return errors.New("customer lifecycle event has an invalid user_id")
		}
		if eventType == "customer.status_changed" || eventType == "customer.deleted" {
			status := "active"
			if message.GetStatus() != "active" || eventType == "customer.deleted" {
				status = "inactive"
			}
			_, err = tx.Exec(ctx, `UPDATE users SET status=$2,updated_at=now() WHERE id=$1 AND role='customer'`, userID, status)
		}
	default:
		return errors.New("unsupported identity lifecycle topic")
	}
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
