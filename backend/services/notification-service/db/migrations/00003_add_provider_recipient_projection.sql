-- +goose Up
CREATE TABLE provider_recipient_projection (
    provider_id BIGINT PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS provider_recipient_projection;
