package app

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	paymentv1 "github.com/nihfery/takein/gen/go/takein/payment/v1"
	"github.com/nihfery/takein/libs/go/config"
	"github.com/nihfery/takein/libs/go/grpcx"
	"github.com/nihfery/takein/libs/go/jwtauth"
	httpmiddleware "github.com/nihfery/takein/libs/go/middleware"
	"github.com/nihfery/takein/libs/go/redisx"
	bookingclient "github.com/nihfery/takein/services/payment-service/internal/clients/booking"
	"github.com/nihfery/takein/services/payment-service/internal/midtrans"
	"github.com/nihfery/takein/services/payment-service/internal/payment"
	postgresrepo "github.com/nihfery/takein/services/payment-service/internal/persistence/postgres"
	grpctransport "github.com/nihfery/takein/services/payment-service/internal/transport/grpc"
	httptransport "github.com/nihfery/takein/services/payment-service/internal/transport/http"
	"google.golang.org/grpc"
)

func RegisterRoutes(engine *gin.Engine, pool *pgxpool.Pool, runtime config.Runtime) error {
	serverKey := strings.TrimSpace(os.Getenv("MIDTRANS_SERVER_KEY"))
	if serverKey == "" && runtime.Environment != "test" {
		return errors.New("MIDTRANS_SERVER_KEY is required outside tests")
	}
	validator, err := jwtauth.NewFromEnvironment(config.String("JWT_ISSUER", "https://identity.takein.local"), config.String("JWT_AUDIENCE", "takein-api"))
	if err != nil {
		return err
	}
	gateway := midtrans.New(config.String("MIDTRANS_BASE_URL", "https://app.sandbox.midtrans.com"), serverKey, config.Duration("MIDTRANS_TIMEOUT", 10*time.Second))
	repository := postgresrepo.New(pool)
	httptransport.New(payment.NewService(repository, gateway, serverKey), validator).RegisterRoutes(engine)
	return nil
}

func RegisterService(engine *gin.Engine, grpcServer *grpc.Server, pool *pgxpool.Pool, runtime config.Runtime) (func() error, error) {
	serverKey := strings.TrimSpace(os.Getenv("MIDTRANS_SERVER_KEY"))
	if serverKey == "" && runtime.Environment != "test" && runtime.Environment != "local" {
		return nil, errors.New("MIDTRANS_SERVER_KEY is required outside local/test")
	}
	validator, err := jwtauth.NewFromEnvironment(config.String("JWT_ISSUER", "https://identity.takein.local"), config.String("JWT_AUDIENCE", "takein-api"))
	if err != nil {
		return nil, err
	}
	connection, err := grpcx.Dial(grpcx.ClientConfig{Address: config.String("BOOKING_GRPC_ADDR", "booking-service:9090"), InternalToken: config.String("INTERNAL_GRPC_TOKEN", ""), DefaultTimeout: config.Duration("GRPC_CLIENT_TIMEOUT", 3*time.Second), TLSCAFile: config.String("GRPC_TLS_CA_FILE", ""), TLSServerName: config.String("BOOKING_GRPC_TLS_SERVER_NAME", "")})
	if err != nil {
		return nil, err
	}
	gateway := midtrans.New(config.String("MIDTRANS_BASE_URL", "https://app.sandbox.midtrans.com"), serverKey, config.Duration("MIDTRANS_TIMEOUT", 10*time.Second))
	service := payment.NewService(postgresrepo.New(pool), gateway, serverKey)
	service.ConfigureBooking(bookingclient.New(connection), config.Bool("PAYMENT_ALLOW_MANUAL_CONFIRMATION", runtime.Environment == "local" || runtime.Environment == "test"))
	redisContext, redisCancel := context.WithTimeout(context.Background(), config.Duration("REDIS_CONNECT_TIMEOUT", 2*time.Second))
	redisClient, redisErr := redisx.Open(redisContext, runtime.RedisAddr, runtime.RedisPassword, config.Int("REDIS_DB", 0))
	redisCancel()
	if redisErr != nil && runtime.Environment != "local" && runtime.Environment != "test" {
		_ = connection.Close()
		return nil, redisErr
	}
	engine.Use(httpmiddleware.RateLimit(redisClient, runtime.ServiceName, map[string]httpmiddleware.RatePolicy{
		"POST /api/midtrans/notification":                               {Limit: int64(config.Int("RATE_LIMIT_WEBHOOK", 120)), Window: time.Minute},
		"POST /api/customer/bookings/code/:bookingCode/payment/confirm": {Limit: int64(config.Int("RATE_LIMIT_MANUAL_CONFIRM", 10)), Window: time.Minute},
	}, slog.Default()))
	httptransport.New(service, validator).RegisterRoutes(engine)
	paymentv1.RegisterPaymentServiceServer(grpcServer, grpctransport.New(service))
	return func() error {
		if redisClient != nil {
			_ = redisClient.Close()
		}
		return connection.Close()
	}, nil
}
