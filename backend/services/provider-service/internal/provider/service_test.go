package provider

import (
	"errors"
	"testing"
)

func TestCheckScopeRejectsCrossProviderAndCrossBranchAccess(t *testing.T) {
	branchOne, branchTwo := int64(10), int64(20)
	actor := Actor{Role: "provider", ProviderID: 7, BranchID: branchOne}
	if err := CheckScope(actor, 7, &branchOne); err != nil {
		t.Fatalf("owned branch rejected: %v", err)
	}
	if err := CheckScope(actor, 8, &branchOne); !errors.Is(err, ErrForbidden) {
		t.Fatalf("cross-provider access returned %v", err)
	}
	if err := CheckScope(actor, 7, &branchTwo); !errors.Is(err, ErrForbidden) {
		t.Fatalf("cross-branch access returned %v", err)
	}
	if err := CheckScope(Actor{Role: "admin"}, 99, &branchTwo); err != nil {
		t.Fatalf("admin scope rejected: %v", err)
	}
}

func TestPermissionIsExplicit(t *testing.T) {
	actor := Actor{Role: "provider", Permissions: []string{"staff.read"}}
	if !HasPermission(actor, "staff.read") || HasPermission(actor, "staff.write") {
		t.Fatal("permission matching is not exact")
	}
}

func TestOnboardingCannotRegressAfterCompletion(t *testing.T) {
	if !ValidOnboardingTransition("not_started", "in_progress") || !ValidOnboardingTransition("in_progress", "completed") {
		t.Fatal("valid onboarding progression was rejected")
	}
	if ValidOnboardingTransition("completed", "in_progress") {
		t.Fatal("completed onboarding was allowed to regress")
	}
}
