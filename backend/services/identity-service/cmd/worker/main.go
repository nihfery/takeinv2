package main

import (
	"log/slog"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nihfery/takein/libs/go/kafkaconsumer"
	"github.com/nihfery/takein/libs/go/workerapp"
	"github.com/nihfery/takein/services/identity-service/internal/consumer"
)

func main() {
	factory := func(pool *pgxpool.Pool) kafkaconsumer.Handler { return consumer.NewProviderProcessor(pool).Process }
	if err := workerapp.RunOutboxConsumer("identity-service", "takein-identity-lifecycle-v1", []string{"takein.provider.events.v1", "takein.customer.events.v1"}, factory); err != nil {
		slog.Error("identity worker stopped", "error", err)
		os.Exit(1)
	}
}
