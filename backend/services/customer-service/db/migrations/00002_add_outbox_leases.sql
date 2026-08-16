-- +goose Up
ALTER TABLE outbox_events ADD COLUMN locked_at TIMESTAMPTZ, ADD COLUMN locked_by UUID;
CREATE INDEX customer_outbox_claim_idx ON outbox_events(occurred_at) WHERE published_at IS NULL AND locked_at IS NULL;
-- +goose Down
DROP INDEX IF EXISTS customer_outbox_claim_idx;
ALTER TABLE outbox_events DROP COLUMN IF EXISTS locked_by, DROP COLUMN IF EXISTS locked_at;
