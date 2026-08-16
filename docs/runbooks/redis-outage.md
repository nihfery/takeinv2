# Redis Outage

Redis loss may degrade cache/rate limits but must not bypass PostgreSQL booking constraints or authentication authorization. Disable optional cache features, monitor database load, restore Redis, then warm bounded caches. Never reconstruct business truth from Redis alone.

Every action must record operator, UTC timestamps, environment, affected service/version, evidence, rollback decision, and final verification. Never expose secrets or delete source data during incident response.
