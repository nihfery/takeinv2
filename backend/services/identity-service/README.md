# identity-service

Authentication, users, JWT/JWKS, refresh sessions, and password changes.

Ownership: PostgreSQL database `takein_identity`; publishes `takein.identity.events.v1`. The API serves HTTP on `:8080`, metadata reserves gRPC `:9090`, and platform endpoints are `/health/live`, `/health/ready`, and `/metrics`.

Common required configuration: `POSTGRES_DSN`, `KAFKA_BROKERS`, `REDIS_ADDR`, `APP_ENV`, `HTTP_ADDR`, and `JWT_PRIVATE_KEY`, `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_KEY_ID`. Production secrets have no silent defaults.

```bash
go test ./...
go vet ./...
go run ./cmd/api
go run ./cmd/worker
```

Apply `db/migrations` with Goose and regenerate `internal/persistence/postgres/sqlc` after query changes. Production traffic requires green contract, migration, health, and smoke-test gates.

## Interfaces and events

- REST: `/api/auth/register/customer`, `/api/auth/register/provider`, role-bound login, `/api/auth/{customer|provider|admin}/me`, generic me/logout, JWKS, and provider password change. Login and refresh require the target portal role so a token cannot be issued or rotated through a different portal.
- gRPC: `ValidateAccessToken`, `GetIdentity`, `UpdateIdentityProfile`, `SetAccountStatus`, and `UpsertProviderBranchAccount`.
- Publishes `takein.identity.events.v1`; consumes provider/customer lifecycle events with inbox deduplication and DLQ.

See [.env.example](.env.example). PostgreSQL failure makes the API unready; Redis-backed sensitive-route rate limits fail closed. Customer, provider, and admin account scopes are constrained at the database layer. Provider branch accounts receive branch/role/effective-permission claims and are disabled when their provider role is deactivated. Passwords, JWTs, refresh tokens, and key material must never be logged. Legacy bcrypt credentials are upgraded to Argon2id after successful authentication.
