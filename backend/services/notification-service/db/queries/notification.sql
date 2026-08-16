-- name: CreateNotification :one
INSERT INTO notifications (user_id, type, title, body, url, data)
VALUES ($1,$2,$3,$4,$5,$6)
RETURNING id, user_id, type, title, body, url, data, read_at, created_at, updated_at;

-- name: ListNotifications :many
SELECT id, user_id, type, title, body, url, data, read_at, created_at, updated_at
FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3;

-- name: MarkNotificationRead :exec
UPDATE notifications SET read_at=COALESCE(read_at,now()), updated_at=now() WHERE id=$1 AND user_id=$2;

-- name: InsertNotificationInbox :execrows
INSERT INTO inbox_events (event_id, topic, partition_id, offset_id, event_type)
VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING;

-- name: CreateDeliveryAttempt :exec
INSERT INTO delivery_attempts (id, notification_id, channel, status, attempt_count, next_attempt_at)
VALUES ($1,$2,$3,$4,$5,$6);

-- name: ListDueDeliveryAttempts :many
SELECT id, notification_id, channel, status, attempt_count, next_attempt_at, last_error, provider_message_id, created_at, updated_at
FROM delivery_attempts WHERE status='pending' AND next_attempt_at<=now() ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED;

