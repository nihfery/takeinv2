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
	actor := Actor{Role: "provider", Permissions: []string{"staff.read", "profile"}}
	if !HasPermission(actor, "staff.read") || HasPermission(actor, "staff.write") {
		t.Fatal("permission matching is not exact")
	}
	if !HasPermission(actor, "profile") || HasPermission(Actor{Role: "provider"}, "profile") {
		t.Fatal("branch profile permission boundary is not exact")
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

func TestBranchProfileCompletionUsesPersistedBranchFields(t *testing.T) {
	email, phone, address := "branch@example.test", "8123456789", "Main Street"
	country, state, city, zipCode, openedAt := "Indonesia", "DKI Jakarta", "Jakarta", "10110", "2026-01-01"
	branch := Branch{
		Name: "Takein Jakarta", Description: "Main provider branch", BranchType: "physical", Timezone: "Asia/Jakarta",
		OpenedAt: &openedAt, Email: &email, PhoneNumber: &phone, Address: &address, CountryID: &country,
		StateID: &state, CityID: &city, ZipCode: &zipCode, WorkingStartHour: "09:00",
		WorkingEndHour: "18:00", WorkingDays: []string{"monday"},
	}
	if got := branchProfileCompletion(branch); got != 100 {
		t.Fatalf("branchProfileCompletion() = %d, want 100", got)
	}
	branch.Description = ""
	if got := branchProfileCompletion(branch); got >= 100 {
		t.Fatalf("incomplete branch reported %d%%", got)
	}
}

func TestBranchInputRejectsInvalidProfileFields(t *testing.T) {
	input := BranchInput{
		Name: "Takein Jakarta", Email: "branch@example.test", PhoneCode: "+62", PhoneNumber: "8123456789",
		Address: "Main Street", CountryID: "Indonesia", StateID: "DKI Jakarta", CityID: "Jakarta",
		ZipCode: "10110", WorkingStartHour: "09:00", WorkingEndHour: "18:00", WorkingDays: []string{"monday"},
		BranchType: "virtual", Timezone: "Not/A-Timezone",
	}
	if !errors.Is(input.Validate(), ErrValidation) {
		t.Fatal("invalid branch profile fields were accepted")
	}
}

func TestBranchProfileUpdateInputAcceptsCanonicalProfile(t *testing.T) {
	input := BranchProfileUpdateInput{
		Name: "Takein Jakarta", Description: "Main provider branch", BranchType: "physical", Timezone: "Asia/Jakarta",
		OpenedAt: "2026-01-01", Email: "branch@example.test", PhoneCode: "+62", PhoneNumber: "8123456789",
		Address: "Main Street", CountryID: "Indonesia", StateID: "DKI Jakarta", CityID: "Jakarta", ZipCode: "10110",
		WorkingStartHour: "09:00", WorkingEndHour: "18:00", WorkingDays: []string{"monday", "tuesday"},
		Holidays: []string{"2026-12-25"},
	}
	if err := input.Validate(); err != nil {
		t.Fatalf("valid branch profile rejected: %v", err)
	}
	input.WorkingDays = []string{"monday", "not-a-day"}
	if !errors.Is(input.Validate(), ErrValidation) {
		t.Fatal("invalid operating day was accepted")
	}
}
