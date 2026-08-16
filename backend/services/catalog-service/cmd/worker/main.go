package main

import (
	"log/slog"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nihfery/takein/libs/go/kafkaconsumer"
	"github.com/nihfery/takein/libs/go/workerapp"
	"github.com/nihfery/takein/services/catalog-service/internal/consumer"
)

func main() {
	factory := func(pool *pgxpool.Pool) kafkaconsumer.Handler { return consumer.NewProjectionProcessor(pool).Process }
	if err := workerapp.RunOutboxConsumer("catalog-service", "takein-catalog-projections-v1", []string{"takein.provider.events.v1", "takein.customer.events.v1"}, factory); err != nil {
		slog.Error("catalog worker stopped", "error", err)
		os.Exit(1)
	}
}
