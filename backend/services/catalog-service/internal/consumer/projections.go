package consumer

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	customereventsv1 "github.com/nihfery/takein/gen/go/takein/events/customer/v1"
	providereventsv1 "github.com/nihfery/takein/gen/go/takein/events/provider/v1"
	"github.com/nihfery/takein/libs/go/kafkaconsumer"
	"github.com/twmb/franz-go/pkg/kgo"
	"google.golang.org/protobuf/proto"
)

type ProjectionProcessor struct{ pool *pgxpool.Pool }

func NewProjectionProcessor(pool *pgxpool.Pool) *ProjectionProcessor {
	return &ProjectionProcessor{pool: pool}
}

func (p *ProjectionProcessor) Process(ctx context.Context, record *kgo.Record) error {
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
	if strings.HasPrefix(eventType, "provider.role_") {
		// Role/account authorization is owned by provider + identity. Catalog
		// deliberately records inbox idempotency without projecting this event.
		err = nil
	} else if strings.HasPrefix(eventType, "provider.branch_") {
		err = projectBranch(ctx, tx, eventType, record.Value)
	} else if strings.HasPrefix(eventType, "provider.staff_") {
		err = projectStaff(ctx, tx, eventType, record.Value)
	} else if strings.HasPrefix(eventType, "provider.") {
		err = projectProvider(ctx, tx, eventType, record.Value)
	} else if eventType == "customer.review_created" {
		err = projectReview(ctx, tx, record.Value)
	}
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func projectProvider(ctx context.Context, tx pgx.Tx, eventType string, payload []byte) error {
	message := &providereventsv1.ProviderChanged{}
	if err := proto.Unmarshal(payload, message); err != nil {
		return err
	}
	id, err := strconv.ParseInt(message.GetProviderId(), 10, 64)
	if err != nil {
		return err
	}
	if strings.HasSuffix(eventType, "deleted") {
		for _, statement := range []string{`DELETE FROM staff_projection WHERE provider_id=$1`, `DELETE FROM branch_projection WHERE provider_id=$1`, `DELETE FROM provider_readiness_projection WHERE provider_id=$1`, `DELETE FROM provider_projection WHERE provider_id=$1`} {
			if _, err = tx.Exec(ctx, statement, id); err != nil {
				return err
			}
		}
		return nil
	}
	_, err = tx.Exec(ctx, `INSERT INTO provider_projection(provider_id,name,category,status,ready) VALUES($1,$2,NULLIF($3,''),$4,$5) ON CONFLICT(provider_id) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,status=EXCLUDED.status,ready=EXCLUDED.ready,updated_at=now()`, id, message.GetDisplayName(), message.GetCategory(), normalizedStatus(message.GetStatus()), message.GetReady())
	if err == nil {
		_, err = tx.Exec(ctx, `UPDATE branch_projection SET ready=(status='active' AND $2),updated_at=now() WHERE provider_id=$1`, id, message.GetReady())
	}
	if err == nil {
		err = refreshReadiness(ctx, tx, id)
	}
	return err
}

func projectBranch(ctx context.Context, tx pgx.Tx, eventType string, payload []byte) error {
	message := &providereventsv1.BranchChanged{}
	if err := proto.Unmarshal(payload, message); err != nil {
		return err
	}
	id, err := strconv.ParseInt(message.GetBranchId(), 10, 64)
	if err != nil {
		return err
	}
	providerID, providerErr := strconv.ParseInt(message.GetProviderId(), 10, 64)
	if strings.HasSuffix(eventType, "deleted") {
		_, err = tx.Exec(ctx, `DELETE FROM branch_projection WHERE branch_id=$1`, id)
		if err == nil && providerErr == nil {
			err = refreshReadiness(ctx, tx, providerID)
		}
		return err
	}
	if providerErr != nil {
		return providerErr
	}
	_, err = tx.Exec(ctx, `INSERT INTO branch_projection(branch_id,provider_id,branch_name,address,status,ready) VALUES($1,$2,$3,NULLIF($4,''),$5,$6) ON CONFLICT(branch_id) DO UPDATE SET provider_id=EXCLUDED.provider_id,branch_name=EXCLUDED.branch_name,address=EXCLUDED.address,status=EXCLUDED.status,ready=EXCLUDED.ready,updated_at=now()`, id, providerID, message.GetBranchName(), message.GetAddress(), normalizedStatus(message.GetStatus()), message.GetReady())
	if err == nil {
		err = refreshReadiness(ctx, tx, providerID)
	}
	return err
}

func projectStaff(ctx context.Context, tx pgx.Tx, eventType string, payload []byte) error {
	message := &providereventsv1.StaffChanged{}
	if err := proto.Unmarshal(payload, message); err != nil {
		return err
	}
	id, err := strconv.ParseInt(message.GetStaffId(), 10, 64)
	if err != nil {
		return err
	}
	if strings.HasSuffix(eventType, "deleted") {
		_, err = tx.Exec(ctx, `DELETE FROM staff_projection WHERE staff_id=$1`, id)
		return err
	}
	providerID, err := strconv.ParseInt(message.GetProviderId(), 10, 64)
	if err != nil {
		return err
	}
	var branchID any
	if message.GetBranchId() != "" {
		parsed, parseErr := strconv.ParseInt(message.GetBranchId(), 10, 64)
		if parseErr != nil {
			return parseErr
		}
		branchID = parsed
	}
	services, _ := json.Marshal(message.GetServiceIds())
	_, err = tx.Exec(ctx, `INSERT INTO staff_projection(staff_id,provider_id,branch_id,display_name,status,service_ids) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(staff_id) DO UPDATE SET provider_id=EXCLUDED.provider_id,branch_id=EXCLUDED.branch_id,display_name=EXCLUDED.display_name,status=EXCLUDED.status,service_ids=EXCLUDED.service_ids,updated_at=now()`, id, providerID, branchID, message.GetDisplayName(), normalizedStatus(message.GetStatus()), string(services))
	return err
}

func projectReview(ctx context.Context, tx pgx.Tx, payload []byte) error {
	message := &customereventsv1.ReviewCreated{}
	if err := proto.Unmarshal(payload, message); err != nil {
		return err
	}
	reviewID, err := strconv.ParseInt(message.GetReviewId(), 10, 64)
	if err != nil {
		return err
	}
	branchID, err := strconv.ParseInt(message.GetBranchId(), 10, 64)
	if err != nil {
		return err
	}
	var staffID any
	if message.GetStaffId() != "" {
		parsed, parseErr := strconv.ParseInt(message.GetStaffId(), 10, 64)
		if parseErr != nil {
			return parseErr
		}
		staffID = parsed
	}
	createdAt, err := time.Parse(time.RFC3339Nano, message.GetCreatedAt())
	if err != nil {
		createdAt = time.Now().UTC()
	}
	_, err = tx.Exec(ctx, `INSERT INTO review_projection(review_id,branch_id,staff_id,rating,comment,created_at) VALUES($1,$2,$3,$4,NULLIF($5,''),$6) ON CONFLICT(review_id) DO UPDATE SET branch_id=EXCLUDED.branch_id,staff_id=EXCLUDED.staff_id,rating=EXCLUDED.rating,comment=EXCLUDED.comment`, reviewID, branchID, staffID, message.GetRating(), message.GetComment(), createdAt)
	return err
}

func refreshReadiness(ctx context.Context, tx pgx.Tx, providerID int64) error {
	_, err := tx.Exec(ctx, `INSERT INTO provider_readiness_projection(provider_id,ready,active_branch_ids) SELECT $1,COALESCE((SELECT ready FROM provider_projection WHERE provider_id=$1),false),COALESCE((SELECT jsonb_agg(branch_id ORDER BY branch_id) FROM branch_projection WHERE provider_id=$1 AND status='active' AND ready),'[]'::jsonb) ON CONFLICT(provider_id) DO UPDATE SET ready=EXCLUDED.ready,active_branch_ids=EXCLUDED.active_branch_ids,updated_at=now()`, providerID)
	return err
}

func normalizedStatus(status string) string {
	if status == "" {
		return "inactive"
	}
	return status
}
