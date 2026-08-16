package outbox

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestConcurrentWorkersClaimDisjointBatches(t *testing.T) {
	dsn := os.Getenv("TEST_OUTBOX_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_OUTBOX_DATABASE_URL is not set")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()

	schema := "outbox_test_" + uuid.NewString()[:8]
	if _, err := admin.Exec(ctx, fmt.Sprintf(`CREATE SCHEMA %s`, schema)); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = admin.Exec(ctx, fmt.Sprintf(`DROP SCHEMA %s CASCADE`, schema)) }()
	if _, err := admin.Exec(ctx, fmt.Sprintf(`CREATE TABLE %s.outbox_events (
		id UUID PRIMARY KEY, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL,
		event_type TEXT NOT NULL, event_version INTEGER NOT NULL, payload BYTEA NOT NULL,
		headers JSONB NOT NULL DEFAULT '{}'::jsonb, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		published_at TIMESTAMPTZ, attempt_count INTEGER NOT NULL DEFAULT 0, last_error TEXT,
		locked_at TIMESTAMPTZ, locked_by UUID
	)`, schema)); err != nil {
		t.Fatal(err)
	}
	for index := 0; index < 20; index++ {
		if _, err := admin.Exec(ctx, fmt.Sprintf(`INSERT INTO %s.outbox_events
			(id,aggregate_type,aggregate_id,event_type,event_version,payload)
			VALUES($1,'booking',$2,'booking.tested',1,'{}')`, schema), uuid.New(), fmt.Sprint(index)); err != nil {
			t.Fatal(err)
		}
	}

	workerDSN := dsn
	separator := "?"
	if containsQuery(workerDSN) {
		separator = "&"
	}
	workerDSN += separator + "search_path=" + schema
	pool, err := pgxpool.New(ctx, workerDSN)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	workers := []*Store{New(pool), New(pool)}
	results := make([][]Event, len(workers))
	errorsByWorker := make([]error, len(workers))
	var wait sync.WaitGroup
	for index := range workers {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			results[index], errorsByWorker[index] = workers[index].Claim(ctx, 10)
		}(index)
	}
	wait.Wait()

	seen := make(map[uuid.UUID]struct{}, 20)
	for index := range workers {
		if errorsByWorker[index] != nil {
			t.Fatal(errorsByWorker[index])
		}
		if len(results[index]) != 10 {
			t.Fatalf("worker %d claimed %d events, want 10", index, len(results[index]))
		}
		for _, event := range results[index] {
			if _, duplicate := seen[event.ID]; duplicate {
				t.Fatalf("event %s was claimed by multiple workers", event.ID)
			}
			seen[event.ID] = struct{}{}
		}
	}
	if len(seen) != 20 {
		t.Fatalf("claimed %d unique events, want 20", len(seen))
	}
	if err := workers[1].MarkPublished(ctx, results[0][0].ID); !errors.Is(err, ErrLeaseLost) {
		t.Fatalf("non-owner mark published error = %v, want ErrLeaseLost", err)
	}
	if err := workers[0].MarkPublished(ctx, results[0][0].ID); err != nil {
		t.Fatal(err)
	}
}

func containsQuery(value string) bool {
	for _, character := range value {
		if character == '?' {
			return true
		}
	}
	return false
}
