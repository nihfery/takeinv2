package security

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"
)

type PasswordHasher struct {
	Memory      uint32
	Iterations  uint32
	Parallelism uint8
	SaltLength  uint32
	KeyLength   uint32
}

func NewPasswordHasher() PasswordHasher {
	return PasswordHasher{Memory: 64 * 1024, Iterations: 3, Parallelism: 2, SaltLength: 16, KeyLength: 32}
}

func (h PasswordHasher) Hash(password string) (string, error) {
	if len(password) < 8 {
		return "", errors.New("password must contain at least 8 characters")
	}
	salt := make([]byte, h.SaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("read password salt: %w", err)
	}
	digest := argon2.IDKey([]byte(password), salt, h.Iterations, h.Memory, h.Parallelism, h.KeyLength)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", h.Memory, h.Iterations, h.Parallelism,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(digest)), nil
}

func (h PasswordHasher) Verify(password, encoded string) (valid, needsRehash bool) {
	if strings.HasPrefix(encoded, "$2y$") || strings.HasPrefix(encoded, "$2a$") || strings.HasPrefix(encoded, "$2b$") {
		bcryptHash := encoded
		if strings.HasPrefix(bcryptHash, "$2y$") {
			bcryptHash = "$2a$" + strings.TrimPrefix(bcryptHash, "$2y$")
		}
		err := bcrypt.CompareHashAndPassword([]byte(bcryptHash), []byte(password))
		return err == nil, err == nil
	}
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" {
		return false, false
	}
	var memory, iterations uint64
	var parallelism uint64
	for _, parameter := range strings.Split(parts[3], ",") {
		pair := strings.SplitN(parameter, "=", 2)
		if len(pair) != 2 {
			return false, false
		}
		value, err := strconv.ParseUint(pair[1], 10, 32)
		if err != nil {
			return false, false
		}
		switch pair[0] {
		case "m":
			memory = value
		case "t":
			iterations = value
		case "p":
			parallelism = value
		}
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, false
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(expected) == 0 {
		return false, false
	}
	actual := argon2.IDKey([]byte(password), salt, uint32(iterations), uint32(memory), uint8(parallelism), uint32(len(expected)))
	valid = subtle.ConstantTimeCompare(actual, expected) == 1
	needsRehash = valid && (uint32(memory) != h.Memory || uint32(iterations) != h.Iterations || uint8(parallelism) != h.Parallelism || uint32(len(expected)) != h.KeyLength)
	return valid, needsRehash
}
