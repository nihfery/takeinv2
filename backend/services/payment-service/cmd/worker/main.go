package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nihfery/takein/libs/go/config"
	"github.com/nihfery/takein/libs/go/kafkaconsumer"
	"github.com/nihfery/takein/libs/go/workerapp"
	"github.com/nihfery/takein/services/payment-service/internal/consumer"
	postgresrepo "github.com/nihfery/takein/services/payment-service/internal/persistence/postgres"
)

func main() {
	factory := func(pool *pgxpool.Pool) kafkaconsumer.Handler { return consumer.NewBookingProcessor(pool).Process }
	if err := workerapp.RunOutboxConsumerScheduled("payment-service", "takein-payment-booking-v1", []string{"takein.booking.events.v1"}, factory, runPaymentExpiry); err != nil {
		slog.Error("payment worker stopped", "error", err)
		os.Exit(1)
	}
}

func runPaymentExpiry(ctx context.Context, pool *pgxpool.Pool) error {
	interval := config.Duration("PAYMENT_EXPIRY_INTERVAL", time.Second)
	if interval <= 0 {
		interval = time.Second
	}
	repository := postgresrepo.New(pool)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case now := <-ticker.C:
			if _, err := repository.ExpirePending(ctx, now.UTC()); err != nil {
				return err
			}
		}
	}
}
