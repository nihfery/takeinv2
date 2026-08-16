package runtimeapp

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nihfery/takein/libs/go/config"
	"github.com/nihfery/takein/libs/go/grpcx"
	"github.com/nihfery/takein/libs/go/logging"
	"github.com/nihfery/takein/libs/go/observability"
	"github.com/nihfery/takein/libs/go/outbox"
	"github.com/nihfery/takein/libs/go/postgres"
	"github.com/nihfery/takein/libs/go/servicehttp"
	"github.com/nihfery/takein/libs/go/shutdown"
	"google.golang.org/grpc"
)

type Register func(*gin.Engine, *pgxpool.Pool, config.Runtime) error
type ServiceRegister func(*gin.Engine, *grpc.Server, *pgxpool.Pool, config.Runtime) (func() error, error)

func Run(service string, register Register) error {
	return run(service, register, nil)
}

func RunService(service string, register ServiceRegister) error {
	return run(service, nil, register)
}

func run(service string, register Register, serviceRegister ServiceRegister) error {
	runtime, err := config.LoadRuntime(service)
	if err != nil {
		return err
	}
	logger := logging.New(runtime.ServiceName, runtime.ServiceVersion, runtime.Environment, runtime.LogLevel)
	root, cancel := shutdown.Context(context.Background())
	defer cancel()
	shutdownTracing, err := observability.Setup(root, runtime.ServiceName, runtime.ServiceVersion, runtime.Environment, runtime.OTLPEndpoint)
	if err != nil {
		return err
	}
	defer func() {
		shutdownContext, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer shutdownCancel()
		_ = shutdownTracing(shutdownContext)
	}()
	connectContext, connectCancel := context.WithTimeout(root, runtime.PostgresConnectTimeout)
	defer connectCancel()
	pool, err := postgres.Open(connectContext, postgres.PoolConfig{
		DSN:               runtime.PostgresDSN,
		MaxConns:          int32(runtime.PostgresMaxConns),
		MinConns:          int32(runtime.PostgresMinConns),
		MaxConnLifetime:   runtime.PostgresMaxConnLifetime,
		MaxConnIdleTime:   runtime.PostgresMaxConnIdleTime,
		HealthCheckPeriod: runtime.PostgresHealthCheck,
		ConnectTimeout:    runtime.PostgresConnectTimeout,
	})
	if err != nil {
		return err
	}
	defer pool.Close()
	postgres.RegisterMetrics(runtime.ServiceName, pool)
	outbox.Observe(root, pool, runtime.ServiceName)
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-root.Done():
				return
			case <-ticker.C:
				outbox.Observe(root, pool, runtime.ServiceName)
			}
		}
	}()
	server := servicehttp.New(runtime, logger)
	server.Health.Add("postgres", pool.Ping)
	var grpcServer *grpcx.Server
	if serviceRegister != nil {
		internalToken := config.String("INTERNAL_GRPC_TOKEN", "")
		if internalToken == "" && runtime.Environment != "local" && runtime.Environment != "test" {
			return fmt.Errorf("INTERNAL_GRPC_TOKEN is required outside local/test")
		}
		grpcServer, err = grpcx.NewServer(grpcx.ServerConfig{Address: runtime.GRPCAddr, Service: runtime.ServiceName, InternalToken: internalToken, Logger: logger, MaxRecvBytes: config.Int("GRPC_MAX_RECV_BYTES", 4<<20), MaxSendBytes: config.Int("GRPC_MAX_SEND_BYTES", 4<<20)})
		if err != nil {
			return fmt.Errorf("create gRPC server: %w", err)
		}
		cleanup, registerErr := serviceRegister(server.Engine, grpcServer.GRPC(), pool, runtime)
		if registerErr != nil {
			return fmt.Errorf("register service transports: %w", registerErr)
		}
		if cleanup != nil {
			defer func() { _ = cleanup() }()
		}
	} else if err := register(server.Engine, pool, runtime); err != nil {
		return fmt.Errorf("register routes: %w", err)
	}
	logger.Info("service starting", "http_addr", runtime.HTTPAddr, "pid", os.Getpid())
	if grpcServer == nil {
		return server.Run(root, runtime.ShutdownTimeout)
	}
	logger.Info("gRPC server starting", "grpc_addr", runtime.GRPCAddr)
	errorsChannel := make(chan error, 2)
	go func() { errorsChannel <- server.Run(root, runtime.ShutdownTimeout) }()
	go func() { errorsChannel <- grpcServer.Run(root, runtime.ShutdownTimeout) }()
	firstError := <-errorsChannel
	cancel()
	secondError := <-errorsChannel
	if firstError != nil {
		return firstError
	}
	return secondError
}
