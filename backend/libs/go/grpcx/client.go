package grpcx

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"os"
	"strings"
	"time"

	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/correlation"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

type ClientConfig struct {
	Address        string
	InternalToken  string
	DefaultTimeout time.Duration
	TLSCAFile      string
	TLSServerName  string
}

func Dial(cfg ClientConfig) (*grpc.ClientConn, error) {
	if strings.TrimSpace(cfg.Address) == "" {
		return nil, errors.New("gRPC target address must not be empty")
	}
	if cfg.DefaultTimeout <= 0 {
		cfg.DefaultTimeout = 3 * time.Second
	}
	var transportCredentials credentials.TransportCredentials
	transportCredentials = insecure.NewCredentials()
	if cfg.TLSCAFile != "" {
		certificate, err := os.ReadFile(cfg.TLSCAFile)
		if err != nil {
			return nil, err
		}
		roots := x509.NewCertPool()
		if !roots.AppendCertsFromPEM(certificate) {
			return nil, errors.New("gRPC TLS CA file did not contain a valid certificate")
		}
		transportCredentials = credentials.NewTLS(&tls.Config{MinVersion: tls.VersionTLS12, RootCAs: roots, ServerName: cfg.TLSServerName})
	}
	return grpc.NewClient(cfg.Address,
		grpc.WithTransportCredentials(transportCredentials),
		grpc.WithChainUnaryInterceptor(clientDeadline(cfg.DefaultTimeout), clientMetadata(cfg.InternalToken)),
	)
}

func clientDeadline(timeout time.Duration) grpc.UnaryClientInterceptor {
	return func(ctx context.Context, method string, request, response any, connection *grpc.ClientConn, invoke grpc.UnaryInvoker, options ...grpc.CallOption) error {
		if _, exists := ctx.Deadline(); exists {
			return invoke(ctx, method, request, response, connection, options...)
		}
		bounded, cancel := context.WithTimeout(ctx, timeout)
		defer cancel()
		return invoke(bounded, method, request, response, connection, options...)
	}
}

func clientMetadata(token string) grpc.UnaryClientInterceptor {
	return func(ctx context.Context, method string, request, response any, connection *grpc.ClientConn, invoke grpc.UnaryInvoker, options ...grpc.CallOption) error {
		requestID, correlationID := correlation.From(ctx)
		values := []string{}
		if requestID != "" {
			values = append(values, "x-request-id", requestID)
		}
		if correlationID != "" {
			values = append(values, "x-correlation-id", correlationID)
		}
		if token != "" {
			values = append(values, "authorization", "Bearer "+token)
		}
		if actor, ok := authcontext.ActorFrom(ctx); ok {
			values = append(values, "x-actor-id", actor.UserID, "x-actor-role", actor.Role, "x-provider-id", actor.ProviderID, "x-branch-id", actor.BranchID)
		}
		carrier := propagation.MapCarrier{}
		otel.GetTextMapPropagator().Inject(ctx, carrier)
		for key, value := range carrier {
			values = append(values, key, value)
		}
		if len(values) > 0 {
			ctx = metadata.AppendToOutgoingContext(ctx, values...)
		}
		return invoke(ctx, method, request, response, connection, options...)
	}
}
