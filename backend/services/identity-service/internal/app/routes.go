package app

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	identityv1 "github.com/nihfery/takein/gen/go/takein/identity/v1"
	"github.com/nihfery/takein/libs/go/config"
	"github.com/nihfery/takein/libs/go/jwtauth"
	httpmiddleware "github.com/nihfery/takein/libs/go/middleware"
	"github.com/nihfery/takein/libs/go/redisx"
	"github.com/nihfery/takein/services/identity-service/internal/identity"
	postgresrepo "github.com/nihfery/takein/services/identity-service/internal/persistence/postgres"
	"github.com/nihfery/takein/services/identity-service/internal/security"
	grpctransport "github.com/nihfery/takein/services/identity-service/internal/transport/grpc"
	httptransport "github.com/nihfery/takein/services/identity-service/internal/transport/http"
	"google.golang.org/grpc"
)

func RegisterRoutes(engine *gin.Engine, pool *pgxpool.Pool, runtime config.Runtime) error {
	service, issuer, validator, err := dependencies(pool, runtime)
	if err != nil {
		return err
	}
	httptransport.New(service, issuer, validator).RegisterRoutes(engine)
	return nil
}

func RegisterService(engine *gin.Engine, grpcServer *grpc.Server, pool *pgxpool.Pool, runtime config.Runtime) (func() error, error) {
	service, issuer, validator, err := dependencies(pool, runtime)
	if err != nil {
		return nil, err
	}
	redisContext, redisCancel := context.WithTimeout(context.Background(), config.Duration("REDIS_CONNECT_TIMEOUT", 2*time.Second))
	redisClient, redisErr := redisx.Open(redisContext, runtime.RedisAddr, runtime.RedisPassword, config.Int("REDIS_DB", 0))
	redisCancel()
	if redisErr != nil && runtime.Environment != "local" && runtime.Environment != "test" {
		return nil, redisErr
	}
	engine.Use(httpmiddleware.RateLimit(redisClient, runtime.ServiceName, map[string]httpmiddleware.RatePolicy{
		"POST /api/auth/register/customer": {Limit: int64(config.Int("RATE_LIMIT_REGISTER", 10)), Window: time.Minute},
		"POST /api/auth/register/provider": {Limit: int64(config.Int("RATE_LIMIT_REGISTER", 10)), Window: time.Minute},
		"POST /api/auth/login":             {Limit: int64(config.Int("RATE_LIMIT_LOGIN", 10)), Window: time.Minute},
		"POST /internal/v1/auth/refresh":   {Limit: int64(config.Int("RATE_LIMIT_REFRESH", 20)), Window: time.Minute},
	}, slog.Default()))
	httptransport.New(service, issuer, validator).RegisterRoutes(engine)
	identityv1.RegisterIdentityServiceServer(grpcServer, grpctransport.New(service, validator))
	if redisClient == nil {
		return nil, nil
	}
	return redisClient.Close, nil
}

func dependencies(pool *pgxpool.Pool, runtime config.Runtime) (*identity.Service, *security.TokenIssuer, *jwtauth.Validator, error) {
	privateKey := strings.ReplaceAll(os.Getenv("JWT_PRIVATE_KEY"), `\n`, "\n")
	privateKeyFile := strings.TrimSpace(os.Getenv("JWT_PRIVATE_KEY_FILE"))
	if privateKey == "" && privateKeyFile != "" {
		if contents, readErr := os.ReadFile(privateKeyFile); readErr == nil {
			privateKey = string(contents)
		} else if !os.IsNotExist(readErr) {
			return nil, nil, nil, readErr
		}
	}
	issuer, err := security.NewTokenIssuer(privateKey,
		config.String("JWT_ISSUER", "https://identity.takein.local"), config.String("JWT_AUDIENCE", "takein-api"),
		config.String("JWT_KEY_ID", "local-ephemeral"), config.Duration("ACCESS_TOKEN_TTL", 15*time.Minute),
		config.Duration("REFRESH_TOKEN_TTL", 30*24*time.Hour), runtime.Environment == "local" || runtime.Environment == "test")
	if err != nil {
		return nil, nil, nil, err
	}
	if privateKeyFile != "" {
		if err = persistLocalKeys(privateKeyFile, config.String("JWT_PUBLIC_KEY_FILE", ""), issuer); err != nil {
			return nil, nil, nil, err
		}
	}
	validator, err := jwtauth.New(issuer.PublicKeyPEM(), config.String("JWT_ISSUER", "https://identity.takein.local"), config.String("JWT_AUDIENCE", "takein-api"))
	if err != nil {
		return nil, nil, nil, err
	}
	repository := postgresrepo.NewRepository(pool)
	service := identity.NewService(repository, security.NewPasswordHasher(), issuer)
	return service, issuer, validator, nil
}

func persistLocalKeys(privatePath, publicPath string, issuer *security.TokenIssuer) error {
	if err := os.MkdirAll(filepath.Dir(privatePath), 0o700); err != nil {
		return err
	}
	if _, err := os.Stat(privatePath); os.IsNotExist(err) {
		if err = os.WriteFile(privatePath, []byte(issuer.PrivateKeyPEM()), 0o600); err != nil {
			return err
		}
	}
	if publicPath != "" {
		if err := os.WriteFile(publicPath, []byte(issuer.PublicKeyPEM()), 0o644); err != nil {
			return err
		}
	}
	return nil
}
