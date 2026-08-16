package app

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	catalogv1 "github.com/nihfery/takein/gen/go/takein/catalog/v1"
	"github.com/nihfery/takein/libs/go/config"
	"github.com/nihfery/takein/libs/go/grpcx"
	"github.com/nihfery/takein/libs/go/jwtauth"
	"github.com/nihfery/takein/services/catalog-service/internal/catalog"
	mediaclient "github.com/nihfery/takein/services/catalog-service/internal/clients/media"
	providerclient "github.com/nihfery/takein/services/catalog-service/internal/clients/provider"
	postgresrepo "github.com/nihfery/takein/services/catalog-service/internal/persistence/postgres"
	grpctransport "github.com/nihfery/takein/services/catalog-service/internal/transport/grpc"
	httptransport "github.com/nihfery/takein/services/catalog-service/internal/transport/http"
	"google.golang.org/grpc"
)

func RegisterRoutes(engine *gin.Engine, pool *pgxpool.Pool, _ config.Runtime) error {
	validator, err := jwtauth.NewFromEnvironment(config.String("JWT_ISSUER", "https://identity.takein.local"), config.String("JWT_AUDIENCE", "takein-api"))
	if err != nil {
		return err
	}
	repository := postgresrepo.New(pool)
	httptransport.New(catalog.NewService(repository), validator).RegisterRoutes(engine)
	return nil
}

func RegisterService(engine *gin.Engine, grpcServer *grpc.Server, pool *pgxpool.Pool, runtime config.Runtime) (func() error, error) {
	validator, err := jwtauth.NewFromEnvironment(config.String("JWT_ISSUER", "https://identity.takein.local"), config.String("JWT_AUDIENCE", "takein-api"))
	if err != nil {
		return nil, err
	}
	connection, err := grpcx.Dial(grpcx.ClientConfig{Address: config.String("PROVIDER_GRPC_ADDR", "provider-service:9090"), InternalToken: config.String("INTERNAL_GRPC_TOKEN", ""), DefaultTimeout: config.Duration("GRPC_CLIENT_TIMEOUT", 3*time.Second), TLSCAFile: config.String("GRPC_TLS_CA_FILE", ""), TLSServerName: config.String("PROVIDER_GRPC_TLS_SERVER_NAME", "")})
	if err != nil {
		return nil, err
	}
	mediaConnection, err := grpcx.Dial(grpcx.ClientConfig{Address: config.String("MEDIA_GRPC_ADDR", "media-service:9090"), InternalToken: config.String("INTERNAL_GRPC_TOKEN", ""), DefaultTimeout: config.Duration("GRPC_CLIENT_TIMEOUT", 10*time.Second), TLSCAFile: config.String("GRPC_TLS_CA_FILE", ""), TLSServerName: config.String("MEDIA_GRPC_TLS_SERVER_NAME", "")})
	if err != nil {
		_ = connection.Close()
		return nil, err
	}
	service := catalog.NewService(postgresrepo.New(pool))
	service.ConfigureProvider(providerclient.New(connection))
	service.ConfigureMedia(mediaclient.New(mediaConnection))
	httptransport.New(service, validator).RegisterRoutes(engine)
	catalogv1.RegisterCatalogServiceServer(grpcServer, grpctransport.New(service))
	_ = runtime
	return func() error {
		mediaErr := mediaConnection.Close()
		providerErr := connection.Close()
		if mediaErr != nil {
			return mediaErr
		}
		return providerErr
	}, nil
}
