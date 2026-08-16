package catalog

import (
	"encoding/json"
	"testing"
)

func TestServiceInputNormalizeUsesExactMinorUnitsAndContractFields(t *testing.T) {
	input := ServiceInput{Title: " Hair Cut Deluxe ", Category: " Hair ", Price: json.Number("150000.25"), Duration: 45}
	if err := input.Normalize(); err != nil {
		t.Fatal(err)
	}
	if input.PriceMinor != 15_000_025 {
		t.Fatalf("unexpected exact minor units: %d", input.PriceMinor)
	}
	if input.Slug != "hair-cut-deluxe" || input.MaximumDuration != 45 {
		t.Fatalf("normalization did not derive compatibility fields: %#v", input)
	}
}

func TestServiceInputNormalizeRejectsSubMinorPrecision(t *testing.T) {
	input := ServiceInput{Title: "Hair Cut", Category: "Hair", Price: json.Number("100.001")}
	if err := input.Normalize(); err == nil {
		t.Fatal("sub-minor monetary precision was accepted")
	}
}
