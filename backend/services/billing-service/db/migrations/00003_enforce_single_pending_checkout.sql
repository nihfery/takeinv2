-- +goose Up
WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY provider_id ORDER BY id DESC) AS position
    FROM provider_subscriptions
    WHERE payment_status = 'pending' AND subscription_status = 'inactive' AND superseded_at IS NULL
)
UPDATE provider_subscriptions
SET superseded_at = now(), updated_at = now()
WHERE id IN (SELECT id FROM ranked WHERE position > 1);

CREATE UNIQUE INDEX provider_subscriptions_one_pending_checkout_idx
    ON provider_subscriptions(provider_id)
    WHERE payment_status = 'pending' AND subscription_status = 'inactive' AND superseded_at IS NULL;

-- +goose Down
DROP INDEX IF EXISTS provider_subscriptions_one_pending_checkout_idx;
