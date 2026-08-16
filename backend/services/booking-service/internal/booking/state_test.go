package booking

import "testing"

func TestBookingStateMachineRejectsRegression(t *testing.T) {
	if !CanTransition("pending_hold", "confirmed") || !CanTransition("confirmed", "checked_in") || !CanTransition("in_progress", "completed") {
		t.Fatal("valid transition rejected")
	}
	if CanTransition("completed", "pending_hold") || CanTransition("cancelled", "confirmed") {
		t.Fatal("terminal state regression accepted")
	}
}

func TestPaymentAmountMatchesLegacyRules(t *testing.T) {
	const total = int64(100_01)
	if got := amountDue("full_payment", total, 0); got != total {
		t.Fatalf("full payment=%d", got)
	}
	if got := amountDue("pay_at_salon", total, 0); got != 0 {
		t.Fatalf("pay at salon=%d", got)
	}
	if got := amountDue("dp", total, 0); got != 3_000 {
		t.Fatalf("30 percent fallback=%d", got)
	}
	if got := amountDue("dp", total, 2_500); got != 2_500 {
		t.Fatalf("configured DP=%d", got)
	}
}

func TestPaymentPreferenceValidation(t *testing.T) {
	for _, valid := range [][2]string{{"dp", "qris"}, {"full_payment", "bca_va"}, {"pay_at_salon", ""}, {"pay_at_salon", "qris"}} {
		if !validPaymentPreference(valid[0], valid[1]) {
			t.Fatalf("valid preference rejected: %v", valid)
		}
	}
	for _, invalid := range [][2]string{{"", ""}, {"booking", "qris"}, {"full_payment", "cash"}} {
		if validPaymentPreference(invalid[0], invalid[1]) {
			t.Fatalf("invalid preference accepted: %v", invalid)
		}
	}
}
