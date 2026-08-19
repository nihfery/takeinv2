package identity

import (
	"context"
	"errors"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	eventscommonv1 "github.com/nihfery/takein/gen/go/takein/events/common/v1"
	identityeventsv1 "github.com/nihfery/takein/gen/go/takein/events/identity/v1"
	"github.com/nihfery/takein/libs/go/domainmetrics"
	"github.com/nihfery/takein/services/identity-service/internal/security"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type Service struct {
	repository Repository
	hasher     security.PasswordHasher
	tokens     *security.TokenIssuer
	now        func() time.Time
}

func NewService(repository Repository, hasher security.PasswordHasher, tokens *security.TokenIssuer) *Service {
	return &Service{repository: repository, hasher: hasher, tokens: tokens, now: time.Now}
}

func (s *Service) Register(ctx context.Context, input Registration, correlationID string) (User, error) {
	input.Name = strings.TrimSpace(input.Name)
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	if input.Name == "" || input.Email == "" || len(input.Password) < 8 || (input.Role != "customer" && input.Role != "provider") {
		return User{}, errors.New("invalid registration")
	}
	hash, err := s.hasher.Hash(input.Password)
	if err != nil {
		return User{}, err
	}
	now := s.now().UTC()
	eventID := uuid.New()
	event := &identityeventsv1.UserRegistered{
		Metadata: &eventscommonv1.EventMetadata{EventId: eventID.String(), EventVersion: 1, OccurredAt: timestamppb.New(now), Producer: "identity-service", CorrelationId: correlationID},
		Role:     input.Role, Name: input.Name, Email: input.Email, PhoneNumber: input.PhoneNumber, Gender: input.Gender,
		DateOfBirth: input.DateOfBirth, Religion: input.Religion, Allergies: input.Allergies, ProviderCategory: input.ProviderCategory,
	}
	if input.Username != nil {
		event.Username = *input.Username
	}
	payload, err := proto.Marshal(event)
	if err != nil {
		return User{}, err
	}
	user, err := s.repository.CreateUser(ctx, input, hash, RegistrationEvent{ID: eventID, EventType: "identity.user_registered", Payload: payload, Headers: []byte(`{"content-type":"application/protobuf"}`), OccurredAt: now})
	if err != nil {
		return User{}, err
	}
	return user, nil
}

func (s *Service) Login(ctx context.Context, email, password, expectedRole string, metadata SessionMetadata) (User, security.TokenPair, error) {
	domainmetrics.AuthLogin()
	if expectedRole != "admin" && expectedRole != "provider" && expectedRole != "customer" {
		domainmetrics.AuthLoginFailed()
		return User{}, security.TokenPair{}, ErrInvalidCredentials
	}
	user, err := s.repository.FindByEmail(ctx, strings.ToLower(strings.TrimSpace(email)))
	if err != nil {
		domainmetrics.AuthLoginFailed()
		return User{}, security.TokenPair{}, ErrInvalidCredentials
	}
	valid, rehash := s.hasher.Verify(password, user.PasswordHash)
	if !valid {
		domainmetrics.AuthLoginFailed()
		return User{}, security.TokenPair{}, ErrInvalidCredentials
	}
	if user.Role != expectedRole {
		domainmetrics.AuthLoginFailed()
		return User{}, security.TokenPair{}, ErrInvalidCredentials
	}
	if user.Status != "active" {
		domainmetrics.AuthLoginFailed()
		return User{}, security.TokenPair{}, ErrInactive
	}
	if rehash {
		if updated, hashErr := s.hasher.Hash(password); hashErr == nil {
			_ = s.repository.UpdatePassword(ctx, user.ID, updated)
		}
	}
	pair, err := s.tokens.Issue(tokenSubject(user), uuid.Nil)
	if err != nil {
		domainmetrics.AuthLoginFailed()
		return User{}, security.TokenPair{}, err
	}
	if err := s.repository.CreateSession(ctx, domainSession(pair.Session, user.ID), metadata); err != nil {
		domainmetrics.AuthLoginFailed()
		return User{}, security.TokenPair{}, err
	}
	return user, pair, nil
}

func (s *Service) Refresh(ctx context.Context, raw, expectedRole string, metadata SessionMetadata) (User, security.TokenPair, error) {
	if expectedRole != "admin" && expectedRole != "provider" && expectedRole != "customer" {
		return User{}, security.TokenPair{}, ErrInvalidCredentials
	}
	refresh, newSession, err := s.tokens.NewRefresh(uuid.Nil)
	if err != nil {
		return User{}, security.TokenPair{}, err
	}
	user, storedSession, err := s.repository.RotateSession(ctx, security.HashRefresh(raw), expectedRole, domainSession(newSession, 0), metadata)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return User{}, security.TokenPair{}, ErrInvalidCredentials
		}
		return User{}, security.TokenPair{}, err
	}
	access, expiresIn, err := s.tokens.IssueAccess(tokenSubject(user))
	if err != nil {
		return User{}, security.TokenPair{}, err
	}
	pair := security.TokenPair{AccessToken: access, RefreshToken: refresh, Session: tokenSession(storedSession), ExpiresIn: expiresIn}
	return user, pair, nil
}

