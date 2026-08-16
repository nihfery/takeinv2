package postgres

import "testing"

func TestJSONValueNormalizesNilSliceToArray(t *testing.T) {
	if got := jsonValue(nil); got != "[]" {
		t.Fatalf("jsonValue(nil) = %q, want []", got)
	}
}
