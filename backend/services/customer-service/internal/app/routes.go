package app

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	customerv1 "github.com/nihfery/takein/gen/go/takein/customer/v1"
	"github.com/nihfery/takein/libs/go/config"
	"github.com/nihfery/takein/libs/go/grpcx"
	"github.com/nihfery/takein/libs/go/jwtauth"
	bookingclient "github.com/nihfery/takein/services/customer-service/internal/clients/booking"
	identityclient "github.com/nihfery/takein/services/customer-service/internal/clients/identity"
	mediaclient "github.com/nihfery/takein/services/customer-service/internal/clients/media"
	"github.com/nihfery/takein/services/customer-service/internal/customer"
	postgresrepo "github.com/nihfery/takein/services/customer-service/internal/persistence/postgres"
	grpctransport "github.com/nihfery/takein/services/customer-service/internal/transport/grpc"
	httptransport "github.com/nihfery/takein/services/customer-service/internal/transport/http"
	"google.golang.org/grpc"
)

func RegisterRoutes(engine *gin.Engine, pool *pgxpool.Pool, _ config.Runtime) error {
	validator, err := jwtauth.NewFromEnvironment(config.String("JWT_ISSUER", "https://identity.takein.local"), config.String("JWT_AUDIENCE", "takein-api"))
	if err != nil {
		return err
	}
	repository := postgresrepo.New(pool)
	httptransport.New(customer.NewService(repository), validator).RegisterRoutes(engine)
	return nil
}

func RegisterService(engine *gin.Engine, grpcServer *grpc.Server, pool *pgxpool.Pool, runtime config.Runtime) (func() error, error) {
	validator, err := jwtauth.NewFromEnvironment(config.String("JWT_ISSUER", "https://identity.takein.local"), config.String("JWT_AUDIENCE", "takein-api"))
	if err != nil {
		return nil, err
	}
	bookingConnection, err := grpcx.Dial(grpcx.ClientConfig{Address: config.String("BOOKING_GRPC_ADDR", "booking-service:9090"), InternalToken: config.String("INTERNAL_GRPC_TOKEN", ""), DefaultTimeout: config.Duration("GRPC_CLIENT_TIMEOUT", 3*time.Second), TLSCAFile: config.String("GRPC_TLS_CA_FILE", ""), TLSServerName: config.String("BOOKING_GRPC_TLS_SERVER_NAME", "")})
	if err != nil {
		return nil, err
	}
	identityConnection, err := grpcx.Dial(grpcx.ClientConfig{Address: config.String("IDENTITY_GRPC_ADDR", "identity-service:9090"), InternalToken: config.String("INTERNAL_GRPC_TOKEN", ""), DefaultTimeout: config.Duration("GRPC_CLIENT_TIMEOUT", 3*time.Second), TLSCAFile: config.String("GRPC_TLS_CA_FILE", ""), TLSServerName: config.String("IDENTITY_GRPC_TLS_SERVER_NAME", "")})
	if err != nil {
		_ = bookingConnection.Close()
		return nil, err
	}
	mediaConnection, err := grpcx.Dial(grpcx.ClientConfig{Address: config.String("MEDIA_GRPC_ADDR", "media-service:9090"), InternalToken: config.String("INTERNAL_GRPC_TOKEN", ""), DefaultTimeout: config.Duration("GRPC_CLIENT_TIMEOUT", 10*time.Second), TLSCAFile: config.String("GRPC_TLS_CA_FILE", ""), TLSServerName: config.String("MEDIA_GRPC_TLS_SERVER_NAME", "")})
	if err != nil {
		_ = identityConnection.Close()
		_ = bookingConnection.Close()
		return nil, err
	}
	service := customer.NewService(postgresrepo.New(pool))
	service.ConfigureBooking(bookingclient.New(bookingConnection))
	service.ConfigureIdentity(identityclient.New(identityConnection))
	service.ConfigureMedia(mediaclient.New(mediaConnection))
	httptransport.New(service, validator).RegisterRoutes(engine)
	customerv1.RegisterCustomerServiceServer(grpcServer, grpctransport.New(service))
	_ = runtime
	return func() error {
		mediaErr := mediaConnection.Close()
		identityErr := identityConnection.Close()
		bookingErr := bookingConnection.Close()
		if mediaErr != nil {
			return mediaErr
		}
		if identityErr != nil {
			return identityErr
		}
		return bookingErr
	}, nil
}
