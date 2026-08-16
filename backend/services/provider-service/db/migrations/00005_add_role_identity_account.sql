-- +goose Up
ALTER TABLE provider_roles ADD COLUMN identity_user_id BIGINT;
CREATE UNIQUE INDEX provider_roles_identity_user_unique_idx
    ON provider_roles(identity_user_id)
    WHERE identity_user_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS provider_roles_identity_user_unique_idx;
ALTER TABLE provider_roles DROP COLUMN IF EXISTS identity_user_id;
