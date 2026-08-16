# Observability Incident

Start with service readiness, HTTP 5xx/latency, trace correlation, Postgres pool saturation, Kafka producer/lag/DLQ, and outbox backlog. Preserve logs/traces with access control and redact tokens/PII. Declare impact and timeline, apply the narrow mitigation, then record missing telemetry and follow-up.

Every action must record operator, UTC timestamps, environment, affected service/version, evidence, rollback decision, and final verification. Never expose secrets or delete source data during incident response.
