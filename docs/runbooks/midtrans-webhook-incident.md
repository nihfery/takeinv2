# Midtrans Webhook Incident

Preserve raw notification evidence without exposing signature/server key. Check endpoint reachability, constant-time signature failures, dedup rows and payment transition errors. Replay the same signed payload only in an authorized environment; database dedup must return the existing result without duplicate events.

Every action must record operator, UTC timestamps, environment, affected service/version, evidence, rollback decision, and final verification. Never expose secrets or delete source data during incident response.
