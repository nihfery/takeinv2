package chat

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	chateventsv1 "github.com/nihfery/takein/gen/go/takein/events/chat/v1"
	eventscommonv1 "github.com/nihfery/takein/gen/go/takein/events/common/v1"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type Repository struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }
func (r *Repository) List(ctx context.Context, actor Actor) ([]map[string]any, error) {
	return r.many(ctx, `SELECT id,provider_id,provider_user_id,branch_user_id,customer_user_id,conversation_type,last_message_id,last_message_at,status,ticket_status,ticket_subject,ticket_body,created_at,updated_at FROM chat_threads WHERE $1='admin' OR provider_user_id=$2 OR branch_user_id=$2 OR customer_user_id=$2 OR ($1='provider' AND provider_id=$3) ORDER BY COALESCE(last_message_at,created_at) DESC LIMIT 500`, actor.Role, actor.UserID, actor.ProviderID)
}
func (r *Repository) Thread(ctx context.Context, id int64) (map[string]any, error) {
	return r.one(ctx, `SELECT id,provider_id,provider_user_id,branch_user_id,customer_user_id,conversation_type,last_message_id,last_message_at,status,ticket_status,ticket_subject,ticket_body,created_at,updated_at FROM chat_threads WHERE id=$1`, id)
}
func (r *Repository) Messages(ctx context.Context, id int64) ([]map[string]any, error) {
	return r.many(ctx, `SELECT id,chat_thread_id,sender_id,sender_role,body,attachment_object_id,attachment_name,attachment_mime,attachment_size,created_at FROM chat_messages WHERE chat_thread_id=$1 ORDER BY id LIMIT 500`, id)
}
func (r *Repository) CreateMessage(ctx context.Context, threadID int64, actor Actor, body string, attachment *uuid.UUID) (map[string]any, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	rows, err := tx.Query(ctx, `INSERT INTO chat_messages(chat_thread_id,sender_id,sender_role,body,attachment_object_id)VALUES($1,$2,$3,$4,$5)RETURNING id,chat_thread_id,sender_id,sender_role,body,attachment_object_id,created_at`, threadID, actor.UserID, actor.Role, body, attachment)
	if err != nil {
		return nil, err
	}
	value, err := pgx.CollectOneRow(rows, pgx.RowToMap)
	rows.Close()
	if err != nil {
		return nil, err
	}
	_, err = tx.Exec(ctx, `UPDATE chat_threads SET last_message_id=$2,last_message_at=now(),updated_at=now()WHERE id=$1`, threadID, value["id"])
	if err != nil {
		return nil, err
	}
	if err = writeOutbox(ctx, tx, "chat.message_created", threadID, value); err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return value, nil
}
func (r *Repository) Ticket(ctx context.Context, id int64, from, to, subject, body string, actor Actor) (map[string]any, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	rows, err := tx.Query(ctx, `UPDATE chat_threads SET ticket_status=$3,ticket_subject=COALESCE(NULLIF($4,''),ticket_subject),ticket_body=COALESCE(NULLIF($5,''),ticket_body),ticket_requested_at=CASE WHEN $3='requested' THEN now() ELSE ticket_requested_at END,ticket_reviewed_at=CASE WHEN $3 IN('approved','rejected')THEN now() ELSE ticket_reviewed_at END,ticket_reviewed_by=CASE WHEN $3 IN('approved','rejected')THEN $6 ELSE ticket_reviewed_by END,updated_at=now()WHERE id=$1 AND ticket_status=$2 RETURNING id,provider_id,provider_user_id,branch_user_id,customer_user_id,status,ticket_status,ticket_subject,ticket_body,updated_at`, id, from, to, subject, body, actor.UserID)
	if err != nil {
		return nil, err
	}
	value, err := pgx.CollectOneRow(rows, pgx.RowToMap)
	rows.Close()
	if err != nil {
		return nil, translate(err)
	}
	if err = writeOutbox(ctx, tx, "chat.ticket_status_changed", id, value); err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return value, nil
}
func (r *Repository) one(ctx context.Context, query string, args ...any) (map[string]any, error) {
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	value, err := pgx.CollectOneRow(rows, pgx.RowToMap)
	return value, translate(err)
}
func (r *Repository) many(ctx context.Context, query string, args ...any) ([]map[string]any, error) {
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return pgx.CollectRows(rows, pgx.RowToMap)
}
func writeOutbox(ctx context.Context, tx pgx.Tx, eventType string, id int64, value any) error {
	eventID := uuid.New()
	now := time.Now().UTC()
	row, _ := value.(map[string]any)
	message := &chateventsv1.ChatChanged{Metadata: &eventscommonv1.EventMetadata{EventId: eventID.String(), EventVersion: 1, OccurredAt: timestamppb.New(now), Producer: "chat-service", AggregateId: fmt.Sprint(id)}, ThreadId: fmt.Sprint(id), Status: fmt.Sprint(row["ticket_status"]), ChangeType: eventType}
	if eventType == "chat.message_created" {
		message.MessageId = fmt.Sprint(row["id"])
	}
	payload, err := proto.Marshal(message)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,occurred_at)VALUES($1,'chat_thread',$2,$3,1,$4,'{"content-type":"application/protobuf"}'::jsonb,$5)`, eventID, fmt.Sprint(id), eventType, payload, now)
	return err
}
func translate(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}
