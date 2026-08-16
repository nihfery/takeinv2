package billing

import (
	"testing"
	"time"
)

func TestPaidSubscriptionSupersedesTrial(t *testing.T) {
	now := time.Date(2026, 8, 15, 0, 0, 0, 0, time.UTC)
	trialStart, trialEnd := now.Add(-time.Hour), now.Add(time.Hour)
	subStart, subEnd := now.Add(-time.Minute), now.Add(24*time.Hour)
	value := ResolveEntitlement(Trial{StartsAt: &trialStart, EndsAt: &trialEnd}, Subscription{PaymentStatus: "paid", Status: "active", MaxBranches: 5, StartsAt: &subStart, EndsAt: &subEnd}, now)
	if !value.Active || value.Source != "subscription" || value.MaxBranches != 5 {
		t.Fatalf("unexpected entitlement %#v", value)
	}
}
func TestTrialEndIsExclusiveAndExpired(t *testing.T) {
	now := time.Now().UTC()
	start, end := now.Add(-24*time.Hour), now
	value := ResolveEntitlement(Trial{StartsAt: &start, EndsAt: &end}, Subscription{}, now)
	if value.Active {
		t.Fatalf("trial remained active at its end boundary: %#v", value)
	}
}
