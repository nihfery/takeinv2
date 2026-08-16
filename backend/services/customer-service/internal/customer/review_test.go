package customer

import "testing"

func TestRatingBoundaries(t *testing.T) {
	for _, value := range []int32{1, 3, 5} {
		if !ValidRating(value) {
			t.Fatalf("valid rating %d rejected", value)
		}
	}
	for _, value := range []int32{0, 6, -1} {
		if ValidRating(value) {
			t.Fatalf("invalid rating %d accepted", value)
		}
	}
}
