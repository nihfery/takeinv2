package payment

import (
	"testing"
)

func TestMidtransSignatureVerification(t *testing.T) {
	value := Notification{OrderID: "ORDER-1", StatusCode: "200", GrossAmount: "125000.00"}
	value.SignatureKey = Signature(value.OrderID, value.StatusCode, value.GrossAmount, "server-secret")
	if !VerifySignature(value, "server-secret") {
		t.Fatal("valid signature rejected")
	}
	value.SignatureKey = "00" + value.SignatureKey[2:]
	if VerifySignature(value, "server-secret") {
		t.Fatal("invalid signature accepted")
	}
}
func TestPaymentStateMachineIsMonotonic(t *testing.T) {
	if !CanTransition("pending", "paid") || !CanTransition("paid", "paid") {
		t.Fatal("valid transition rejected")
	}
	if CanTransition("paid", "pending") || CanTransition("refunded", "paid") {
		t.Fatal("terminal payment state regressed")
	}
	status, err := StatusFromNotification("settlement", "")
	if err != nil || status != "paid" {
		t.Fatalf("status=%q err=%v", status, err)
	}
}
