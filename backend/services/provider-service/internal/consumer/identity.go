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
	identityeventsv1 "github.com/nihfery/takein/gen/go/takein/events/identity/v1"
	providereventsv1 "github.com/nihfery/takein/gen/go/takein/events/provider/v1"
	"github.com/nihfery/takein/libs/go/kafkaconsumer"
	"github.com/twmb/franz-go/pkg/kgo"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type IdentityProcessor struct{ pool *pgxpool.Pool }

func NewIdentityProcessor(pool *pgxpool.Pool) *IdentityProcessor {
	return &IdentityProcessor{pool: pool}
}

func (p *IdentityProcessor) Process(ctx context.Context, record *kgo.Record) error {
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
	if record.Topic == "takein.booking.events.v1" {
		message := &bookingeventsv1.BookingChanged{}
		if err = proto.Unmarshal(record.Value, message); err != nil {
			return err
		}
		staffID, staffErr := strconv.ParseInt(message.GetStaffId(), 10, 64)
		providerID, providerErr := strconv.ParseInt(message.GetProviderId(), 10, 64)
		if staffErr != nil || providerErr != nil || staffID <= 0 || providerID <= 0 {
			return tx.Commit(ctx)
		}
		currentStatus := ""
		switch message.GetStatus() {
		case "in_progress", "inprogress":
			currentStatus = "busy"
		case "completed", "cancelled", "provider_cancelled", "customer_cancelled", "no_show":
			currentStatus = "available"
		}
		if currentStatus != "" {
			if _, err = tx.Exec(ctx, `UPDATE provider_staffs SET current_status=$3,updated_at=now() WHERE id=$1 AND provider_id=$2`, staffID, providerID, currentStatus); err != nil {
				return err
			}
		}
		return tx.Commit(ctx)
	}
	if eventType != "identity.user_registered" {
		return tx.Commit(ctx)
	}
	message := &identityeventsv1.UserRegistered{}
	if err = proto.Unmarshal(record.Value, message); err != nil {
		return err
	}
	if message.GetRole() != "provider" {
		return tx.Commit(ctx)
	}
	userID, err := strconv.ParseInt(message.GetUserId(), 10, 64)
	if err != nil {
		return err
	}
	var providerID int64
	err = tx.QueryRow(ctx, `INSERT INTO provider_profiles(user_id,display_name,phone_number,category,status,document_status) VALUES($1,$2,NULLIF($3,''),NULLIF($4,''),'inactive','pending') ON CONFLICT(user_id) DO UPDATE SET updated_at=now() RETURNING id`, userID, message.GetName(), message.GetPhoneNumber(), message.GetProviderCategory()).Scan(&providerID)
	if err != nil {
		return err
	}
	return writeProviderEvent(ctx, tx, providerID, userID, message.GetName(), message.GetProviderCategory())
}

func writeProviderEvent(ctx context.Context, tx pgx.Tx, providerID, userID int64, name, category string) error {
	id := uuid.New()
	now := time.Now().UTC()
	eventType := "provider.profile_created"
	message := &providereventsv1.ProviderChanged{Metadata: &eventscommonv1.EventMetadata{EventId: id.String(), EventVersion: 1, OccurredAt: timestamppb.New(now), Producer: "provider-service", AggregateId: strconv.FormatInt(providerID, 10)}, ProviderId: strconv.FormatInt(providerID, 10), UserId: strconv.FormatInt(userID, 10), DisplayName: name, Category: category, Status: "inactive", ChangeType: eventType, Ready: false}
	payload, err := proto.Marshal(message)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,occurred_at) VALUES($1,'provider',$2,$3,1,$4,'{"content-type":"application/protobuf"}'::jsonb,$5)`, id, strconv.FormatInt(providerID, 10), eventType, payload, now)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
