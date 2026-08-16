package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"time"

	"github.com/nihfery/takein/libs/go/config"
	"github.com/nihfery/takein/libs/go/kafka"
	"github.com/nihfery/takein/libs/go/kafkaconsumer"
	"github.com/nihfery/takein/libs/go/kafkaoutbox"
	"github.com/nihfery/takein/libs/go/outbox"
	"github.com/nihfery/takein/libs/go/postgres"
	"github.com/nihfery/takein/libs/go/shutdown"
	"github.com/nihfery/takein/libs/go/workerapp"
	"github.com/nihfery/takein/services/billing-service/internal/consumer"
	postgresrepo "github.com/nihfery/takein/services/billing-service/internal/persistence/postgres"
)

func main() {
	if err := run(); err != nil {
		slog.Error("billing worker stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	runtime, err := config.LoadRuntime("billing-worker")
	if err != nil {
		return err
	}
	ctx, cancel := shutdown.Context(context.Background())
	defer cancel()
	pool, err := postgres.Open(ctx, postgres.PoolConfig{DSN: runtime.PostgresDSN, MaxConns: 10, MinConns: 1, ConnectTimeout: 5 * time.Second, HealthCheckPeriod: 30 * time.Second, MaxConnIdleTime: 5 * time.Minute, MaxConnLifetime: 30 * time.Minute})
	if err != nil {
		return err
	}
	defer pool.Close()
	postgres.RegisterMetrics(runtime.ServiceName, pool)
	client, err := kafka.Open(ctx, kafka.Config{Brokers: runtime.KafkaBrokers, ClientID: runtime.ServiceName, ConsumerGroup: "takein-billing-payment-v1", Topics: []string{"takein.payment.events.v1"}, MaxRetries: runtime.KafkaMaxRetries, SecurityProtocol: runtime.KafkaSecurityProtocol, SASLMechanism: runtime.KafkaSASLMechanism, Username: runtime.KafkaUsername, Password: runtime.KafkaPassword, TLSCAFile: runtime.KafkaTLSCAFile, TLSServerName: runtime.KafkaTLSServerName})
	if err != nil {
		return err
	}
	defer client.Close()
	failures := make(chan error, 3)
	metricsErrors := workerapp.ServeMetrics(ctx, config.String("METRICS_ADDR", ":8081"))
	go func() { failures <- <-metricsErrors }()
	go func() {
		failures <- outbox.Run(ctx, outbox.NewForService(pool, runtime.ServiceName), kafkaoutbox.New(client), 250*time.Millisecond, 100)
	}()
	go func() {
		processor := consumer.NewPaymentProcessor(postgresrepo.New(pool), client, "takein.payment.events.v1.dlq", 5)
		failures <- (kafkaconsumer.Runner{Client: client, Service: runtime.ServiceName, ConsumerGroup: "takein-billing-payment-v1", MaxRetries: 5, Handle: processor.Process}).Run(ctx)
	}()
	err = <-failures
	cancel()
	if errors.Is(err, context.Canceled) {
		return nil
	}
	return err
}
