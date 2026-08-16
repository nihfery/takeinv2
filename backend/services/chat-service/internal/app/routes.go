package app

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nihfery/takein/libs/go/config"
	"github.com/nihfery/takein/libs/go/jwtauth"
	"github.com/nihfery/takein/services/chat-service/internal/chat"
	httptransport "github.com/nihfery/takein/services/chat-service/internal/transport/http"
)

func RegisterRoutes(engine *gin.Engine, pool *pgxpool.Pool, _ config.Runtime) error {
	validator, err := jwtauth.NewFromEnvironment(config.String("JWT_ISSUER", "https://identity.takein.local"), config.String("JWT_AUDIENCE", "takein-api"))
	if err != nil {
		return err
	}
	origins := strings.Split(config.String("CHAT_WEBSOCKET_ORIGINS", "takein.local,localhost:*"), ",")
	httptransport.New(chat.New(pool), validator, origins).RegisterRoutes(engine)
	return nil
}
