package idempotency

import "testing"

func TestRequestHashIsStable(t *testing.T) {
	first := RequestHash([]byte(`{"booking":"1"}`))
	second := RequestHash([]byte(`{"booking":"1"}`))
	if first != second || len(first) != 64 {
		t.Fatalf("unexpected hashes: %q %q", first, second)
	}
}
