# notification-service

Persisted in-app notifications and bounded Kafka delivery processing.

Ownership: PostgreSQL database `takein_notification`; consumes booking/payment/billing events; publishes notification events. The API serves HTTP on `:8080`, metadata reserves gRPC `:9090`, and platform endpoints are `/health/live`, `/health/ready`, and `/metrics`.

Common required configuration: `POSTGRES_DSN`, `KAFKA_BROKERS`, `REDIS_ADDR`, `APP_ENV`, `HTTP_ADDR`, and `JWT_PUBLIC_KEY`. Production secrets have no silent defaults.

```bash
go test ./...
go vet ./...
go run ./cmd/api
go run ./cmd/worker
```

Apply `db/migrations` with Goose and regenerate `internal/persistence/postgres/sqlc` after query changes. Production traffic requires green contract, migration, health, and smoke-test gates.

## Interfaces and events

- REST: list, mark-one-read, and mark-all-read under `/api/notifications`.
- No gRPC API at launch.
- Publishes `takein.notification.events.v1`; consumes booking/payment/billing/provider events with inbox deduplication and per-source DLQ.

See [.env.example](.env.example). External delivery adapters are optional production dependencies; failures are persisted for bounded retry and never block booking/payment. Reads are recipient-scoped, and notification payloads must exclude tokens and private documents.
