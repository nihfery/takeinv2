package jwtauth

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/nihfery/takein/libs/go/authcontext"
)

type Claims struct {
	Role        string   `json:"role"`
	ProviderID  string   `json:"provider_id,omitempty"`
	BranchID    string   `json:"branch_id,omitempty"`
	Permissions []string `json:"permissions,omitempty"`
	jwt.RegisteredClaims
}

type Validator struct {
	key      *rsa.PublicKey
	issuer   string
	audience string
}

func New(publicPEM, issuer, audience string) (*Validator, error) {
	block, _ := pem.Decode([]byte(publicPEM))
	if block == nil {
		return nil, errors.New("JWT public key is not valid PEM")
	}
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		if certificate, certErr := x509.ParseCertificate(block.Bytes); certErr == nil {
			parsed = certificate.PublicKey
		} else {
			return nil, fmt.Errorf("parse JWT public key: %w", err)
		}
	}
	key, ok := parsed.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("JWT public key must be RSA")
	}
	return &Validator{key: key, issuer: issuer, audience: audience}, nil
}

func (v *Validator) Validate(raw string) (Claims, error) {
	claims := Claims{}
	options := []jwt.ParserOption{jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()})}
	if v.issuer != "" {
		options = append(options, jwt.WithIssuer(v.issuer))
	}
	if v.audience != "" {
		options = append(options, jwt.WithAudience(v.audience))
	}
	token, err := jwt.ParseWithClaims(raw, &claims, func(token *jwt.Token) (any, error) { return v.key, nil }, options...)
	if err != nil || !token.Valid {
		return Claims{}, errors.New("invalid access token")
	}
	return claims, nil
}

func (v *Validator) Middleware(roles ...string) gin.HandlerFunc {
	return v.middleware(false, roles...)
}

// OptionalMiddleware attaches a verified actor when a bearer token is
// present, while preserving anonymous access for public compatibility routes.
// An explicitly supplied but invalid token is still rejected.
func (v *Validator) OptionalMiddleware(roles ...string) gin.HandlerFunc {
	allowed := make(map[string]struct{}, len(roles))
	for _, role := range roles {
		allowed[role] = struct{}{}
	}
	return func(c *gin.Context) {
		header := strings.TrimSpace(c.GetHeader("Authorization"))
		if header == "" {
			c.Next()
			return
		}
		if !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "Unauthenticated."})
			return
		}
		raw := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
		claims, err := v.Validate(raw)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "Unauthenticated."})
			return
		}
		if len(allowed) > 0 {
			if _, ok := allowed[claims.Role]; !ok {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"message": "Forbidden."})
				return
			}
		}
		actor := authcontext.Actor{UserID: claims.Subject, Role: claims.Role, ProviderID: claims.ProviderID, BranchID: claims.BranchID, Permissions: claims.Permissions}
		c.Request = c.Request.WithContext(authcontext.WithActor(c.Request.Context(), actor))
		c.Next()
	}
}

// WebSocketMiddleware accepts a normal Authorization header or a browser-safe
// bearer token sent as the takein.bearer.<JWT> WebSocket subprotocol.
func (v *Validator) WebSocketMiddleware(roles ...string) gin.HandlerFunc {
	return v.middleware(true, roles...)
}

func (v *Validator) middleware(websocket bool, roles ...string) gin.HandlerFunc {
	allowed := make(map[string]struct{}, len(roles))
	for _, role := range roles {
		allowed[role] = struct{}{}
	}
	return func(c *gin.Context) {
		raw := strings.TrimSpace(strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer "))
		if websocket && raw == "" {
			for protocol := range strings.SplitSeq(c.GetHeader("Sec-WebSocket-Protocol"), ",") {
				protocol = strings.TrimSpace(protocol)
				if token, ok := strings.CutPrefix(protocol, "takein.bearer."); ok {
					raw = token
					break
				}
			}
		}
		if raw == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "Unauthenticated."})
			return
		}
		claims, err := v.Validate(raw)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "Unauthenticated."})
			return
		}
		if len(allowed) > 0 {
			if _, ok := allowed[claims.Role]; !ok {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"message": "Forbidden."})
				return
			}
		}
		actor := authcontext.Actor{UserID: claims.Subject, Role: claims.Role, ProviderID: claims.ProviderID, BranchID: claims.BranchID, Permissions: claims.Permissions}
		c.Request = c.Request.WithContext(authcontext.WithActor(c.Request.Context(), actor))
		c.Next()
	}
}
