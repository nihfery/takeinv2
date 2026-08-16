# customer-service

Customer profiles, activity projection, branch/staff reviews.

Ownership: PostgreSQL database `takein_customer`; publishes `takein.customer.events.v1`. The API serves HTTP on `:8080`, metadata reserves gRPC `:9090`, and platform endpoints are `/health/live`, `/health/ready`, and `/metrics`.

Common required configuration: `POSTGRES_DSN`, `KAFKA_BROKERS`, `REDIS_ADDR`, `APP_ENV`, `HTTP_ADDR`, and `JWT_PUBLIC_KEY`. Production secrets have no silent defaults.

```bash
go test ./...
go vet ./...
go run ./cmd/api
go run ./cmd/worker
```

Apply `db/migrations` with Goose and regenerate `internal/persistence/postgres/sqlc` after query changes. Production traffic requires green contract, migration, health, and smoke-test gates.

## Interfaces and events

- REST: customer profile/activity, booking review creation, provider customer-directory/review views, and admin customer routes.
- gRPC: `GetCustomer` and `CheckReviewEligibility`.
- Publishes `takein.customer.events.v1`; consumes identity/booking events with inbox deduplication and DLQ.

See [.env.example](.env.example). Identity, booking, and media are gRPC dependencies. Review creation fails safely if eligibility/media authorization is unavailable; projection lag may make recent activity or provider summaries temporarily stale. Customer, provider, and branch ownership plus cross-provider IDOR checks remain server-side.
