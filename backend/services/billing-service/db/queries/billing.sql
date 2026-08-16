-- name: ListActivePlans :many
SELECT id, name, description, price, duration_days, max_branches, is_active, created_at, updated_at
FROM subscription_plans WHERE is_active = true ORDER BY price, id LIMIT 100;

-- name: GetProviderTrial :one
SELECT provider_id, starts_at, ends_at, source, updated_at FROM provider_trials WHERE provider_id = $1;

-- name: GetCurrentSubscription :one
SELECT id, provider_id, plan_id, plan_name, price, currency, duration_days, max_branches, payment_status,
       subscription_status, starts_at, ends_at, midtrans_order_id, midtrans_transaction_id, payment_channel,
       midtrans_transaction_status, fraud_status, payment_code_label, payment_code, biller_code, qr_url,
       deeplink_url, gateway_expires_at, gateway_response, gateway_notification, superseded_at,
       late_settlement_at, paid_at, created_at, updated_at
FROM provider_subscriptions
WHERE provider_id = $1 AND subscription_status = 'active' AND (ends_at IS NULL OR ends_at > now())
ORDER BY ends_at DESC NULLS FIRST LIMIT 1;

-- name: CreateSubscription :one
INSERT INTO provider_subscriptions (provider_id, plan_id, plan_name, price, currency, duration_days, max_branches, payment_status, subscription_status, midtrans_order_id)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
RETURNING id, provider_id, plan_id, plan_name, price, currency, duration_days, max_branches, payment_status,
          subscription_status, starts_at, ends_at, midtrans_order_id, midtrans_transaction_id, payment_channel,
          midtrans_transaction_status, fraud_status, payment_code_label, payment_code, biller_code, qr_url,
          deeplink_url, gateway_expires_at, gateway_response, gateway_notification, superseded_at,
          late_settlement_at, paid_at, created_at, updated_at;
