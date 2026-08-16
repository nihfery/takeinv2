-- +goose Up
CREATE TABLE provider_projection (
    provider_id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    ready BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE branch_projection (
    branch_id BIGINT PRIMARY KEY,
    provider_id BIGINT NOT NULL,
    branch_name TEXT NOT NULL,
    city_id TEXT,
    state_id TEXT,
    country_id TEXT,
    address TEXT,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    status TEXT NOT NULL DEFAULT 'active',
    ready BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX branch_projection_public_idx ON branch_projection(status, ready, city_id);

CREATE TABLE staff_projection (
    staff_id BIGINT PRIMARY KEY,
    provider_id BIGINT NOT NULL,
    branch_id BIGINT,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    service_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX staff_projection_public_idx ON staff_projection(branch_id, status);

-- +goose Down
DROP TABLE IF EXISTS staff_projection, branch_projection, provider_projection CASCADE;
