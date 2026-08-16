package security

import (
	"crypto/rsa"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func TestTokenIssuerUsesRS256AndOpaqueRefreshHashes(t *testing.T) {
	issuer, err := NewTokenIssuer("", "https://identity.test", "takein-api", "test-key", time.Minute, time.Hour, true)
	if err != nil {
		t.Fatal(err)
	}
	pair, err := issuer.Issue(TokenSubject{ID: 42, Role: "provider", Permissions: []string{"bookings", "queue"}}, uuid.Nil)
	if err != nil {
		t.Fatal(err)
	}
	if pair.RefreshToken == "" || string(pair.Session.TokenHash) == pair.RefreshToken {
		t.Fatal("refresh token must be returned while only its hash is persisted")
	}
	parsed, err := jwt.Parse(pair.AccessToken, func(token *jwt.Token) (any, error) {
		if token.Method.Alg() != "RS256" || token.Header["kid"] != "test-key" {
			t.Fatalf("unexpected JWT header: %#v", token.Header)
		}
		return &issuer.privateKey.PublicKey, nil
	}, jwt.WithAudience("takein-api"), jwt.WithIssuer("https://identity.test"), jwt.WithValidMethods([]string{"RS256"}))
	if err != nil || !parsed.Valid {
		t.Fatalf("token validation failed: %v", err)
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok || len(claims["permissions"].([]any)) != 2 {
		t.Fatalf("permission claims missing: %#v", parsed.Claims)
	}
	if _, ok := any(&issuer.privateKey.PublicKey).(*rsa.PublicKey); !ok {
		t.Fatal("issuer did not use an RSA public key")
	}
}

func TestTokenIssuerRequiresConfiguredKeyOutsideLocal(t *testing.T) {
	if _, err := NewTokenIssuer("", "issuer", "audience", "key", time.Minute, time.Hour, false); err == nil {
		t.Fatal("production issuer accepted an ephemeral key")
	}
}
