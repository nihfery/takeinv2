package idempotency

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
)

var ErrMissingKey = errors.New("idempotency key is required")

func Normalize(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", ErrMissingKey
	}
	if len(value) > 255 {
		return "", errors.New("idempotency key exceeds 255 characters")
	}
	return value, nil
}

func RequestHash(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}
