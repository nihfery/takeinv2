-- name: InsertAuditInbox :execrows
INSERT INTO inbox_events (event_id, topic, partition_id, offset_id, event_type)
VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING;

-- name: CreateAuditRecord :one
INSERT INTO audit_records (event_id, actor_type, actor_id, action, resource_type, resource_id, provider_id, branch_id,
  request_id, correlation_id, trace_id, ip, user_agent, before_state, after_state, created_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
RETURNING id, event_id, actor_type, actor_id, action, resource_type, resource_id, provider_id, branch_id,
  request_id, correlation_id, trace_id, ip, user_agent, before_state, after_state, created_at;

-- name: ListAuditRecords :many
SELECT id, event_id, actor_type, actor_id, action, resource_type, resource_id, provider_id, branch_id,
  request_id, correlation_id, trace_id, ip, user_agent, before_state, after_state, created_at
FROM audit_records
WHERE ($1::bigint IS NULL OR provider_id=$1) AND ($2::text IS NULL OR resource_type=$2)
ORDER BY created_at DESC LIMIT $3 OFFSET $4;

