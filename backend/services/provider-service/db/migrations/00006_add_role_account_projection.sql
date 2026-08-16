-- +goose Up
ALTER TABLE provider_roles
    ADD COLUMN account_name TEXT,
    ADD COLUMN account_email TEXT;

-- +goose Down
ALTER TABLE provider_roles
    DROP COLUMN IF EXISTS account_email,
    DROP COLUMN IF EXISTS account_name;
