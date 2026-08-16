package chat

import (
	"errors"
	"slices"
)

var (
	ErrNotFound          = errors.New("chat not found")
	ErrForbidden         = errors.New("chat forbidden")
	ErrInvalidTransition = errors.New("invalid ticket transition")
)

type Actor struct {
	UserID     int64
	Role       string
	ProviderID int64
}

func CanAccess(actor Actor, thread map[string]any) bool {
	if actor.Role == "admin" {
		return true
	}
	ids := []int64{number(thread["provider_user_id"]), number(thread["branch_user_id"]), number(thread["customer_user_id"])}
	return slices.Contains(ids, actor.UserID) || actor.Role == "provider" && actor.ProviderID > 0 && number(thread["provider_id"]) == actor.ProviderID
}
func CanTicketTransition(from, to string) bool {
	allowed := map[string][]string{"none": {"requested"}, "requested": {"approved", "rejected"}, "approved": {"closed"}, "rejected": {"requested"}}
	return slices.Contains(allowed[from], to)
}
func number(value any) int64 {
	if result, ok := value.(int64); ok {
		return result
	}
	return 0
}
