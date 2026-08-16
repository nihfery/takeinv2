-- +goose Up
ALTER TABLE payments ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE payments ADD COLUMN subscription_id BIGINT;
ALTER TABLE payments ADD COLUMN provider_id BIGINT;
ALTER TABLE payments ADD CONSTRAINT payments_subject_check CHECK (
    (booking_id IS NOT NULL AND subscription_id IS NULL)
    OR (booking_id IS NULL AND subscription_id IS NOT NULL AND provider_id IS NOT NULL)
);
CREATE UNIQUE INDEX payments_subscription_idempotency_idx
    ON payments(provider_id, subscription_id)
    WHERE subscription_id IS NOT NULL;
CREATE UNIQUE INDEX payment_gateway_transactions_payment_unique_idx
    ON payment_gateway_transactions(payment_id);

-- +goose Down
DROP INDEX IF EXISTS payments_subscription_idempotency_idx;
DROP INDEX IF EXISTS payment_gateway_transactions_payment_unique_idx;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_subject_check;
ALTER TABLE payments DROP COLUMN IF EXISTS provider_id;
ALTER TABLE payments DROP COLUMN IF EXISTS subscription_id;
ALTER TABLE payments ALTER COLUMN booking_id SET NOT NULL;
