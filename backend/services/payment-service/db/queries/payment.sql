-- name: CreatePayment :one
INSERT INTO payments (booking_id, customer_id, payment_type, amount, currency, status, payment_method, idempotency_key)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
RETURNING id, booking_id, customer_id, payment_type, amount, currency, status, payment_method, idempotency_key, paid_at, created_at, updated_at;

-- name: GetPaymentByID :one
SELECT id, booking_id, customer_id, payment_type, amount, currency, status, payment_method, idempotency_key, paid_at, created_at, updated_at
FROM payments WHERE id = $1;

-- name: GetPaymentByGatewayOrderIDForUpdate :one
SELECT p.id, p.booking_id, p.customer_id, p.payment_type, p.amount, p.currency, p.status, p.payment_method,
       p.idempotency_key, p.paid_at, p.created_at, p.updated_at
FROM payments p JOIN payment_gateway_transactions g ON g.payment_id = p.id
WHERE g.provider_order_id = $1 FOR UPDATE OF p;

-- name: UpdatePaymentStatus :one
UPDATE payments SET status = $2, paid_at = $3, updated_at = now() WHERE id = $1
RETURNING id, booking_id, customer_id, payment_type, amount, currency, status, payment_method, idempotency_key, paid_at, created_at, updated_at;

-- name: UpsertGatewayTransaction :one
INSERT INTO payment_gateway_transactions (payment_id, gateway, payment_channel, provider_order_id, provider_transaction_id,
  provider_status, fraud_status, payment_code_label, payment_code, biller_code, qr_url, deeplink_url, expires_at,
  raw_response, raw_notification)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
ON CONFLICT (provider_order_id) DO UPDATE SET
  provider_transaction_id=EXCLUDED.provider_transaction_id, provider_status=EXCLUDED.provider_status,
  fraud_status=EXCLUDED.fraud_status, payment_channel=EXCLUDED.payment_channel,
  raw_notification=EXCLUDED.raw_notification, updated_at=now()
RETURNING id, payment_id, gateway, payment_channel, provider_order_id, provider_transaction_id, provider_status,
  fraud_status, payment_code_label, payment_code, biller_code, qr_url, deeplink_url, expires_at,
  raw_response, raw_notification, created_at, updated_at;

-- name: InsertWebhookNotification :execrows
INSERT INTO webhook_notifications (notification_hash, provider_order_id, provider_transaction_id, transaction_status, signature_key_hash)
VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING;

-- name: MarkWebhookProcessed :exec
UPDATE webhook_notifications SET processed_at=now(), result_status=$2, failure=$3 WHERE notification_hash=$1;

-- name: InsertPaymentOutbox :exec
INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, event_version, payload, headers, occurred_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8);

