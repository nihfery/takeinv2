package outbox

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
)

var ErrLeaseLost = errors.New("outbox lease is not owned by this worker")

var (
	outboxPending = prometheus.NewGaugeVec(prometheus.GaugeOpts{Name: "outbox_pending", Help: "Outbox records waiting to be published."}, []string{"service"})
	outboxFailed  = prometheus.NewGaugeVec(prometheus.GaugeOpts{Name: "outbox_failed", Help: "Outbox records at the terminal retry limit."}, []string{"service"})
)

func init() { prometheus.MustRegister(outboxPending, outboxFailed) }

type Event struct {
	ID            uuid.UUID
	AggregateType string
	AggregateID   string
	EventType     string
	EventVersion  int32
	Payload       []byte
	Headers       []byte
	OccurredAt    time.Time
	AttemptCount  int32
}

type Publisher interface {
	Publish(context.Context, Event) error
}

type Store struct {
	pool     *pgxpool.Pool
	workerID uuid.UUID
	service  string
}

func New(pool *pgxpool.Pool) *Store { return NewForService(pool, "unknown") }

func NewForService(pool *pgxpool.Pool, service string) *Store {
	return &Store{pool: pool, workerID: uuid.New(), service: service}
}

func (s *Store) observe(ctx context.Context) {
	Observe(ctx, s.pool, s.service)
}

// Observe refreshes backlog gauges from the service-owned outbox table.
func Observe(ctx context.Context, pool *pgxpool.Pool, service string) {
	var pending, failed int64
	if err := pool.QueryRow(ctx, `SELECT count(*) FILTER (WHERE attempt_count < 20), count(*) FILTER (WHERE attempt_count >= 20) FROM outbox_events WHERE published_at IS NULL`).Scan(&pending, &failed); err == nil {
		outboxPending.WithLabelValues(service).Set(float64(pending))
		outboxFailed.WithLabelValues(service).Set(float64(failed))
	}
}

func (s *Store) Claim(ctx context.Context, limit int) ([]Event, error) {
	rows, err := s.pool.Query(ctx, `
		WITH candidates AS (
			SELECT id FROM outbox_events
			WHERE published_at IS NULL AND attempt_count < 20
			  AND (locked_at IS NULL OR locked_at < now() - interval '5 minutes')
			ORDER BY occurred_at
			FOR UPDATE SKIP LOCKED
			LIMIT $1
		)
		UPDATE outbox_events AS event
		SET locked_at=now(), locked_by=$2, attempt_count=event.attempt_count+1
		FROM candidates
		WHERE event.id=candidates.id
		RETURNING event.id,event.aggregate_type,event.aggregate_id,event.event_type,event.event_version,
		          event.payload,event.headers,event.occurred_at,event.attempt_count`, limit, s.workerID)
	if err != nil {
		return nil, fmt.Errorf("claim outbox: %w", err)
	}
	defer rows.Close()
	events := make([]Event, 0, limit)
	for rows.Next() {
		var event Event
		if err := rows.Scan(&event.ID, &event.AggregateType, &event.AggregateID, &event.EventType, &event.EventVersion, &event.Payload, &event.Headers, &event.OccurredAt, &event.AttemptCount); err != nil {
			return nil, fmt.Errorf("scan outbox: %w", err)
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read outbox: %w", err)
	}
	return events, nil
}

func (s *Store) MarkPublished(ctx context.Context, id uuid.UUID) error {
	result, err := s.pool.Exec(ctx, `UPDATE outbox_events SET published_at=now(),last_error=NULL,locked_at=NULL,locked_by=NULL WHERE id=$1 AND locked_by=$2 AND published_at IS NULL`, id, s.workerID)
	if err == nil && result.RowsAffected() == 0 {
		return ErrLeaseLost
	}
	return err
}

func (s *Store) MarkFailed(ctx context.Context, id uuid.UUID, failure error) error {
	message := "unknown publish error"
	if failure != nil {
		message = failure.Error()
	}
	if len(message) > 2000 {
		message = message[:2000]
	}
	result, err := s.pool.Exec(ctx, `UPDATE outbox_events SET last_error=$2,locked_at=NULL,locked_by=NULL WHERE id=$1 AND locked_by=$3`, id, message, s.workerID)
	if err == nil && result.RowsAffected() == 0 {
		return ErrLeaseLost
	}
	return err
}

func Run(ctx context.Context, store *Store, publisher Publisher, poll time.Duration, batch int) error {
	ticker := time.NewTicker(poll)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			store.observe(ctx)
			events, err := store.Claim(ctx, batch)
			if err != nil {
				return err
			}
			for _, event := range events {
				if err := publisher.Publish(ctx, event); err != nil {
					_ = store.MarkFailed(ctx, event.ID, err)
					continue
				}
				if err := store.MarkPublished(ctx, event.ID); err != nil && !errors.Is(err, context.Canceled) {
					return err
				}
			}
			store.observe(ctx)
		}
	}
}
