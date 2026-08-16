# audit-service

Append-only domain-event audit projection and admin query.

Ownership: PostgreSQL database `takein_audit`; consumes all domain topics with inbox dedup and DLQ. The API serves HTTP on `:8080`, metadata reserves gRPC `:9090`, and platform endpoints are `/health/live`, `/health/ready`, and `/metrics`.

Common required configuration: `POSTGRES_DSN`, `KAFKA_BROKERS`, `REDIS_ADDR`, `APP_ENV`, `HTTP_ADDR`, and `JWT_PUBLIC_KEY`. Production secrets have no silent defaults.

```bash
go test ./...
go vet ./...
go run ./cmd/api
go run ./cmd/worker
```

Apply `db/migrations` with Goose and regenerate `internal/persistence/postgres/sqlc` after query changes. Production traffic requires green contract, migration, health, and smoke-test gates.

## Interfaces and events

- REST: bounded admin-only `GET /api/admin/audit`.
- No gRPC API or domain event publication at launch.
- Consumes all business-domain event topics with inbox deduplication and per-source DLQ.

See [.env.example](.env.example). Kafka failure pauses projection progress without affecting source commits; lag/DLQ metrics expose the gap. Records are append-only, query access is admin-only, and sanitized payloads must exclude secrets, tokens, and full private identity documents.
