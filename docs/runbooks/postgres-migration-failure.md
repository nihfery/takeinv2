# Postgres Migration Failure

Stop the service rollout and leave the previous replica/router active. Capture Goose version, SQLSTATE and affected database. Prefer a forward-compatible corrective migration; run down only when explicitly reviewed and proven safe. Restore from backup for destructive partial failure.

Every action must record operator, UTC timestamps, environment, affected service/version, evidence, rollback decision, and final verification. Never expose secrets or delete source data during incident response.
