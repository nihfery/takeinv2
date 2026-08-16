package servicehttp

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nihfery/takein/libs/go/config"
	"github.com/nihfery/takein/libs/go/health"
	httpmiddleware "github.com/nihfery/takein/libs/go/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Server struct {
	HTTP    *http.Server
	Engine  *gin.Engine
	Health  *health.Registry
	logger  *slog.Logger
	timeout time.Duration
}

func New(runtime config.Runtime, logger *slog.Logger) *Server {
	gin.SetMode(gin.ReleaseMode)
	engine := gin.New()
	registry := health.New()
	engine.Use(
		httpmiddleware.Recovery(logger),
		httpmiddleware.RequestContext(),
		httpmiddleware.Tracing(runtime.ServiceName),
		httpmiddleware.Metrics(runtime.ServiceName),
		httpmiddleware.SecurityHeaders(),
		httpmiddleware.AccessLog(logger),
		httpmiddleware.CORS(runtime.CORSOrigins),
		httpmiddleware.BodyLimit(2<<20),
	)
	server := &Server{
		Engine:  engine,
		Health:  registry,
		logger:  logger,
		timeout: runtime.RequestTimeout,
		HTTP: &http.Server{
			Addr:              runtime.HTTPAddr,
			Handler:           engine,
			ReadHeaderTimeout: 5 * time.Second,
			ReadTimeout:       runtime.RequestTimeout,
			WriteTimeout:      runtime.RequestTimeout + 5*time.Second,
			IdleTimeout:       60 * time.Second,
			MaxHeaderBytes:    1 << 20,
		},
	}
	server.registerPlatformRoutes()
	return server
}

func (s *Server) registerPlatformRoutes() {
	s.Engine.GET("/health/live", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "alive"}) })
	s.Engine.GET("/health/ready", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), min(s.timeout, 3*time.Second))
		defer cancel()
		status := s.Health.Ready(ctx)
		code := http.StatusOK
		if !health.IsReady(status) {
			code = http.StatusServiceUnavailable
		}
		c.JSON(code, gin.H{"status": status})
	})
	s.Engine.GET("/metrics", gin.WrapH(promhttp.Handler()))
}

func (s *Server) Run(ctx context.Context, shutdownTimeout time.Duration) error {
	errorChannel := make(chan error, 1)
	go func() {
		if err := s.HTTP.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errorChannel <- err
		}
		close(errorChannel)
	}()
	select {
	case err := <-errorChannel:
		return err
	case <-ctx.Done():
		s.Health.SetReady(false)
		shutdownContext, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		return s.HTTP.Shutdown(shutdownContext)
	}
}
