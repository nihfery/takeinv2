-- +goose Up
CREATE TABLE customer_favorites (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
    branch_id BIGINT NOT NULL CHECK (branch_id > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (customer_id, branch_id)
);

CREATE INDEX customer_favorites_customer_created_idx
    ON customer_favorites(customer_id, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS customer_favorites;
