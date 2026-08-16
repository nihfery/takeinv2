# billing-service

Subscription plans, trial entitlement, immutable subscription snapshots.

Ownership: PostgreSQL database `takein_billing`; publishes `takein.billing.events.v1`. The API serves HTTP on `:8080`, metadata reserves gRPC `:9090`, and platform endpoints are `/health/live`, `/health/ready`, and `/metrics`.

Common required configuration: `POSTGRES_DSN`, `KAFKA_BROKERS`, `REDIS_ADDR`, `APP_ENV`, `HTTP_ADDR`, and `JWT_PUBLIC_KEY`. Production secrets have no silent defaults.

```bash
go test ./...
go vet ./...
go run ./cmd/api
go run ./cmd/worker
```

Apply `db/migrations` with Goose and regenerate `internal/persistence/postgres/sqlc` after query changes. Production traffic requires green contract, migration, health, and smoke-test gates.

## Interfaces and events

- REST: subscription overview and plan purchase under `/api/provider/subscriptions`.
- gRPC: `GetEntitlement`.
- Publishes `takein.billing.events.v1`; consumes payment events with inbox deduplication and DLQ.

See [.env.example](.env.example). Payment is a gRPC dependency. Purchased price/duration/branch limits are immutable snapshots; duplicate events are no-ops and prior active subscriptions are superseded transactionally. Payment dependency failure never creates a falsely active entitlement.
