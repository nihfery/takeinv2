package identity

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrNotFound           = errors.New("identity not found")
	ErrConflict           = errors.New("identity already exists")
	ErrInactive           = errors.New("account is inactive")
	ErrRefreshReplay      = errors.New("refresh token replay detected")
	ErrValidation         = errors.New("identity profile is invalid")
)

type User struct {
	ID             int64      `json:"id"`
	Name           string     `json:"name"`
	Username       *string    `json:"username"`
	Email          string     `json:"email"`
	EmailVerified  *time.Time `json:"email_verified_at"`
	PasswordHash   string     `json:"-"`
	Role           string     `json:"role"`
	Status         string     `json:"status"`
	ProviderID     *int64     `json:"provider_id"`
	BranchID       *int64     `json:"branch_id"`
	ProviderRoleID *int64     `json:"provider_role_id"`
	Permissions    []string   `json:"permissions"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

type Registration struct {
	Name             string
	Username         *string
	Email            string
	Password         string
	Role             string
	PhoneNumber      string
	Gender           string
	DateOfBirth      string
	Religion         string
	Allergies        string
	ProviderCategory string
}

type ProfileUpdate struct {
	Name          string
	Email         string
	Username      string
	ClearUsername bool
}

type ProviderBranchAccountInput struct {
	ProviderID     int64
	BranchID       int64
	ProviderRoleID int64
	Name           string
	Email          string
	Password       string
	Status         string
	Permissions    []string
}

type Session struct {
	ID        uuid.UUID
	UserID    int64
	FamilyID  uuid.UUID
	TokenHash []byte
	ExpiresAt time.Time
	UsedAt    *time.Time
	RevokedAt *time.Time
}

type SessionMetadata struct {
	UserAgent string
	IPAddress string
}

type RegistrationEvent struct {
	ID         uuid.UUID
	EventType  string
	Payload    []byte
	Headers    []byte
	OccurredAt time.Time
}

type Repository interface {
	CreateUser(context.Context, Registration, string, RegistrationEvent) (User, error)
	FindByEmail(context.Context, string) (User, error)
	FindByID(context.Context, int64) (User, error)
	UpdatePassword(context.Context, int64, string) error
	UpdateProfile(context.Context, int64, ProfileUpdate) (User, error)
	SetStatus(context.Context, int64, string) (User, error)
	UpsertProviderBranchAccount(context.Context, ProviderBranchAccountInput, *string) (User, error)
	CreateSession(context.Context, Session, SessionMetadata) error
	RotateSession(context.Context, []byte, string, Session, SessionMetadata) (User, Session, error)
	RevokeSession(context.Context, []byte) error
}
