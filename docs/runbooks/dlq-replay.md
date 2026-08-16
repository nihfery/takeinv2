# Dlq Replay

Export and inspect DLQ records without credentials or PII leakage. Fix the deterministic consumer cause, select event IDs, and republish to the original topic with a replay correlation marker. Inbox dedup means existing event IDs may intentionally no-op; document any controlled inbox reset and never bulk reset production.

Every action must record operator, UTC timestamps, environment, affected service/version, evidence, rollback decision, and final verification. Never expose secrets or delete source data during incident response.
