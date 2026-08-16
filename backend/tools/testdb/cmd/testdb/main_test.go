package main

import "testing"

func TestApprovedDatabasesAreFixedAndOwned(t *testing.T) {
	expected := map[string]string{
		"takein_catalog_test":  "takein_catalog",
		"takein_booking_test":  "takein_booking",
		"takein_payment_test":  "takein_payment",
		"takein_provider_test": "takein_provider",
	}
	if len(allowedDatabases) != len(expected) {
		t.Fatalf("unexpected database allowlist size: %d", len(allowedDatabases))
	}
	for name, owner := range expected {
		definition, ok := allowedDatabases[name]
		if !ok || definition.owner != owner || definition.createSQL == "" {
			t.Fatalf("invalid definition for %s: %#v", name, definition)
		}
	}
}
