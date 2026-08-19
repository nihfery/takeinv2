package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	eventscommonv1 "github.com/nihfery/takein/gen/go/takein/events/common/v1"
	identityeventsv1 "github.com/nihfery/takein/gen/go/takein/events/identity/v1"
	"github.com/nihfery/takein/services/identity-service/internal/identity"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

const userColumns = `id,name,username,email,email_verified_at,password_hash,role,status,provider_id,branch_id,provider_role_id,permissions,created_at,updated_at`

func (r *Repository) CreateUser(ctx context.Context, input identity.Registration, passwordHash string, event identity.RegistrationEvent) (identity.User, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return identity.User{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	row := tx.QueryRow(ctx, `INSERT INTO users (name, username, email, password_hash, role, status)
		VALUES ($1,$2,$3,$4,$5,'active')
		RETURNING `+userColumns,
		input.Name, input.Username, input.Email, passwordHash, input.Role)
	user, err := scanUser(row)
	if err != nil {
		return identity.User{}, translate(err)
	}
	message := &identityeventsv1.UserRegistered{}
	if err := proto.Unmarshal(event.Payload, message); err != nil {
		return identity.User{}, err
	}
	message.UserId = fmt.Sprintf("%d", user.ID)
	payload, err := proto.Marshal(message)
	if err != nil {
		return identity.User{}, err
	}
	headers := json.RawMessage(event.Headers)
	if !json.Valid(headers) {
		headers = json.RawMessage(`{}`)
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events
		(id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,occurred_at)
		VALUES($1,'user',$2,$3,1,$4,$5,$6)`, event.ID, fmt.Sprintf("%d", user.ID), event.EventType, payload, headers, event.OccurredAt)
	if err != nil {
		return identity.User{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return identity.User{}, err
	}
	return user, nil
}

func (r *Repository) FindByEmail(ctx context.Context, email string) (identity.User, error) {
	return scanUser(r.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE email=$1`, email))
}

func (r *Repository) FindByID(ctx context.Context, id int64) (identity.User, error) {
	return scanUser(r.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id=$1`, id))
}

func (r *Repository) UpdatePassword(ctx context.Context, id int64, hash string) error {
	result, err := r.pool.Exec(ctx, `UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1`, id, hash)
	if err == nil && result.RowsAffected() == 0 {
		return identity.ErrNotFound
	}
	return err
}

func (r *Repository) UpdateProfile(ctx context.Context, id int64, input identity.ProfileUpdate) (identity.User, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return identity.User{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	user, err := scanUser(tx.QueryRow(ctx, `UPDATE users SET name=$2,email=$3,username=CASE WHEN $5 THEN NULL ELSE COALESCE(NULLIF($4,''),username) END,updated_at=now() WHERE id=$1 RETURNING `+userColumns, id, input.Name, input.Email, input.Username, input.ClearUsername))
	if err != nil {
		return identity.User{}, translate(err)
	}
	eventID := uuid.New()
	now := time.Now().UTC()
	username := ""
	if user.Username != nil {
		username = *user.Username
	}
	message := &identityeventsv1.UserProfileUpdated{Metadata: &eventscommonv1.EventMetadata{EventId: eventID.String(), EventVersion: 1, OccurredAt: timestamppb.New(now), Producer: "identity-service", AggregateId: fmt.Sprint(id)}, UserId: fmt.Sprint(id), Name: user.Name, Username: username, Email: user.Email}
	payload, err := proto.Marshal(message)
	if err != nil {
		return identity.User{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,occurred_at) VALUES($1,'user',$2,'identity.user_profile_updated',1,$3,'{"content-type":"application/protobuf"}'::jsonb,$4)`, eventID, fmt.Sprint(id), payload, now); err != nil {
		return identity.User{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return identity.User{}, err
	}
	return user, nil
}

func (r *Repository) SetStatus(ctx context.Context, id int64, target string) (identity.User, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return identity.User{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	user, err := scanUser(tx.QueryRow(ctx, `UPDATE users SET status=$2,updated_at=now() WHERE id=$1 RETURNING `+userColumns, id, target))
	if err != nil {
		return identity.User{}, translate(err)
	}
	eventID := uuid.New()
	now := time.Now().UTC()
	message := &identityeventsv1.UserStatusChanged{Metadata: &eventscommonv1.EventMetadata{EventId: eventID.String(), EventVersion: 1, OccurredAt: timestamppb.New(now), Producer: "identity-service", AggregateId: fmt.Sprint(id)}, UserId: fmt.Sprint(id), Status: target}
	payload, err := proto.Marshal(message)
	if err != nil {
		return identity.User{}, err
	}
	eventType := "identity.user_enabled"
	if target == "inactive" {
		eventType = "identity.user_disabled"
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,occurred_at) VALUES($1,'user',$2,$3,1,$4,'{"content-type":"application/protobuf"}'::jsonb,$5)`, eventID, fmt.Sprint(id), eventType, payload, now)
	if err != nil {
		return identity.User{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return identity.User{}, err
	}
	return user, nil
}

func (r *Repository) UpsertProviderBranchAccount(ctx context.Context, input identity.ProviderBranchAccountInput, passwordHash *string) (identity.User, error) {
	// A password is mandatory only for the first insert. Updates preserve the
	// existing hash unless a replacement was explicitly supplied.
	if passwordHash == nil {
		var exists bool
		if err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE provider_role_id=$1)`, input.ProviderRoleID).Scan(&exists); err != nil {
			return identity.User{}, err
		}
		if !exists {
			return identity.User{}, identity.ErrValidation
		}
	}
	row := r.pool.QueryRow(ctx, `INSERT INTO users(name,email,password_hash,role,status,provider_id,branch_id,provider_role_id,permissions,email_verified_at)
		VALUES($1,$2,COALESCE($3,''),'provider',$4,$5,$6,$7,$8,now())
		ON CONFLICT(provider_role_id) WHERE provider_role_id IS NOT NULL DO UPDATE SET
		name=EXCLUDED.name,email=EXCLUDED.email,password_hash=COALESCE(NULLIF(EXCLUDED.password_hash,''),users.password_hash),
		status=EXCLUDED.status,provider_id=EXCLUDED.provider_id,branch_id=EXCLUDED.branch_id,permissions=EXCLUDED.permissions,
		email_verified_at=COALESCE(users.email_verified_at,now()),updated_at=now()
		RETURNING `+userColumns,
		input.Name, input.Email, passwordHash, input.Status, input.ProviderID, input.BranchID, input.ProviderRoleID, input.Permissions)
	return scanUser(row)
}

