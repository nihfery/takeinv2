-- +goose Up
ALTER TABLE users
    ADD COLUMN permissions TEXT[] NOT NULL DEFAULT '{}'::text[];

CREATE UNIQUE INDEX users_provider_role_unique_idx
    ON users(provider_role_id)
    WHERE provider_role_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS users_provider_role_unique_idx;
ALTER TABLE users DROP COLUMN IF EXISTS permissions;
