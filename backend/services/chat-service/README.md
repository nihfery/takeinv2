# chat-service

Scoped threads/messages, support ticket state, and authenticated SSE stream.

Ownership: PostgreSQL database `takein_chat`; publishes `takein.chat.events.v1`. The API serves HTTP on `:8080`, metadata reserves gRPC `:9090`, and platform endpoints are `/health/live`, `/health/ready`, and `/metrics`.

Common required configuration: `POSTGRES_DSN`, `KAFKA_BROKERS`, `REDIS_ADDR`, `APP_ENV`, `HTTP_ADDR`, and `JWT_PUBLIC_KEY`. Production secrets have no silent defaults.

```bash
go test ./...
go vet ./...
go run ./cmd/api
go run ./cmd/worker
```

Apply `db/migrations` with Goose and regenerate `internal/persistence/postgres/sqlc` after query changes. Production traffic requires green contract, migration, health, and smoke-test gates.

## Interfaces and events

- REST/SSE: thread list/detail, messages, ticket transitions, and event stream under `/api/chat/threads`.
- WebSocket: authenticated `/api/chat/threads/{thread}/realtime`; no gRPC API at launch.
- Publishes `takein.chat.events.v1`.

See [.env.example](.env.example). PostgreSQL, Kafka, Redis, and JWT verification are dependencies. Realtime disconnect does not lose persisted messages; clients reconnect and reload history. Origins are allow-listed, and thread/provider/ticket authorization is server-side.
