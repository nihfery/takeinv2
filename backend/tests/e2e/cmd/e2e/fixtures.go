package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type fixtures struct {
	identity *pgxpool.Pool
	billing  *pgxpool.Pool
	chat     *pgxpool.Pool
	provider *pgxpool.Pool
}

func openFixtures(ctx context.Context) (*fixtures, error) {
	if os.Getenv("E2E_ALLOW_FIXTURES") != "true" {
		return nil, errors.New("E2E_ALLOW_FIXTURES=true is required because the E2E harness creates isolated test fixtures")
	}
	dsns := []string{
		env("E2E_IDENTITY_DSN", "postgres://takein_identity:identity_local_only@127.0.0.1:15432/takein_identity?sslmode=disable"),
		env("E2E_BILLING_DSN", "postgres://takein_billing:billing_local_only@127.0.0.1:15432/takein_billing?sslmode=disable"),
		env("E2E_CHAT_DSN", "postgres://takein_chat:chat_local_only@127.0.0.1:15432/takein_chat?sslmode=disable"),
		env("E2E_PROVIDER_DSN", "postgres://takein_provider:provider_local_only@127.0.0.1:15432/takein_provider?sslmode=disable"),
	}
	if os.Getenv("E2E_ALLOW_REMOTE_FIXTURES") != "true" {
		for _, dsn := range dsns {
			if err := requireLoopbackDSN(ctx, dsn); err != nil {
				return nil, err
			}
		}
	}
	pools := make([]*pgxpool.Pool, 0, len(dsns))
	for _, dsn := range dsns {
		pool, err := pgxpool.New(ctx, dsn)
		if err != nil {
			closePools(pools)
			return nil, err
		}
		if err = pool.Ping(ctx); err != nil {
			pool.Close()
			closePools(pools)
			return nil, err
		}
		pools = append(pools, pool)
	}
	return &fixtures{identity: pools[0], billing: pools[1], chat: pools[2], provider: pools[3]}, nil
}

func (value *fixtures) close() {
	closePools([]*pgxpool.Pool{value.identity, value.billing, value.chat, value.provider})
}

func closePools(pools []*pgxpool.Pool) {
	for _, pool := range pools {
		if pool != nil {
			pool.Close()
		}
	}
}

func requireLoopbackDSN(ctx context.Context, dsn string) error {
	parsed, err := url.Parse(dsn)
	if err != nil {
		return err
	}
	host := parsed.Hostname()
	addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return fmt.Errorf("resolve fixture DSN host %q: %w", host, err)
	}
	for _, address := range addresses {
		if !address.IP.IsLoopback() {
			return fmt.Errorf("refusing non-loopback fixture DSN host %q; set E2E_ALLOW_REMOTE_FIXTURES=true only for an isolated E2E database", host)
		}
	}
	return nil
}

func (value *fixtures) promoteAdmin(ctx context.Context, userID int64) error {
	result, err := value.identity.Exec(ctx, `UPDATE users SET role='admin',updated_at=now() WHERE id=$1`, userID)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return errors.New("admin fixture user was not found")
	}
	return nil
}

func (value *fixtures) trialAndPlan(ctx context.Context, providerID int64, suffix string) (int64, error) {
	_, err := value.billing.Exec(ctx, `INSERT INTO provider_trials(provider_id,starts_at,ends_at,source) VALUES($1,now()-interval '1 day',now()+interval '7 days','e2e') ON CONFLICT(provider_id) DO UPDATE SET starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,source='e2e',updated_at=now()`, providerID)
	if err != nil {
		return 0, err
	}
	var planID int64
	err = value.billing.QueryRow(ctx, `INSERT INTO subscription_plans(name,description,price,duration_days,max_branches,is_active) VALUES($1,'isolated E2E fixture',125000,30,3,true) RETURNING id`, "E2E "+suffix).Scan(&planID)
	return planID, err
}

func (value *fixtures) chatThread(ctx context.Context, providerID, providerUserID, customerUserID int64) (int64, error) {
	var id int64
	err := value.chat.QueryRow(ctx, `INSERT INTO chat_threads(provider_id,provider_user_id,customer_user_id,conversation_type,opened_by_user_id) VALUES($1,$2,$3,'provider_customer',$3) RETURNING id`, providerID, providerUserID, customerUserID).Scan(&id)
	return id, err
}

func env(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func contextWithTimeout(parent context.Context) (context.Context, context.CancelFunc) {
	timeout := 5 * time.Minute
	if raw := strings.TrimSpace(os.Getenv("E2E_TIMEOUT")); raw != "" {
		if parsed, err := time.ParseDuration(raw); err == nil && parsed > 0 {
			timeout = parsed
		}
	}
	return context.WithTimeout(parent, timeout)
}