func (r *Repository) CreateSession(ctx context.Context, session identity.Session, metadata identity.SessionMetadata) error {
	_, err := r.pool.Exec(ctx, `INSERT INTO refresh_sessions(id,user_id,family_id,token_hash,user_agent,ip_address,expires_at)
		VALUES($1,$2,$3,$4,$5,$6,$7)`, session.ID, session.UserID, session.FamilyID, session.TokenHash, metadata.UserAgent, nullableIP(metadata.IPAddress), session.ExpiresAt)
	return err
}

func (r *Repository) RotateSession(ctx context.Context, oldHash []byte, expectedRole string, replacement identity.Session, metadata identity.SessionMetadata) (identity.User, identity.Session, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return identity.User{}, identity.Session{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var old identity.Session
	row := tx.QueryRow(ctx, `SELECT s.id,s.user_id,s.family_id,s.token_hash,s.expires_at,s.used_at,s.revoked_at,
		u.id,u.name,u.username,u.email,u.email_verified_at,u.password_hash,u.role,u.status,u.provider_id,u.branch_id,u.provider_role_id,u.permissions,u.created_at,u.updated_at
		FROM refresh_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND u.role=$2 FOR UPDATE OF s`, oldHash, expectedRole)
	var user identity.User
	err = row.Scan(&old.ID, &old.UserID, &old.FamilyID, &old.TokenHash, &old.ExpiresAt, &old.UsedAt, &old.RevokedAt,
		&user.ID, &user.Name, &user.Username, &user.Email, &user.EmailVerified, &user.PasswordHash, &user.Role, &user.Status,
		&user.ProviderID, &user.BranchID, &user.ProviderRoleID, &user.Permissions, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return identity.User{}, identity.Session{}, translate(err)
	}
	if old.UsedAt != nil || old.RevokedAt != nil || !old.ExpiresAt.After(time.Now()) {
		_, _ = tx.Exec(ctx, `UPDATE refresh_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE family_id=$1`, old.FamilyID)
		_ = tx.Commit(ctx)
		return identity.User{}, identity.Session{}, identity.ErrRefreshReplay
	}
	replacement.UserID = old.UserID
	replacement.FamilyID = old.FamilyID
	_, err = tx.Exec(ctx, `INSERT INTO refresh_sessions(id,user_id,family_id,token_hash,user_agent,ip_address,expires_at)
		VALUES($1,$2,$3,$4,$5,$6,$7)`, replacement.ID, replacement.UserID, replacement.FamilyID, replacement.TokenHash, metadata.UserAgent, nullableIP(metadata.IPAddress), replacement.ExpiresAt)
	if err != nil {
		return identity.User{}, identity.Session{}, err
	}
	result, err := tx.Exec(ctx, `UPDATE refresh_sessions SET used_at=now(),replaced_by=$2 WHERE id=$1 AND used_at IS NULL AND revoked_at IS NULL`, old.ID, replacement.ID)
	if err != nil || result.RowsAffected() != 1 {
		return identity.User{}, identity.Session{}, identity.ErrRefreshReplay
	}
	if err := tx.Commit(ctx); err != nil {
		return identity.User{}, identity.Session{}, err
	}
	return user, replacement, nil
}

func (r *Repository) RevokeSession(ctx context.Context, hash []byte) error {
	_, err := r.pool.Exec(ctx, `UPDATE refresh_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE token_hash=$1`, hash)
	return err
}

type rowScanner interface{ Scan(...any) error }

func scanUser(row rowScanner) (identity.User, error) {
	var user identity.User
	if err := row.Scan(&user.ID, &user.Name, &user.Username, &user.Email, &user.EmailVerified, &user.PasswordHash,
		&user.Role, &user.Status, &user.ProviderID, &user.BranchID, &user.ProviderRoleID, &user.Permissions, &user.CreatedAt, &user.UpdatedAt); err != nil {
		return identity.User{}, translate(err)
	}
	return user, nil
}

func translate(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return identity.ErrNotFound
	}
	var postgresError *pgconn.PgError
	if errors.As(err, &postgresError) && postgresError.Code == "23505" {
		return identity.ErrConflict
	}
	return err
}

func nullableIP(value string) any {
	if net.ParseIP(value) == nil {
		return nil
	}
	return value
}
