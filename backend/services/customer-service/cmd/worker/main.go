package main

import (
	"log/slog"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nihfery/takein/libs/go/kafkaconsumer"
	"github.com/nihfery/takein/libs/go/workerapp"
	"github.com/nihfery/takein/services/customer-service/internal/consumer"
)

func main() {
	factory := func(pool *pgxpool.Pool) kafkaconsumer.Handler { return consumer.NewDomainProcessor(pool).Process }
	if err := workerapp.RunOutboxConsumer("customer-service", "takein-customer-projections-v1", []string{"takein.identity.events.v1", "takein.booking.events.v1"}, factory); err != nil {
		slog.Error("customer worker stopped", "error", err)
		os.Exit(1)
	}
}
