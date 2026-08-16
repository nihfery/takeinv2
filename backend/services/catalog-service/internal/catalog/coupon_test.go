package catalog

import (
	"encoding/json"
	"errors"
	"testing"
	"time"
)

func TestDiscountMinorUsesExactIntegerArithmetic(t *testing.T) {
	now := time.Date(2026, 8, 15, 12, 0, 0, 0, time.UTC)
	discount, err := DiscountMinor(10_001, Coupon{Type: "percentage", ValueMinor: 1250, Active: true, StartsAt: now.AddDate(0, 0, -1), EndsAt: now.AddDate(0, 0, 1)}, now)
	if err != nil || discount != 1_250 {
		t.Fatalf("discount=%d err=%v", discount, err)
	}
	discount, err = DiscountMinor(5_000, Coupon{Type: "fixed", ValueMinor: 8_000, Active: true, StartsAt: now, EndsAt: now}, now)
	if err != nil || discount != 5_000 {
		t.Fatalf("fixed coupon must be capped: discount=%d err=%v", discount, err)
	}
}

func TestCouponInputNormalizePreservesLegacyValidation(t *testing.T) {
	quantity := int32(1)
	input := CouponInput{Code: " save10 ", ProductType: "service", ProductIDs: []int64{7, 7, 9}, Type: "percentage", Value: json.Number("10"), Quantity: &quantity, StartDate: "2026-08-16", EndDate: "2026-08-17"}
	if err := input.Normalize(); err != nil {
		t.Fatal(err)
	}
	if input.Code != "SAVE10" || input.Status != "active" || input.ValueMinor != 1_000 || len(input.ProductIDs) != 2 {
		t.Fatalf("unexpected normalized coupon: %+v", input)
	}

	invalid := []CouponInput{
		{Code: "NO-VALUE", ProductType: "all", Type: "fixed", StartDate: "2026-08-16", EndDate: "2026-08-17"},
		{Code: "DATES", ProductType: "all", Type: "fixed", Value: json.Number("1"), StartDate: "2026-08-18", EndDate: "2026-08-17"},
		{Code: "SCOPE", ProductType: "service", Type: "fixed", Value: json.Number("1"), StartDate: "2026-08-16", EndDate: "2026-08-17"},
	}
	for index := range invalid {
		if err := invalid[index].Normalize(); err == nil {
			t.Fatalf("invalid coupon %d was accepted", index)
		}
	}
}

func TestCouponAvailabilityRules(t *testing.T) {
	now := time.Now().UTC()
	quantity := int64(2)
	_, err := DiscountMinor(10_000, Coupon{Type: "fixed", ValueMinor: 100, Quantity: &quantity, UsedCount: 2, Active: true, StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour)}, now)
	if !errors.Is(err, ErrInvalidCoupon) {
		t.Fatalf("exhausted coupon returned %v", err)
	}
}
