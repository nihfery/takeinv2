package identity

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nihfery/takein/services/identity-service/internal/security"
)

type memoryRepository struct {
	mu       sync.Mutex
	users    map[string]User
	sessions map[string]Session
	nextID   int64
}

func newMemoryRepository() *memoryRepository {
	return &memoryRepository{users: map[string]User{}, sessions: map[string]Session{}, nextID: 1}
}

func (r *memoryRepository) CreateUser(_ context.Context, input Registration, hash string, _ RegistrationEvent) (User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.users[input.Email]; exists {
		return User{}, ErrConflict
	}
	user := User{ID: r.nextID, Name: input.Name, Username: input.Username, Email: input.Email, PasswordHash: hash, Role: input.Role, Status: "active", CreatedAt: time.Now(), UpdatedAt: time.Now()}
	r.nextID++
	r.users[input.Email] = user
	return user, nil
}

func (r *memoryRepository) FindByEmail(_ context.Context, email string) (User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	user, ok := r.users[email]
	if !ok {
		return User{}, ErrNotFound
	}
	return user, nil
}

func (r *memoryRepository) FindByID(_ context.Context, id int64) (User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, user := range r.users {
		if user.ID == id {
			return user, nil
		}
	}
	return User{}, ErrNotFound
}

func (r *memoryRepository) UpdatePassword(_ context.Context, id int64, hash string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for email, user := range r.users {
		if user.ID == id {
			user.PasswordHash = hash
			r.users[email] = user
			return nil
		}
	}
	return ErrNotFound
}

func (r *memoryRepository) UpdateProfile(_ context.Context, id int64, input ProfileUpdate) (User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for email, user := range r.users {
		if user.ID != id {
			continue
		}
		delete(r.users, email)
		user.Name, user.Email = input.Name, input.Email
		if input.ClearUsername {
			user.Username = nil
		} else if input.Username != "" {
			username := input.Username
			user.Username = &username
		}
		r.users[user.Email] = user
		return user, nil
	}
	return User{}, ErrNotFound
}

func (r *memoryRepository) SetStatus(_ context.Context, id int64, status string) (User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for email, user := range r.users {
		if user.ID == id {
			user.Status = status
			r.users[email] = user
			return user, nil
		}
	}
	return User{}, ErrNotFound
}

func (r *memoryRepository) UpsertProviderBranchAccount(_ context.Context, input ProviderBranchAccountInput, passwordHash *string) (User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for email, user := range r.users {
		if user.ProviderRoleID != nil && *user.ProviderRoleID == input.ProviderRoleID {
			delete(r.users, email)
			user.Name, user.Email, user.Status, user.Permissions = input.Name, input.Email, input.Status, input.Permissions
			user.ProviderID, user.BranchID = &input.ProviderID, &input.BranchID
			if passwordHash != nil {
				user.PasswordHash = *passwordHash
			}
			r.users[user.Email] = user
			return user, nil
		}
	}
	if passwordHash == nil {
		return User{}, ErrValidation
	}
	roleID := input.ProviderRoleID
	user := User{ID: r.nextID, Name: input.Name, Email: input.Email, PasswordHash: *passwordHash, Role: "provider", Status: input.Status, ProviderID: &input.ProviderID, BranchID: &input.BranchID, ProviderRoleID: &roleID, Permissions: input.Permissions}
	r.nextID++
	r.users[user.Email] = user
	return user, nil
}

func (r *memoryRepository) CreateSession(_ context.Context, session Session, _ SessionMetadata) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sessions[string(session.TokenHash)] = session
	return nil
}

func (r *memoryRepository) RotateSession(_ context.Context, oldHash []byte, replacement Session, _ SessionMetadata) (User, Session, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	old, ok := r.sessions[string(oldHash)]
	if !ok || old.UsedAt != nil || old.RevokedAt != nil {
		return User{}, Session{}, ErrRefreshReplay
	}
	used := time.Now()
	old.UsedAt = &used
	r.sessions[string(oldHash)] = old
	replacement.UserID = old.UserID
	replacement.FamilyID = old.FamilyID
	r.sessions[string(replacement.TokenHash)] = replacement
	for _, user := range r.users {
		if user.ID == old.UserID {
			return user, replacement, nil
		}
	}
	return User{}, Session{}, ErrNotFound
}

func (r *memoryRepository) RevokeSession(_ context.Context, hash []byte) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	session, ok := r.sessions[string(hash)]
	if ok {
		now := time.Now()
		session.RevokedAt = &now
		r.sessions[string(hash)] = session
	}
	return nil
}

func TestRegisterLoginRefreshRotationAndLogout(t *testing.T) {
	repository := newMemoryRepository()
	hasher := security.NewPasswordHasher()
	hasher.Memory = 8 * 1024
	hasher.Iterations = 1
	issuer, err := security.NewTokenIssuer("", "issuer", "audience", "test", time.Minute, time.Hour, true)
	if err != nil {
		t.Fatal(err)
	}
	service := NewService(repository, hasher, issuer)
	user, err := service.Register(context.Background(), Registration{Name: " Ada ", Email: "ADA@example.com", Password: "password123", Role: "customer"}, uuid.NewString())
	if err != nil {
		t.Fatal(err)
	}
	if user.Email != "ada@example.com" || user.Name != "Ada" {
		t.Fatalf("registration normalization failed: %#v", user)
	}
	_, pair, err := service.Login(context.Background(), "ADA@example.com", "password123", SessionMetadata{})
	if err != nil || pair.AccessToken == "" || pair.RefreshToken == "" {
		t.Fatalf("login failed: %v", err)
	}
	_, rotated, err := service.Refresh(context.Background(), pair.RefreshToken, SessionMetadata{})
	if err != nil || rotated.RefreshToken == pair.RefreshToken {
		t.Fatalf("rotation failed: %v", err)
	}
	if _, _, err := service.Refresh(context.Background(), pair.RefreshToken, SessionMetadata{}); !errors.Is(err, ErrRefreshReplay) {
		t.Fatalf("refresh replay was not rejected: %v", err)
	}
	if err := service.Logout(context.Background(), rotated.RefreshToken); err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.Refresh(context.Background(), rotated.RefreshToken, SessionMetadata{}); !errors.Is(err, ErrRefreshReplay) {
		t.Fatalf("revoked refresh token was accepted: %v", err)
	}
}

func TestLoginRejectsWrongPassword(t *testing.T) {
	repository := newMemoryRepository()
	hasher := security.NewPasswordHasher()
	hasher.Memory = 8 * 1024
	hasher.Iterations = 1
	issuer, _ := security.NewTokenIssuer("", "issuer", "audience", "test", time.Minute, time.Hour, true)
	service := NewService(repository, hasher, issuer)
	_, _ = service.Register(context.Background(), Registration{Name: "Ada", Email: "ada@example.com", Password: "password123", Role: "customer"}, "")
	if _, _, err := service.Login(context.Background(), "ada@example.com", "wrong", SessionMetadata{}); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("unexpected error: %v", err)
	}
}
