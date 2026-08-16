# Secret Rotation

Rotate one credential class at a time through the external secret manager. Use dual credentials where supported, restart/canary services, verify readiness and dependent operations, then revoke the old value. Never write secrets to `.env` in Git, logs, issue trackers, or migration reports.

Every action must record operator, UTC timestamps, environment, affected service/version, evidence, rollback decision, and final verification. Never expose secrets or delete source data during incident response.
