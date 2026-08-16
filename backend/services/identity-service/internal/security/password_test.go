package security

import (
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestPasswordHasherRoundTrip(t *testing.T) {
	hasher := NewPasswordHasher()
	hasher.Memory = 8 * 1024
	hasher.Iterations = 1
	hash, err := hasher.Hash("password123")
	if err != nil {
		t.Fatal(err)
	}
	valid, rehash := hasher.Verify("password123", hash)
	if !valid || rehash {
		t.Fatalf("valid=%v rehash=%v", valid, rehash)
	}
	if valid, _ := hasher.Verify("wrong-password", hash); valid {
		t.Fatal("wrong password was accepted")
	}
}

func TestLegacyBcrypt2YIsAcceptedAndRehashed(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	legacy := strings.Replace(string(hash), "$2a$", "$2y$", 1)
	valid, rehash := NewPasswordHasher().Verify("password123", legacy)
	if !valid || !rehash {
		t.Fatalf("valid=%v rehash=%v", valid, rehash)
	}
}
