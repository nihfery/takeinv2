package grpcx

import (
	"context"
	"crypto/subtle"
	"errors"
	"log/slog"
	"net"
	"runtime/debug"
	"strings"
	"time"

	"github.com/nihfery/takein/libs/go/correlation"
	"github.com/prometheus/client_golang/prometheus"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	otelcodes "go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
	"google.golang.org/grpc"
	grpccodes "google.golang.org/grpc/codes"
	"google.golang.org/grpc/health"
	healthv1 "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

var (
	serverRequests = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "grpc_server_requests_total", Help: "Completed gRPC server requests."}, []string{"service", "method", "code"})
	serverDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{Name: "grpc_server_duration", Help: "gRPC server request duration in seconds.", Buckets: prometheus.DefBuckets}, []string{"service", "method", "code"})
)

func init() { prometheus.MustRegister(serverRequests, serverDuration) }

type Server struct {
	grpc     *grpc.Server
	health   *health.Server
	listener net.Listener
}

type ServerConfig struct {
	Address       string
	Service       string
	InternalToken string
	Logger        *slog.Logger
	MaxRecvBytes  int
	MaxSendBytes  int
}

func NewServer(cfg ServerConfig) (*Server, error) {
	if strings.TrimSpace(cfg.Address) == "" {
		return nil, errors.New("gRPC address must not be empty")
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	if cfg.MaxRecvBytes <= 0 {
		cfg.MaxRecvBytes = 4 << 20
	}
	if cfg.MaxSendBytes <= 0 {
		cfg.MaxSendBytes = 4 << 20
	}
	listener, err := (&net.ListenConfig{}).Listen(context.Background(), "tcp", cfg.Address)
	if err != nil {
		return nil, err
	}
	interceptor := chainUnary(
		recoveryInterceptor(cfg.Logger),
		metadataInterceptor(),
		traceInterceptor(cfg.Service),
		authInterceptor(cfg.InternalToken),
		metricsInterceptor(cfg.Service),
		loggingInterceptor(cfg.Logger),
	)
	server := grpc.NewServer(
		grpc.UnaryInterceptor(interceptor),
		grpc.MaxRecvMsgSize(cfg.MaxRecvBytes),
		grpc.MaxSendMsgSize(cfg.MaxSendBytes),
	)
	healthServer := health.NewServer()
	healthv1.RegisterHealthServer(server, healthServer)
	healthServer.SetServingStatus("", healthv1.HealthCheckResponse_SERVING)
	return &Server{grpc: server, health: healthServer, listener: listener}, nil
}

func (s *Server) GRPC() *grpc.Server { return s.grpc }

func (s *Server) Run(ctx context.Context, shutdownTimeout time.Duration) error {
	errorsChannel := make(chan error, 1)
	go func() {
		err := s.grpc.Serve(s.listener)
		if err != nil && !errors.Is(err, grpc.ErrServerStopped) {
			errorsChannel <- err
		}
		close(errorsChannel)
	}()
	select {
	case err := <-errorsChannel:
		return err
	case <-ctx.Done():
		s.health.SetServingStatus("", healthv1.HealthCheckResponse_NOT_SERVING)
		stopped := make(chan struct{})
		go func() {
			s.grpc.GracefulStop()
			close(stopped)
		}()
		timer := time.NewTimer(shutdownTimeout)
		defer timer.Stop()
		select {
		case <-stopped:
			return nil
		case <-timer.C:
			s.grpc.Stop()
			return errors.New("gRPC graceful shutdown timed out")
		}
	}
}

type unary func(context.Context, any, *grpc.UnaryServerInfo, grpc.UnaryHandler) (any, error)

func chainUnary(interceptors ...unary) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, request any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		chained := handler
		for index := len(interceptors) - 1; index >= 0; index-- {
			current := interceptors[index]
			next := chained
			chained = func(nextCtx context.Context, nextRequest any) (any, error) {
				return current(nextCtx, nextRequest, info, next)
			}
		}
		return chained(ctx, request)
	}
}

func recoveryInterceptor(logger *slog.Logger) unary {
	return func(ctx context.Context, request any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (response any, err error) {
		defer func() {
			if recovered := recover(); recovered != nil {
				logger.Error("gRPC panic recovered", "method", info.FullMethod, "error", recovered, "stack", string(debug.Stack()))
				err = status.Error(grpccodes.Internal, "internal service error")
			}
		}()
		return handler(ctx, request)
	}
}

func metadataInterceptor() unary {
	return func(ctx context.Context, request any, _ *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		incoming, _ := metadata.FromIncomingContext(ctx)
		requestID := safeMetadataID(first(incoming.Get("x-request-id")))
		correlationID := safeMetadataID(first(incoming.Get("x-correlation-id")))
		if correlationID == "" {
			correlationID = requestID
		}
		if requestID != "" || correlationID != "" {
			ctx = correlation.With(ctx, requestID, correlationID)
		}
		carrier := propagation.MapCarrier{}
		for key, values := range incoming {
			if len(values) > 0 {
				carrier[key] = values[0]
			}
		}
		ctx = otel.GetTextMapPropagator().Extract(ctx, carrier)
		return handler(ctx, request)
	}
}

func traceInterceptor(service string) unary {
	return func(ctx context.Context, request any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		ctx, span := otel.Tracer(service).Start(ctx, info.FullMethod, trace.WithSpanKind(trace.SpanKindServer), trace.WithAttributes(attribute.String("rpc.system", "grpc"), attribute.String("rpc.method", info.FullMethod)))
		defer span.End()
		response, err := handler(ctx, request)
		if err != nil {
			span.RecordError(err)
			span.SetStatus(otelcodes.Error, status.Code(err).String())
		}
		return response, err
	}
}

func authInterceptor(token string) unary {
	return func(ctx context.Context, request any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		if strings.HasPrefix(info.FullMethod, "/grpc.health.v1.Health/") || token == "" {
			return handler(ctx, request)
		}
		incoming, _ := metadata.FromIncomingContext(ctx)
		provided := strings.TrimSpace(strings.TrimPrefix(first(incoming.Get("authorization")), "Bearer "))
		if len(provided) != len(token) || subtle.ConstantTimeCompare([]byte(provided), []byte(token)) != 1 {
			return nil, status.Error(grpccodes.Unauthenticated, "internal service authentication failed")
		}
		return handler(ctx, request)
	}
}

func metricsInterceptor(service string) unary {
	return func(ctx context.Context, request any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		started := time.Now()
		response, err := handler(ctx, request)
		code := status.Code(err).String()
		serverRequests.WithLabelValues(service, info.FullMethod, code).Inc()
		serverDuration.WithLabelValues(service, info.FullMethod, code).Observe(time.Since(started).Seconds())
		return response, err
	}
}

func loggingInterceptor(logger *slog.Logger) unary {
	return func(ctx context.Context, request any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		started := time.Now()
		response, err := handler(ctx, request)
		requestID, correlationID := correlation.From(ctx)
		logger.Info("gRPC request", "method", info.FullMethod, "code", status.Code(err).String(), "duration_ms", time.Since(started).Milliseconds(), "request_id", requestID, "correlation_id", correlationID)
		return response, err
	}
}

func first(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func safeMetadataID(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 128 {
		return ""
	}
	for _, character := range value {
		valid := character == '-' || character == '_' || character == '.' || character >= '0' && character <= '9' || character >= 'a' && character <= 'z' || character >= 'A' && character <= 'Z'
		if !valid {
			return ""
		}
	}
	return value
}
