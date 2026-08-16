package app

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	bookingv1 "github.com/nihfery/takein/gen/go/takein/booking/v1"
	"github.com/nihfery/takein/libs/go/config"
	"github.com/nihfery/takein/libs/go/grpcx"
	"github.com/nihfery/takein/libs/go/jwtauth"
	"github.com/nihfery/takein/services/booking-service/internal/booking"
	catalogclient "github.com/nihfery/takein/services/booking-service/internal/clients/catalog"
	providerclient "github.com/nihfery/takein/services/booking-service/internal/clients/provider"
	postgresrepo "github.com/nihfery/takein/services/booking-service/internal/persistence/postgres"
	grpctransport "github.com/nihfery/takein/services/booking-service/internal/transport/grpc"
	httptransport "github.com/nihfery/takein/services/booking-service/internal/transport/http"
	"google.golang.org/grpc"
)

func RegisterRoutes(engine *gin.Engine, pool *pgxpool.Pool, _ config.Runtime) error {
	validator, err := jwtauth.NewFromEnvironment(config.String("JWT_ISSUER", "https://identity.takein.local"), config.String("JWT_AUDIENCE", "takein-api"))
	if err != nil {
		return err
	}
	repository := postgresrepo.New(pool)
	httptransport.New(booking.NewService(repository), validator).RegisterRoutes(engine)
	return nil
}

func RegisterService(engine *gin.Engine, grpcServer *grpc.Server, pool *pgxpool.Pool, runtime config.Runtime) (func() error, error) {
	validator, err := jwtauth.NewFromEnvironment(config.String("JWT_ISSUER", "https://identity.takein.local"), config.String("JWT_AUDIENCE", "takein-api"))
	if err != nil {
		return nil, err
	}
	catalogConnection, err := grpcx.Dial(grpcx.ClientConfig{Address: config.String("CATALOG_GRPC_ADDR", "catalog-service:9090"), InternalToken: config.String("INTERNAL_GRPC_TOKEN", ""), DefaultTimeout: config.Duration("GRPC_CLIENT_TIMEOUT", 3*time.Second), TLSCAFile: config.String("GRPC_TLS_CA_FILE", ""), TLSServerName: config.String("CATALOG_GRPC_TLS_SERVER_NAME", "")})
	if err != nil {
		return nil, err
	}
	providerConnection, err := grpcx.Dial(grpcx.ClientConfig{Address: config.String("PROVIDER_GRPC_ADDR", "provider-service:9090"), InternalToken: config.String("INTERNAL_GRPC_TOKEN", ""), DefaultTimeout: config.Duration("GRPC_CLIENT_TIMEOUT", 3*time.Second), TLSCAFile: config.String("GRPC_TLS_CA_FILE", ""), TLSServerName: config.String("PROVIDER_GRPC_TLS_SERVER_NAME", "")})
	if err != nil {
		_ = catalogConnection.Close()
		return nil, err
	}
	repository := postgresrepo.New(pool)
	service := booking.NewService(repository)
	service.ConfigureDependencies(catalogclient.New(catalogConnection), providerclient.New(providerConnection))
	httptransport.New(service, validator).RegisterRoutes(engine)
	bookingv1.RegisterBookingServiceServer(grpcServer, grpctransport.New(service))
	_ = runtime
	return func() error {
		providerErr := providerConnection.Close()
		catalogErr := catalogConnection.Close()
		if providerErr != nil {
			return providerErr
		}
		return catalogErr
	}, nil
}
