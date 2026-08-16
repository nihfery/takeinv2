package app

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	billingv1 "github.com/nihfery/takein/gen/go/takein/billing/v1"
	"github.com/nihfery/takein/libs/go/config"
	"github.com/nihfery/takein/libs/go/grpcx"
	"github.com/nihfery/takein/libs/go/jwtauth"
	"github.com/nihfery/takein/services/billing-service/internal/billing"
	paymentclient "github.com/nihfery/takein/services/billing-service/internal/clients/payment"
	postgresrepo "github.com/nihfery/takein/services/billing-service/internal/persistence/postgres"
	grpctransport "github.com/nihfery/takein/services/billing-service/internal/transport/grpc"
	httptransport "github.com/nihfery/takein/services/billing-service/internal/transport/http"
	"google.golang.org/grpc"
)

func RegisterRoutes(engine *gin.Engine, pool *pgxpool.Pool, _ config.Runtime) error {
	validator, err := jwtauth.NewFromEnvironment(config.String("JWT_ISSUER", "https://identity.takein.local"), config.String("JWT_AUDIENCE", "takein-api"))
	if err != nil {
		return err
	}
	repository := postgresrepo.New(pool)
	httptransport.New(billing.NewService(repository), validator).RegisterRoutes(engine)
	return nil
}

func RegisterService(engine *gin.Engine, grpcServer *grpc.Server, pool *pgxpool.Pool, runtime config.Runtime) (func() error, error) {
	validator, err := jwtauth.NewFromEnvironment(config.String("JWT_ISSUER", "https://identity.takein.local"), config.String("JWT_AUDIENCE", "takein-api"))
	if err != nil {
		return nil, err
	}
	connection, err := grpcx.Dial(grpcx.ClientConfig{Address: config.String("PAYMENT_GRPC_ADDR", "payment-service:9090"), InternalToken: config.String("INTERNAL_GRPC_TOKEN", ""), DefaultTimeout: config.Duration("GRPC_CLIENT_TIMEOUT", 5*time.Second), TLSCAFile: config.String("GRPC_TLS_CA_FILE", ""), TLSServerName: config.String("PAYMENT_GRPC_TLS_SERVER_NAME", "")})
	if err != nil {
		return nil, err
	}
	service := billing.NewService(postgresrepo.New(pool))
	service.ConfigurePayment(paymentclient.New(connection))
	httptransport.New(service, validator).RegisterRoutes(engine)
	billingv1.RegisterBillingServiceServer(grpcServer, grpctransport.New(service))
	_ = runtime
	return connection.Close, nil
}