func tokenSubject(user User) security.TokenSubject {
	return security.TokenSubject{ID: user.ID, Role: user.Role, ProviderID: user.ProviderID, BranchID: user.BranchID, Permissions: user.Permissions}
}

func (s *Service) UpsertProviderBranchAccount(ctx context.Context, input ProviderBranchAccountInput) (User, error) {
	input.Name = strings.TrimSpace(input.Name)
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	input.Status = strings.ToLower(strings.TrimSpace(input.Status))
	address, mailErr := mail.ParseAddress(input.Email)
	if input.ProviderID <= 0 || input.BranchID <= 0 || input.ProviderRoleID <= 0 || input.Name == "" || len(input.Name) > 255 || mailErr != nil || !strings.EqualFold(address.Address, input.Email) || len(input.Email) > 255 || input.Status != "active" && input.Status != "inactive" || input.Password != "" && len(input.Password) < 8 {
		return User{}, ErrValidation
	}
	permissions := make([]string, 0, len(input.Permissions))
	seen := map[string]struct{}{}
	for _, permission := range input.Permissions {
		permission = strings.TrimSpace(permission)
		if permission == "" {
			return User{}, ErrValidation
		}
		if _, exists := seen[permission]; exists {
			continue
		}
		seen[permission] = struct{}{}
		permissions = append(permissions, permission)
	}
	input.Permissions = permissions
	var passwordHash *string
	if input.Password != "" {
		hash, err := s.hasher.Hash(input.Password)
		if err != nil {
			return User{}, err
		}
		passwordHash = &hash
	}
	return s.repository.UpsertProviderBranchAccount(ctx, input, passwordHash)
}

func domainSession(session security.RefreshSession, userID int64) Session {
	return Session{ID: session.ID, UserID: userID, FamilyID: session.FamilyID, TokenHash: session.TokenHash, ExpiresAt: session.ExpiresAt}
}

func tokenSession(session Session) security.RefreshSession {
	return security.RefreshSession{ID: session.ID, FamilyID: session.FamilyID, TokenHash: session.TokenHash, ExpiresAt: session.ExpiresAt}
}

func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	if refreshToken == "" {
		return nil
	}
	return s.repository.RevokeSession(ctx, security.HashRefresh(refreshToken))
}

func (s *Service) Get(ctx context.Context, id string) (User, error) {
	parsed, err := strconv.ParseInt(id, 10, 64)
	if err != nil {
		return User{}, ErrNotFound
	}
	return s.repository.FindByID(ctx, parsed)
}

func (s *Service) ChangePassword(ctx context.Context, userID string, current, replacement string) error {
	user, err := s.Get(ctx, userID)
	if err != nil {
		return err
	}
	valid, _ := s.hasher.Verify(current, user.PasswordHash)
	if !valid {
		return ErrInvalidCredentials
	}
	hash, err := s.hasher.Hash(replacement)
	if err != nil {
		return err
	}
	return s.repository.UpdatePassword(ctx, user.ID, hash)
}

func (s *Service) UpdateProfile(ctx context.Context, userID string, input ProfileUpdate) (User, error) {
	parsed, err := strconv.ParseInt(userID, 10, 64)
	input.Name = strings.TrimSpace(input.Name)
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	input.Username = strings.TrimSpace(input.Username)
	address, mailErr := mail.ParseAddress(input.Email)
	if err != nil || parsed <= 0 || input.Name == "" || len(input.Name) > 255 || mailErr != nil || !strings.EqualFold(address.Address, input.Email) || len(input.Email) > 255 || len(input.Username) > 255 {
		return User{}, ErrValidation
	}
	return s.repository.UpdateProfile(ctx, parsed, input)
}

func (s *Service) SetStatus(ctx context.Context, userID, status string) (User, error) {
	parsed, err := strconv.ParseInt(userID, 10, 64)
	if err != nil || parsed <= 0 || status != "active" && status != "inactive" {
		return User{}, ErrNotFound
	}
	return s.repository.SetStatus(ctx, parsed, status)
}
