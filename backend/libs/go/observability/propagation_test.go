package observability

import (
	"testing"

	"go.opentelemetry.io/otel/sdk/resource"
)

func TestServiceResourceMergesWithDefaultSchema(t *testing.T) {
	value, err := serviceResource("catalog-service", "test", "local")
	if err != nil {
		t.Fatalf("merge service resource: %v", err)
	}
	attributes := value.Set()
	if found, ok := attributes.Value("service.name"); !ok || found.AsString() != "catalog-service" {
		t.Fatalf("service.name missing from merged resource: %v", attributes)
	}
	if value.SchemaURL() != resource.Default().SchemaURL() {
		t.Fatalf("unexpected schema URL %q", value.SchemaURL())
	}
}
