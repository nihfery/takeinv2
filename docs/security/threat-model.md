# Threat model

Trust boundary publik mencakup empat origin Next.js, API edge, webhook, dan
WebSocket. PostgreSQL, Redis, Kafka, gRPC, worker, object credential, serta
telemetry backend harus private.

| Risiko | Kontrol utama |
| --- | --- |
| Credential/token theft | RS256, token singkat, refresh rotation, secure cookie, redacted logs |
| Broken object authorization | RBAC + ownership check pada application layer |
| Slot/payment race | transaction, row lock/constraint, idempotency key, race test |
| Forged webhook/replay | signature verification, authoritative status fetch, replay key |
| Cross-service data leak | database credential per service, gRPC contract, network private |
| Event duplication/poison message | inbox/outbox, idempotent consumer, bounded retry, DLQ |
| Malicious upload | size/type policy, random object key, private bucket, signed URL |
| Supply-chain compromise | lockfile, Go/npm audit, image scan, immutable image |
| Dependency outage | readiness, circuit/bounded retry, persisted source of truth, runbook |

Risiko residual mencakup kapasitas produksi, managed-service HA, DNS/TLS, alert
delivery, off-site backup, dan secret-manager availability; platform owner harus
menyediakan serta menguji kontrol tersebut.
