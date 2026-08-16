package logging

import (
	"bytes"
	"strings"
	"testing"
)

func TestLoggerIncludesServiceMetadata(t *testing.T) {
	var output bytes.Buffer
	logger := NewWithWriter(&output, "booking-service", "test", "unit", "info")
	logger.Info("created", "booking_id", "b-1")
	for _, expected := range []string{`"service":"booking-service"`, `"booking_id":"b-1"`, `"message":"created"`} {
		if !strings.Contains(output.String(), expected) {
			t.Fatalf("expected %s in %s", expected, output.String())
		}
	}
}
