# Postgres Backup Restore

Production requires automated encrypted off-host backups, WAL/PITR retention, access controls, and periodic restore drills. Before a migration/cutover, record backup identifier and recovery point. Restore into an isolated database, verify checksums/invariants, then document RPO/RTO evidence; a Docker volume is not a backup.

Every action must record operator, UTC timestamps, environment, affected service/version, evidence, rollback decision, and final verification. Never expose secrets or delete source data during incident response.
