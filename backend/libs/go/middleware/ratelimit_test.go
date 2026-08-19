package middleware

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

func TestRateLimitFallsBackWhenRedisClientIsTypedNil(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var client *redis.Client
	engine := gin.New()
	engine.Use(RateLimit(client, "identity-service", map[string]RatePolicy{
		"POST /api/auth/login": {Limit: 10, Window: time.Minute},
	}, slog.New(slog.NewTextHandler(io.Discard, nil))))
	engine.POST("/api/auth/login", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	request := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/auth/login", nil)
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected request to use memory fallback and continue, got status %d", response.Code)
	}
}
