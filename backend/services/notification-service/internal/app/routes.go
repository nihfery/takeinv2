package app

import (
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nihfery/takein/libs/go/config"
	"github.com/nihfery/takein/libs/go/jwtauth"
	"github.com/nihfery/takein/services/notification-service/internal/notification"
	httptransport "github.com/nihfery/takein/services/notification-service/internal/transport/http"
)

func RegisterRoutes(engine *gin.Engine, pool *pgxpool.Pool, _ config.Runtime) error {
	validator, err := jwtauth.NewFromEnvironment(config.String("JWT_ISSUER", "https://identity.takein.local"), config.String("JWT_AUDIENCE", "takein-api"))
	if err != nil {
		return err
	}
	httptransport.New(notification.New(pool), validator).RegisterRoutes(engine)
	return nil
}
