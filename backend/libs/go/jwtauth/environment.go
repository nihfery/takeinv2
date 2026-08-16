package jwtauth

import (
	"errors"
	"os"
	"strings"
	"time"
)

// NewFromEnvironment loads JWT_PUBLIC_KEY or waits briefly for a local shared
// public-key file produced by identity-service.
func NewFromEnvironment(issuer, audience string) (*Validator, error) {
	value := strings.ReplaceAll(os.Getenv("JWT_PUBLIC_KEY"), `\n`, "\n")
	path := strings.TrimSpace(os.Getenv("JWT_PUBLIC_KEY_FILE"))
	deadline := time.Now().Add(30 * time.Second)
	for strings.TrimSpace(value) == "" && path != "" {
		contents, err := os.ReadFile(path)
		if err == nil && len(contents) > 0 {
			value = string(contents)
			break
		}
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return nil, err
		}
		if time.Now().After(deadline) {
			break
		}
		time.Sleep(250 * time.Millisecond)
	}
	return New(value, issuer, audience)
}
