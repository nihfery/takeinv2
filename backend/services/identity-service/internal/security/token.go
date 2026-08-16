package security

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/binary"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type TokenSubject struct {
	ID          int64
	Role        string
	ProviderID  *int64
	BranchID    *int64
	Permissions []string
}

type RefreshSession struct {
	ID        uuid.UUID
	FamilyID  uuid.UUID
	TokenHash []byte
	ExpiresAt time.Time
}

type TokenIssuer struct {
	privateKey *rsa.PrivateKey
	issuer     string
	audience   string
	keyID      string
	accessTTL  time.Duration
	refreshTTL time.Duration
	now        func() time.Time
}

type TokenPair struct {
	AccessToken  string
	RefreshToken string
	Session      RefreshSession
	ExpiresIn    int64
}

func NewTokenIssuer(privatePEM, issuer, audience, keyID string, accessTTL, refreshTTL time.Duration, allowEphemeral bool) (*TokenIssuer, error) {
	var key *rsa.PrivateKey
	if strings.TrimSpace(privatePEM) == "" {
		if !allowEphemeral {
			return nil, errors.New("JWT_PRIVATE_KEY is required outside local/test")
		}
		generated, err := rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			return nil, err
		}
		key = generated
	} else {
		block, _ := pem.Decode([]byte(strings.ReplaceAll(privatePEM, `\n`, "\n")))
		if block == nil {
			return nil, errors.New("JWT_PRIVATE_KEY is not valid PEM")
		}
		parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			if pkcs1, pkcs1Err := x509.ParsePKCS1PrivateKey(block.Bytes); pkcs1Err == nil {
				key = pkcs1
			} else {
				return nil, fmt.Errorf("parse JWT private key: %w", err)
			}
		} else {
			var ok bool
			key, ok = parsed.(*rsa.PrivateKey)
			if !ok {
				return nil, errors.New("JWT_PRIVATE_KEY must be RSA")
			}
		}
	}
	return &TokenIssuer{privateKey: key, issuer: issuer, audience: audience, keyID: keyID, accessTTL: accessTTL, refreshTTL: refreshTTL, now: time.Now}, nil
}

func (i *TokenIssuer) PrivateKeyPEM() string {
	encoded, err := x509.MarshalPKCS8PrivateKey(i.privateKey)
	if err != nil {
		return ""
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: encoded}))
}

func (i *TokenIssuer) Issue(user TokenSubject, family uuid.UUID) (TokenPair, error) {
	access, expiresIn, err := i.IssueAccess(user)
	if err != nil {
		return TokenPair{}, err
	}
	refresh, session, err := i.NewRefresh(family)
	if err != nil {
		return TokenPair{}, err
	}
	return TokenPair{AccessToken: access, RefreshToken: refresh, Session: session, ExpiresIn: expiresIn}, nil
}

func (i *TokenIssuer) IssueAccess(user TokenSubject) (string, int64, error) {
	now := i.now().UTC()
	claims := jwt.MapClaims{
		"iss": i.issuer, "sub": strconv.FormatInt(user.ID, 10), "aud": i.audience,
		"iat": now.Unix(), "exp": now.Add(i.accessTTL).Unix(), "jti": uuid.NewString(), "role": user.Role,
	}
	if user.ProviderID != nil {
		claims["provider_id"] = strconv.FormatInt(*user.ProviderID, 10)
	}
	if user.BranchID != nil {
		claims["branch_id"] = strconv.FormatInt(*user.BranchID, 10)
	}
	if len(user.Permissions) > 0 {
		claims["permissions"] = user.Permissions
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = i.keyID
	access, err := token.SignedString(i.privateKey)
	if err != nil {
		return "", 0, err
	}
	return access, int64(i.accessTTL.Seconds()), nil
}

func (i *TokenIssuer) NewRefresh(family uuid.UUID) (string, RefreshSession, error) {
	now := i.now().UTC()
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", RefreshSession{}, err
	}
	refresh := base64.RawURLEncoding.EncodeToString(raw)
	hash := sha256.Sum256([]byte(refresh))
	if family == uuid.Nil {
		family = uuid.New()
	}
	return refresh, RefreshSession{ID: uuid.New(), FamilyID: family, TokenHash: hash[:], ExpiresAt: now.Add(i.refreshTTL)}, nil
}

func HashRefresh(raw string) []byte {
	hash := sha256.Sum256([]byte(raw))
	return hash[:]
}

func (i *TokenIssuer) PublicKeyPEM() string {
	encoded, _ := x509.MarshalPKIXPublicKey(&i.privateKey.PublicKey)
	return string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: encoded}))
}

func (i *TokenIssuer) JWKS() map[string]any {
	exponent := make([]byte, 4)
	binary.BigEndian.PutUint32(exponent, uint32(i.privateKey.E))
	exponent = exponent[len(exponent)-bytesForInt(big.NewInt(int64(i.privateKey.E))):]
	return map[string]any{"keys": []map[string]string{{
		"kty": "RSA", "use": "sig", "alg": "RS256", "kid": i.keyID,
		"n": base64.RawURLEncoding.EncodeToString(i.privateKey.N.Bytes()),
		"e": base64.RawURLEncoding.EncodeToString(exponent),
	}}}
}

func bytesForInt(value *big.Int) int {
	length := len(value.Bytes())
	if length == 0 {
		return 1
	}
	return length
}
