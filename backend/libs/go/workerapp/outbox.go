package workerapp

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nihfery/takein/libs/go/config"
	"github.com/nihfery/takein/libs/go/kafka"
	"github.com/nihfery/takein/libs/go/kafkaconsumer"
	"github.com/nihfery/takein/libs/go/kafkaoutbox"
	"github.com/nihfery/takein/libs/go/outbox"
	"github.com/nihfery/takein/libs/go/postgres"
	"github.com/nihfery/takein/libs/go/shutdown"
)

func RunOutbox(service string) error {
	return run(service, "", nil, nil, nil)
}

type ConsumerFactory func(*pgxpool.Pool) kafkaconsumer.Handler

func RunOutboxConsumer(service, group string, topics []string, factory ConsumerFactory) error {
	return run(service, group, topics, factory, nil)
}

type ScheduledJob func(context.Context, *pgxpool.Pool) error

func RunOutboxScheduled(service string, job ScheduledJob) error {
	return run(service, "", nil, nil, job)
}

func RunOutboxConsumerScheduled(service, group string, topics []string, factory ConsumerFactory, job ScheduledJob) error {
	return run(service, group, topics, factory, job)
}

func run(service, group string, topics []string, factory ConsumerFactory, job ScheduledJob) error {
	runtime, err := config.LoadRuntime(service + "-worker")
	if err != nil {
		return err
	}
	root, cancel := shutdown.Context(context.Background())
	defer cancel()
	pool, err := postgres.Open(root, postgres.PoolConfig{DSN: runtime.PostgresDSN, MaxConns: int32(runtime.PostgresMaxConns), MinConns: int32(runtime.PostgresMinConns), ConnectTimeout: runtime.PostgresConnectTimeout, HealthCheckPeriod: runtime.PostgresHealthCheck, MaxConnIdleTime: runtime.PostgresMaxConnIdleTime, MaxConnLifetime: runtime.PostgresMaxConnLifetime})
	if err != nil {
		return err
	}
	defer pool.Close()
	postgres.RegisterMetrics(runtime.ServiceName, pool)
	client, err := kafka.Open(root, kafka.Config{Brokers: runtime.KafkaBrokers, ClientID: runtime.ServiceName, ConsumerGroup: group, Topics: topics, MaxRetries: runtime.KafkaMaxRetries, SecurityProtocol: runtime.KafkaSecurityProtocol, SASLMechanism: runtime.KafkaSASLMechanism, Username: runtime.KafkaUsername, Password: runtime.KafkaPassword, TLSCAFile: runtime.KafkaTLSCAFile, TLSServerName: runtime.KafkaTLSServerName})
	if err != nil {
		return err
	}
	defer client.Close()
	failures := make(chan error, 4)
	metricsErrors := ServeMetrics(root, config.String("METRICS_ADDR", ":8081"))
	go func() { failures <- <-metricsErrors }()
	go func() {
		failures <- outbox.Run(root, outbox.NewForService(pool, runtime.ServiceName), kafkaoutbox.New(client), config.Duration("OUTBOX_POLL_INTERVAL", 250*time.Millisecond), config.Int("OUTBOX_BATCH_SIZE", 100))
	}()
	if factory != nil {
		runner := kafkaconsumer.Runner{Client: client, Service: runtime.ServiceName, ConsumerGroup: group, MaxRetries: runtime.KafkaConsumerMaxRetries, Handle: factory(pool)}
		go func() { failures <- runner.Run(root) }()
	}
	if job != nil {
		go func() { failures <- job(root, pool) }()
	}
	err = <-failures
	cancel()
	if errors.Is(err, context.Canceled) {
		return nil
	}
	return err
}
