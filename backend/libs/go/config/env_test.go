package config

import (
	"strings"
	"testing"
)

func TestLoadRuntimeRejectsInvalidTypedOverrides(t *testing.T) {
	t.Setenv("APP_ENV", "test")
	t.Setenv("POSTGRES_MAX_CONNS", "many")
	if _, err := LoadRuntime("test-service"); err == nil || !strings.Contains(err.Error(), "POSTGRES_MAX_CONNS") {
		t.Fatalf("expected POSTGRES_MAX_CONNS validation error, got %v", err)
	}

	t.Setenv("POSTGRES_MAX_CONNS", "10")
	t.Setenv("REQUEST_TIMEOUT", "eventually")
	if _, err := LoadRuntime("test-service"); err == nil || !strings.Contains(err.Error(), "REQUEST_TIMEOUT") {
		t.Fatalf("expected REQUEST_TIMEOUT validation error, got %v", err)
	}

	t.Setenv("REQUEST_TIMEOUT", "5s")
	t.Setenv("PAYMENT_ALLOW_MANUAL_CONFIRMATION", "sometimes")
	if _, err := LoadRuntime("test-service"); err == nil || !strings.Contains(err.Error(), "PAYMENT_ALLOW_MANUAL_CONFIRMATION") {
		t.Fatalf("expected boolean validation error, got %v", err)
	}
}

func TestLoadRuntimeValidatesPoolBounds(t *testing.T) {
	t.Setenv("APP_ENV", "test")
	t.Setenv("POSTGRES_MAX_CONNS", "2")
	t.Setenv("POSTGRES_MIN_CONNS", "3")
	if _, err := LoadRuntime("test-service"); err == nil || !strings.Contains(err.Error(), "POSTGRES_MIN_CONNS") {
		t.Fatalf("expected pool bound validation error, got %v", err)
	}
}

func TestLoadRuntimeValidatesKafkaSecurity(t *testing.T) {
	t.Setenv("APP_ENV", "test")
	t.Setenv("KAFKA_SECURITY_PROTOCOL", "SASL_SSL")
	t.Setenv("KAFKA_SASL_MECHANISM", "SCRAM-SHA-256")
	if _, err := LoadRuntime("test-service"); err == nil || !strings.Contains(err.Error(), "KAFKA_USERNAME") {
		t.Fatalf("expected missing SASL credentials error, got %v", err)
	}

	t.Setenv("KAFKA_USERNAME", "takein")
	t.Setenv("KAFKA_PASSWORD", "test-only-password")
	runtime, err := LoadRuntime("test-service")
	if err != nil {
		t.Fatalf("load secure runtime: %v", err)
	}
	if runtime.KafkaSecurityProtocol != "SASL_SSL" || runtime.KafkaSASLMechanism != "SCRAM-SHA-256" {
		t.Fatalf("unexpected Kafka security config: %+v", runtime)
	}
}
