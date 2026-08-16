package payment

import (
	"crypto/sha512"
	"crypto/subtle"
	"encoding/hex"
	"strings"
)

func Signature(orderID, statusCode, grossAmount, serverKey string) string {
	sum := sha512.Sum512([]byte(orderID + statusCode + grossAmount + serverKey))
	return hex.EncodeToString(sum[:])
}
func VerifySignature(value Notification, serverKey string) bool {
	expected := Signature(value.OrderID, value.StatusCode, value.GrossAmount, serverKey)
	provided := strings.ToLower(strings.TrimSpace(value.SignatureKey))
	if len(provided) != len(expected) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) == 1
}
