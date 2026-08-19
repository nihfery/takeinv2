# provider-service

Provider organization, branches, staff, roles, documents, onboarding.

Ownership: PostgreSQL database `takein_provider`; publishes `takein.provider.events.v1`. The API serves HTTP on `:8080`, metadata reserves gRPC `:9090`, and platform endpoints are `/health/live`, `/health/ready`, and `/metrics`.

Common required configuration: `POSTGRES_DSN`, `KAFKA_BROKERS`, `REDIS_ADDR`, `APP_ENV`, `HTTP_ADDR`, and `JWT_PUBLIC_KEY`. Production secrets have no silent defaults.

```bash
go test ./...
go vet ./...
go run ./cmd/api
go run ./cmd/worker
```

Apply `db/migrations` with Goose and regenerate `internal/persistence/postgres/sqlc` after query changes. Production traffic requires green contract, migration, health, and smoke-test gates.

## Interfaces and events

- REST: provider profile/documents, scoped branch profile, branch/staff/skill/schedule routes, branch-account role/permission lifecycle, and admin provider lifecycle routes.
- gRPC: `GetProviderReadiness`, `ValidateBranchScope`, and `ResolveEligibleStaff`.
- Publishes provider/readiness/role changes to `takein.provider.events.v1`; consumes identity lifecycle events with inbox deduplication and DLQ.

See [.env.example](.env.example). Identity, billing, and media are gRPC dependencies. Entitlement/dependency failure rejects protected mutations. Branch creation requires an authorized multipart image; provider, branch, permission, role-account, and private-document checks are enforced server-side. Only provider owners can manage roles/accounts, and branch accounts are restricted to their assigned branch and explicit menu permissions.
