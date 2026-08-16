# booking-service

Availability, holds, booking lifecycle, checkout compatibility, admin booking state.

Ownership: PostgreSQL database `takein_booking`; publishes `takein.booking.events.v1`; consumes payment events. The API serves HTTP on `:8080`, metadata reserves gRPC `:9090`, and platform endpoints are `/health/live`, `/health/ready`, and `/metrics`.

Common required configuration: `POSTGRES_DSN`, `KAFKA_BROKERS`, `REDIS_ADDR`, `APP_ENV`, `HTTP_ADDR`, and `JWT_PUBLIC_KEY`. Production secrets have no silent defaults.

```bash
go test ./...
go vet ./...
go run ./cmd/api
go run ./cmd/worker
```

Apply `db/migrations` with Goose and regenerate `internal/persistence/postgres/sqlc` after query changes. Production traffic requires green contract, migration, health, and smoke-test gates.

## Interfaces and events

- REST: customer booking/availability/eligible-staff/GraphQL compatibility, provider booking list/calendar/daily queue/walk-in and operational transitions, and admin booking routes.
- gRPC: `GetBookingPaymentContext`, `CheckReviewEligibility`, and `ApplyPaymentState`.
- Publishes `takein.booking.events.v1`; consumes payment events transactionally with inbox deduplication and DLQ.

See [.env.example](.env.example). Catalog and provider are gRPC dependencies. Dependency failure rejects new bookings before slot mutation. PostgreSQL exclusion constraints remain authoritative; Redis is not slot truth. Provider calendar/queue reads and manual/walk-in transitions enforce owner/branch permissions. Ownership, payable amounts, lifecycle transitions, and payment-derived changes are checked server-side.
