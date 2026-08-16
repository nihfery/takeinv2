-- +goose Up
ALTER TABLE payments ADD COLUMN branch_id BIGINT;
CREATE INDEX payments_provider_scope_idx
    ON payments(provider_id, branch_id, created_at DESC)
    WHERE provider_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS payments_provider_scope_idx;
ALTER TABLE payments DROP COLUMN IF EXISTS branch_id;
