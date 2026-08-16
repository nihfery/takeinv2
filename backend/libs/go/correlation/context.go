package correlation

import "context"

type values struct {
	RequestID     string
	CorrelationID string
}

type key struct{}

func With(ctx context.Context, requestID, correlationID string) context.Context {
	return context.WithValue(ctx, key{}, values{RequestID: requestID, CorrelationID: correlationID})
}

func From(ctx context.Context) (requestID, correlationID string) {
	value, _ := ctx.Value(key{}).(values)
	return value.RequestID, value.CorrelationID
}
