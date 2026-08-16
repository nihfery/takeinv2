# catalog-service

Categories, provider services, coupons, and public readiness projections.

Ownership: PostgreSQL database `takein_catalog`; publishes `takein.catalog.events.v1`. The API serves HTTP on `:8080`, metadata reserves gRPC `:9090`, and platform endpoints are `/health/live`, `/health/ready`, and `/metrics`.

Common required configuration: `POSTGRES_DSN`, `KAFKA_BROKERS`, `REDIS_ADDR`, `APP_ENV`, `HTTP_ADDR`, and `JWT_PUBLIC_KEY`. Production secrets have no silent defaults.

```bash
go test ./...
go vet ./...
go run ./cmd/api
go run ./cmd/worker
```

Apply `db/migrations` with Goose and regenerate `internal/persistence/postgres/sqlc` after query changes. Production traffic requires green contract, migration, health, and smoke-test gates.

## Interfaces and events

- REST: public catalog/coupons, provider service management, and admin category/service/coupon routes.
- gRPC: `GetServicesSnapshot`, `GetBranchBookingPage`, `ValidateCoupon`, and `ReleaseCoupon`.
- Publishes `takein.catalog.events.v1`; consumes provider/customer events with inbox deduplication and DLQ.

See [.env.example](.env.example). Provider and media are gRPC dependencies. Projection lag can delay public readiness; pricing fails closed for invalid services/coupons. Coupon quota is locked atomically, repeated service IDs are preserved, monetary math uses minor units, and provider/media ownership is mandatory.
