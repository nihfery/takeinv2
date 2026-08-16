package chat

import "testing"

func TestChatScopeAndTicketState(t *testing.T) {
	thread := map[string]any{"provider_id": int64(9), "customer_user_id": int64(7)}
	if !CanAccess(Actor{UserID: 7, Role: "customer"}, thread) || CanAccess(Actor{UserID: 8, Role: "customer"}, thread) {
		t.Fatal("participant scope failed")
	}
	if !CanTicketTransition("requested", "approved") || CanTicketTransition("closed", "requested") {
		t.Fatal("ticket state machine failed")
	}
}
