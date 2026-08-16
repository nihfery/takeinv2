-- name: CreateThread :one
INSERT INTO chat_threads (provider_id, provider_user_id, branch_user_id, customer_user_id, conversation_type,
  status, ticket_status, ticket_subject, ticket_body, opened_by_user_id)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
RETURNING id, provider_id, provider_user_id, branch_user_id, customer_user_id, conversation_type, last_message_id,
  last_message_at, last_admin_read_at, last_provider_read_at, last_branch_read_at, last_customer_read_at,
  status, ticket_status, ticket_subject, ticket_body, ticket_rejection_reason, ticket_requested_at,
  ticket_reviewed_at, ticket_reviewed_by, opened_by_user_id, closed_by_user_id, closed_at, created_at, updated_at;

-- name: GetThread :one
SELECT id, provider_id, provider_user_id, branch_user_id, customer_user_id, conversation_type, last_message_id,
  last_message_at, last_admin_read_at, last_provider_read_at, last_branch_read_at, last_customer_read_at,
  status, ticket_status, ticket_subject, ticket_body, ticket_rejection_reason, ticket_requested_at,
  ticket_reviewed_at, ticket_reviewed_by, opened_by_user_id, closed_by_user_id, closed_at, created_at, updated_at
FROM chat_threads WHERE id=$1;

-- name: CreateMessage :one
INSERT INTO chat_messages (chat_thread_id, sender_id, sender_role, body, attachment_object_id, attachment_name, attachment_mime, attachment_size)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
RETURNING id, chat_thread_id, sender_id, sender_role, body, attachment_object_id, attachment_name, attachment_mime, attachment_size, created_at, updated_at;

-- name: ListMessages :many
SELECT id, chat_thread_id, sender_id, sender_role, body, attachment_object_id, attachment_name, attachment_mime, attachment_size, created_at, updated_at
FROM chat_messages WHERE chat_thread_id=$1 ORDER BY id LIMIT $2 OFFSET $3;

-- name: UpdateThreadLastMessage :exec
UPDATE chat_threads SET last_message_id=$2, last_message_at=$3, updated_at=now() WHERE id=$1;

