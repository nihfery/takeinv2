# Booking Conflict Incident

Confirm PostgreSQL exclusion constraint health and inspect SQLSTATE 23P01/40P01 rates. Do not disable the constraint or substitute a Redis lock. Compare staff/time/status inputs, idempotency key hashes and hold expiry. Escalate anomalous conflicts with sanitized booking IDs and trace correlation.

Every action must record operator, UTC timestamps, environment, affected service/version, evidence, rollback decision, and final verification. Never expose secrets or delete source data during incident response.
