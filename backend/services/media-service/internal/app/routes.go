package app

import (
	"errors"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	mediav1 "github.com/nihfery/takein/gen/go/takein/media/v1"
	"github.com/nihfery/takein/libs/go/config"
	"github.com/nihfery/takein/libs/go/jwtauth"
	"github.com/nihfery/takein/services/media-service/internal/media"
	"github.com/nihfery/takein/services/media-service/internal/storage"
	grpctransport "github.com/nihfery/takein/services/media-service/internal/transport/grpc"
	httptransport "github.com/nihfery/takein/services/media-service/internal/transport/http"
	"google.golang.org/grpc"
)

func RegisterRoutes(engine *gin.Engine, pool *pgxpool.Pool, runtime config.Runtime) error {
	access := strings.TrimSpace(os.Getenv("S3_ACCESS_KEY_ID"))
	secret := strings.TrimSpace(os.Getenv("S3_SECRET_ACCESS_KEY"))
	if (access == "" || secret == "") && runtime.Environment != "test" {
		return errors.New("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required outside tests")
	}
	validator, err := jwtauth.NewFromEnvironment(config.String("JWT_ISSUER", "https://identity.takein.local"), config.String("JWT_AUDIENCE", "takein-api"))
	if err != nil {
		return err
	}
	signer := storage.NewSigner(config.String("S3_ENDPOINT", "https://example.r2.cloudflarestorage.com"), access, secret, config.String("S3_REGION", "auto"))
	httptransport.New(media.New(pool), signer, validator, config.String("S3_BUCKET", "takein-private")).RegisterRoutes(engine)
	return nil
}

func RegisterService(engine *gin.Engine, grpcServer *grpc.Server, pool *pgxpool.Pool, runtime config.Runtime) (func() error, error) {
	access := strings.TrimSpace(os.Getenv("S3_ACCESS_KEY_ID"))
	secret := strings.TrimSpace(os.Getenv("S3_SECRET_ACCESS_KEY"))
	if access == "" || secret == "" {
		if runtime.Environment != "local" && runtime.Environment != "test" {
			return nil, errors.New("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required outside local/test")
		}
		access, secret = "local-access", "local-secret"
	}
	validator, err := jwtauth.NewFromEnvironment(config.String("JWT_ISSUER", "https://identity.takein.local"), config.String("JWT_AUDIENCE", "takein-api"))
	if err != nil {
		return nil, err
	}
	signer := storage.NewSigner(config.String("S3_ENDPOINT", "http://object-storage.invalid"), access, secret, config.String("S3_REGION", "auto"))
	repository := media.New(pool)
	httptransport.New(repository, signer, validator, config.String("S3_BUCKET", "takein-private")).RegisterRoutes(engine)
	mediav1.RegisterMediaServiceServer(grpcServer, grpctransport.New(repository, signer, config.String("S3_BUCKET", "takein-private")))
	return nil, nil
}
