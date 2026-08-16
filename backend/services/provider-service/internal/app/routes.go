package app

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	providerv1 "github.com/nihfery/takein/gen/go/takein/provider/v1"
	"github.com/nihfery/takein/libs/go/config"
	"github.com/nihfery/takein/libs/go/grpcx"
	"github.com/nihfery/takein/libs/go/jwtauth"
	billingclient "github.com/nihfery/takein/services/provider-service/internal/clients/billing"
	catalogclient "github.com/nihfery/takein/services/provider-service/internal/clients/catalog"
	identityclient "github.com/nihfery/takein/services/provider-service/internal/clients/identity"
	mediaclient "github.com/nihfery/takein/services/provider-service/internal/clients/media"
	postgresrepo "github.com/nihfery/takein/services/provider-service/internal/persistence/postgres"
	"github.com/nihfery/takein/services/provider-service/internal/provider"
	grpctransport "github.com/nihfery/takein/services/provider-service/internal/transport/grpc"
	httptransport "github.com/nihfery/takein/services/provider-service/internal/transport/http"
	"google.golang.org/grpc"
)

func RegisterRoutes(engine *gin.Engine, pool *pgxpool.Pool, _ config.Runtime) error {
	validator, err := jwtauth.NewFromEnvironment(config.String("JWT_ISSUER", "https://identity.takein.local"), config.String("JWT_AUDIENCE", "takein-api"))
	if err != nil {
		return err
	}
	repository := postgresrepo.New(pool)
	httptransport.New(provider.NewService(repository), validator).RegisterRoutes(engine)
	return nil
}

func RegisterService(engine *gin.Engine, grpcServer *grpc.Server, pool *pgxpool.Pool, runtime config.Runtime) (func() error, error) {
	validator, err := jwtauth.NewFromEnvironment(config.String("JWT_ISSUER", "https://identity.takein.local"), config.String("JWT_AUDIENCE", "takein-api"))
	if err != nil {
		return nil, err
	}
	connection, err := grpcx.Dial(grpcx.ClientConfig{Address: config.String("BILLING_GRPC_ADDR", "billing-service:9090"), InternalToken: config.String("INTERNAL_GRPC_TOKEN", ""), DefaultTimeout: config.Duration("GRPC_CLIENT_TIMEOUT", 3*time.Second), TLSCAFile: config.String("GRPC_TLS_CA_FILE", ""), TLSServerName: config.String("BILLING_GRPC_TLS_SERVER_NAME", "")})
	if err != nil {
		return nil, err
	}
	identityConnection, err := grpcx.Dial(grpcx.ClientConfig{Address: config.String("IDENTITY_GRPC_ADDR", "identity-service:9090"), InternalToken: config.String("INTERNAL_GRPC_TOKEN", ""), DefaultTimeout: config.Duration("GRPC_CLIENT_TIMEOUT", 3*time.Second), TLSCAFile: config.String("GRPC_TLS_CA_FILE", ""), TLSServerName: config.String("IDENTITY_GRPC_TLS_SERVER_NAME", "")})
	if err != nil {
		_ = connection.Close()
		return nil, err
	}
	mediaConnection, err := grpcx.Dial(grpcx.ClientConfig{Address: config.String("MEDIA_GRPC_ADDR", "media-service:9090"), InternalToken: config.String("INTERNAL_GRPC_TOKEN", ""), DefaultTimeout: config.Duration("GRPC_CLIENT_TIMEOUT", 10*time.Second), TLSCAFile: config.String("GRPC_TLS_CA_FILE", ""), TLSServerName: config.String("MEDIA_GRPC_TLS_SERVER_NAME", "")})
	if err != nil {
		_ = identityConnection.Close()
		_ = connection.Close()
		return nil, err
	}
	catalogConnection, err := grpcx.Dial(grpcx.ClientConfig{Address: config.String("CATALOG_GRPC_ADDR", "catalog-service:9090"), InternalToken: config.String("INTERNAL_GRPC_TOKEN", ""), DefaultTimeout: config.Duration("GRPC_CLIENT_TIMEOUT", 3*time.Second), TLSCAFile: config.String("GRPC_TLS_CA_FILE", ""), TLSServerName: config.String("CATALOG_GRPC_TLS_SERVER_NAME", "")})
	if err != nil {
		_ = mediaConnection.Close()
		_ = identityConnection.Close()
		_ = connection.Close()
		return nil, err
	}
	service := provider.NewService(postgresrepo.New(pool))
	billing := billingclient.New(connection)
	service.ConfigureBilling(billing)
	service.ConfigureIdentity(identityclient.New(identityConnection))
	service.ConfigureMedia(mediaclient.New(mediaConnection))
	service.ConfigureCatalog(catalogclient.New(catalogConnection))
	httptransport.New(service, validator).RegisterRoutes(engine)
	providerv1.RegisterProviderServiceServer(grpcServer, grpctransport.New(service, billing))
	_ = runtime
	return func() error {
		catalogErr := catalogConnection.Close()
		mediaErr := mediaConnection.Close()
		identityErr := identityConnection.Close()
		billingErr := connection.Close()
		if catalogErr != nil {
			return catalogErr
		}
		if mediaErr != nil {
			return mediaErr
		}
		if identityErr != nil {
			return identityErr
		}
		return billingErr
	}, nil
}
