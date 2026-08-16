# media-service

Owned media metadata and Cloudflare R2/S3 SigV4 presigned access.

Ownership: PostgreSQL database `takein_media`; publishes `takein.media.events.v1`. The API serves HTTP on `:8080`, metadata reserves gRPC `:9090`, and platform endpoints are `/health/live`, `/health/ready`, and `/metrics`.

Common required configuration: `POSTGRES_DSN`, `KAFKA_BROKERS`, `REDIS_ADDR`, `APP_ENV`, `HTTP_ADDR`, and `JWT_PUBLIC_KEY`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Production secrets have no silent defaults.

```bash
go test ./...
go vet ./...
go run ./cmd/api
go run ./cmd/worker
```

Apply `db/migrations` with Goose and regenerate `internal/persistence/postgres/sqlc` after query changes. Production traffic requires green contract, migration, health, and smoke-test gates.

## Interfaces and events

- REST: presign upload, complete, signed download, and delete under `/api/media`.
- gRPC: `AuthorizeObject` and bounded `StoreObject`.
- Publishes `takein.media.events.v1`.

See [.env.example](.env.example). PostgreSQL, Kafka, and S3/R2 are dependencies; local Compose uses the owned S3 mock. Completion HEAD-verifies object existence/size, keys are generated and validated, and private download/delete/reference operations require owner authorization. Storage failure never marks an absent object ready.
