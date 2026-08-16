package postgres

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nihfery/takein/services/catalog-service/internal/catalog"
)

func TestCouponQuotaIsNotOversold(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is required for PostgreSQL coupon concurrency tests")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err = pool.Ping(ctx); err != nil {
		t.Fatal(err)
	}

	seed := time.Now().UnixNano()
	var serviceID, couponID int64
	err = pool.QueryRow(ctx, `INSERT INTO services(provider_id,title,slug,price,minimum_duration,estimated_duration,maximum_duration,status,verify_status)
		VALUES($1,'Coupon concurrency fixture',$2,1000,15,30,45,'active','verified') RETURNING id`, seed, fmt.Sprintf("coupon-fixture-%d", seed)).Scan(&serviceID)
	if err != nil {
		t.Fatal(err)
	}
	code := fmt.Sprintf("RACE-%d", seed)
	err = pool.QueryRow(ctx, `INSERT INTO coupons(code,product_type,product_ids,coupon_type,coupon_value,quantity,start_date,end_date,status)
		VALUES($1,'all','[]'::jsonb,'fixed',100,1,CURRENT_DATE,CURRENT_DATE+1,'active') RETURNING id`, code).Scan(&couponID)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM outbox_events WHERE aggregate_type='coupon' AND aggregate_id=$1`, fmt.Sprint(couponID))
		_, _ = pool.Exec(context.Background(), `DELETE FROM coupon_redemptions WHERE coupon_id=$1`, couponID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM coupons WHERE id=$1`, couponID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM services WHERE id=$1`, serviceID)
	})

	repository := New(pool)
	type result struct {
		key     string
		summary catalog.PriceSummary
		err     error
	}
	results := make(chan result, 2)
	barrier := make(chan struct{})
	var wait sync.WaitGroup
	for index := range 2 {
		key := fmt.Sprintf("coupon-race-%d-%d", seed, index)
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-barrier
			summary, priceErr := repository.PriceSummary(ctx, code, []int64{serviceID}, key)
			results <- result{key: key, summary: summary, err: priceErr}
		}()
	}
	close(barrier)
	wait.Wait()
	close(results)

	var winner result
	var successes, exhausted int
	for value := range results {
		switch {
		case value.err == nil:
			successes++
			winner = value
		case errors.Is(value.err, catalog.ErrInvalidCoupon):
			exhausted++
		default:
			t.Fatalf("unexpected redemption error: %v", value.err)
		}
	}
	if successes != 1 || exhausted != 1 {
		t.Fatalf("successes=%d exhausted=%d", successes, exhausted)
	}
	if winner.summary.SubtotalMinor != 100_000 || winner.summary.DiscountMinor != 10_000 || winner.summary.TaxMinor != 4_500 || winner.summary.PayableMinor != 94_500 {
		t.Fatalf("unexpected price summary: %+v", winner.summary)
	}

	var usedCount int
	if err = pool.QueryRow(ctx, `SELECT used_count FROM coupons WHERE id=$1`, couponID).Scan(&usedCount); err != nil || usedCount != 1 {
		t.Fatalf("used_count=%d err=%v", usedCount, err)
	}
	replayed, err := repository.PriceSummary(ctx, code, []int64{serviceID}, winner.key)
	if err != nil || replayed.PayableMinor != winner.summary.PayableMinor {
		t.Fatalf("idempotent replay failed: summary=%+v err=%v", replayed, err)
	}
	if released, releaseErr := repository.ReleaseCoupon(ctx, winner.key); releaseErr != nil || !released {
		t.Fatalf("release failed: released=%t err=%v", released, releaseErr)
	}
	if err = pool.QueryRow(ctx, `SELECT used_count FROM coupons WHERE id=$1`, couponID).Scan(&usedCount); err != nil || usedCount != 0 {
		t.Fatalf("used_count after release=%d err=%v", usedCount, err)
	}
}
