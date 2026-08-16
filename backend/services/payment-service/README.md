# payment-service

Booking payments, Midtrans charge/webhook, signature and replay protection.

Ownership: PostgreSQL database `takein_payment`; publishes `takein.payment.events.v1`. The API serves HTTP on `:8080`, metadata reserves gRPC `:9090`, and platform endpoints are `/health/live`, `/health/ready`, and `/metrics`.

Common required configuration: `POSTGRES_DSN`, `KAFKA_BROKERS`, `REDIS_ADDR`, `APP_ENV`, `HTTP_ADDR`, and `JWT_PUBLIC_KEY`, `MIDTRANS_SERVER_KEY`, `MIDTRANS_BASE_URL`. Production secrets have no silent defaults.

```bash
go test ./...
go vet ./...
go run ./cmd/api
go run ./cmd/worker
```

Apply `db/migrations` with Goose and regenerate `internal/persistence/postgres/sqlc` after query changes. Production traffic requires green contract, migration, health, and smoke-test gates.

## Interfaces and events

- REST: booking payment charge/status/manual-confirm compatibility, provider-scoped payment listing (including `pay_at_salon`), and `/api/midtrans/notification`.
- gRPC: `GetPayment` and `CreateSubscriptionCharge`.
- Publishes `takein.payment.events.v1`; booking and billing consume these events.

See [.env.example](.env.example). Booking, Midtrans, PostgreSQL, Kafka, and Redis rate limiting are dependencies. Invalid signatures and amount/currency mismatches fail closed; replay/out-of-order events are idempotent and monotonic. The service never writes booking or billing databases.
