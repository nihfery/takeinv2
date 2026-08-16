package main

import (
	"log/slog"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nihfery/takein/libs/go/kafkaconsumer"
	"github.com/nihfery/takein/libs/go/workerapp"
	"github.com/nihfery/takein/services/provider-service/internal/consumer"
)

func main() {
	factory := func(pool *pgxpool.Pool) kafkaconsumer.Handler { return consumer.NewIdentityProcessor(pool).Process }
	if err := workerapp.RunOutboxConsumer("provider-service", "takein-provider-identity-v1", []string{"takein.identity.events.v1", "takein.booking.events.v1"}, factory); err != nil {
		slog.Error("provider worker stopped", "error", err)
		os.Exit(1)
	}
}
