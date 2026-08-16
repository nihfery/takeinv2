-- +goose Up
ALTER TABLE provider_profiles ADD COLUMN display_name TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE provider_profiles DROP COLUMN IF EXISTS display_name;
