-- name: CreateUser :one
INSERT INTO users (name, username, email, password_hash, role, status, provider_id, branch_id, provider_role_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id, name, username, email, email_verified_at, password_hash, role, status, provider_id, branch_id, provider_role_id, permissions, created_at, updated_at;

-- name: GetUserByID :one
SELECT id, name, username, email, email_verified_at, password_hash, role, status, provider_id, branch_id, provider_role_id, permissions, created_at, updated_at
FROM users WHERE id = $1;

-- name: GetUserByEmail :one
SELECT id, name, username, email, email_verified_at, password_hash, role, status, provider_id, branch_id, provider_role_id, permissions, created_at, updated_at
FROM users WHERE email = $1;

-- name: UpdatePasswordHash :exec
UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1;

-- name: UpdateAccountStatus :one
UPDATE users SET status = $2, updated_at = now() WHERE id = $1
RETURNING id, name, username, email, email_verified_at, password_hash, role, status, provider_id, branch_id, provider_role_id, permissions, created_at, updated_at;

-- name: CreateRefreshSession :exec
INSERT INTO refresh_sessions (id, user_id, family_id, token_hash, user_agent, ip_address, expires_at)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: GetRefreshSessionForUpdate :one
SELECT id, user_id, family_id, token_hash, user_agent, ip_address, expires_at, used_at, revoked_at, replaced_by, created_at
FROM refresh_sessions WHERE token_hash = $1 FOR UPDATE;

-- name: RotateRefreshSession :exec
UPDATE refresh_sessions SET used_at = now(), replaced_by = $2 WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL;

-- name: RevokeRefreshFamily :exec
UPDATE refresh_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE family_id = $1;

-- name: InsertIdentityOutbox :exec
INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, event_version, payload, headers, occurred_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
