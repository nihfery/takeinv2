package media

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	eventscommonv1 "github.com/nihfery/takein/gen/go/takein/events/common/v1"
	mediaeventsv1 "github.com/nihfery/takein/gen/go/takein/events/media/v1"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

var (
	ErrNotFound  = errors.New("media not found")
	ErrForbidden = errors.New("media forbidden")
)

type Object struct {
	ID          uuid.UUID `json:"id"`
	OwnerType   string    `json:"owner_type"`
	OwnerID     string    `json:"owner_id"`
	Purpose     string    `json:"purpose"`
	Bucket      string    `json:"bucket"`
	ObjectKey   string    `json:"object_key"`
	ContentType *string   `json:"content_type"`
	SizeBytes   *int64    `json:"size_bytes"`
	Visibility  string    `json:"visibility"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
}

func Authorized(role, userID string, value Object) bool {
	return role == "admin" || value.OwnerID == userID
}

type Repository struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }
func (r *Repository) Create(ctx context.Context, ownerType, ownerID, purpose, bucket, key, contentType, visibility string) (Object, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Object{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	id := uuid.New()
	value, err := scan(tx.QueryRow(ctx, `INSERT INTO media_objects(id,owner_type,owner_id,purpose,bucket,object_key,content_type,visibility,status)VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending')RETURNING id,owner_type,owner_id,purpose,bucket,object_key,content_type,size_bytes,visibility,status,created_at`, id, ownerType, ownerID, purpose, bucket, key, nullable(contentType), visibility))
	if err != nil {
		return Object{}, err
	}
	if err = outbox(ctx, tx, value, "media.upload_requested"); err != nil {
		return Object{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Object{}, err
	}
	return value, nil
}
func (r *Repository) ByID(ctx context.Context, id uuid.UUID) (Object, error) {
	return scan(r.pool.QueryRow(ctx, `SELECT id,owner_type,owner_id,purpose,bucket,object_key,content_type,size_bytes,visibility,status,created_at FROM media_objects WHERE id=$1 AND status<>'deleted'`, id))
}
func (r *Repository) Complete(ctx context.Context, id uuid.UUID, size int64, checksum string) (Object, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Object{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	value, err := scan(tx.QueryRow(ctx, `UPDATE media_objects SET size_bytes=$2,checksum_sha256=$3,status='ready',completed_at=now()WHERE id=$1 AND status='pending' RETURNING id,owner_type,owner_id,purpose,bucket,object_key,content_type,size_bytes,visibility,status,created_at`, id, size, checksum))
	if err != nil {
		return Object{}, translate(err)
	}
	if err = outbox(ctx, tx, value, "media.ready"); err != nil {
		return Object{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Object{}, err
	}
	return value, nil
}
func (r *Repository) Delete(ctx context.Context, id uuid.UUID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	value, err := scan(tx.QueryRow(ctx, `UPDATE media_objects SET status='deleted',deleted_at=now() WHERE id=$1 AND status<>'deleted' RETURNING id,owner_type,owner_id,purpose,bucket,object_key,content_type,size_bytes,visibility,status,created_at`, id))
	if err != nil {
		return translate(err)
	}
	if err = outbox(ctx, tx, value, "media.deleted"); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type rowScanner interface{ Scan(...any) error }

func scan(row rowScanner) (Object, error) {
	var value Object
	err := row.Scan(&value.ID, &value.OwnerType, &value.OwnerID, &value.Purpose, &value.Bucket, &value.ObjectKey, &value.ContentType, &value.SizeBytes, &value.Visibility, &value.Status, &value.CreatedAt)
	return value, translate(err)
}
func translate(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}
func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}
func outbox(ctx context.Context, tx pgx.Tx, value Object, eventType string) error {
	eventID := uuid.New()
	now := time.Now().UTC()
	message := &mediaeventsv1.MediaChanged{Metadata: &eventscommonv1.EventMetadata{EventId: eventID.String(), EventVersion: 1, OccurredAt: timestamppb.New(now), Producer: "media-service", AggregateId: value.ID.String()}, ObjectId: value.ID.String(), OwnerType: value.OwnerType, OwnerId: value.OwnerID, Purpose: value.Purpose, Status: value.Status, ChangeType: eventType}
	payload, err := proto.Marshal(message)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,occurred_at)VALUES($1,'media',$2,$3,1,$4,'{"content-type":"application/protobuf"}'::jsonb,$5)`, eventID, fmt.Sprint(value.ID), eventType, payload, now)
	return err
}
