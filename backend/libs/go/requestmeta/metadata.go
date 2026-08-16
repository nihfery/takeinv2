package requestmeta

import "context"

type Metadata struct {
	RequestID     string
	CorrelationID string
	CausationID   string
	Traceparent   string
}

type key struct{}

func With(ctx context.Context, metadata Metadata) context.Context {
	return context.WithValue(ctx, key{}, metadata)
}

func From(ctx context.Context) Metadata {
	metadata, _ := ctx.Value(key{}).(Metadata)
	return metadata
}
