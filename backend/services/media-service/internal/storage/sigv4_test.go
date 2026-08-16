package storage

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPresignDoesNotExposeSecret(t *testing.T) {
	signer := NewSigner("https://example.r2.cloudflarestorage.com", "access", "super-secret", "auto")
	signer.now = func() time.Time { return time.Date(2026, 8, 15, 0, 0, 0, 0, time.UTC) }
	value, err := signer.Presign("PUT", "private", "customer/7/image.png", 15*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(value, "X-Amz-Signature=") || strings.Contains(value, "super-secret") {
		t.Fatalf("unsafe presigned URL %s", value)
	}
}

func TestHeadReturnsStoredObjectSize(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodHead || request.URL.Path != "/bucket/customer/7/image.png" || request.URL.Query().Get("X-Amz-Signature") == "" {
			t.Fatalf("unexpected signed metadata request %s %s", request.Method, request.URL.String())
		}
		response.Header().Set("Content-Length", "42")
		response.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	signer := NewSigner(server.URL, "access", "secret", "auto")
	size, err := signer.Head(context.Background(), "bucket", "customer/7/image.png")
	if err != nil {
		t.Fatal(err)
	}
	if size != 42 {
		t.Fatalf("size=%d", size)
	}
}
