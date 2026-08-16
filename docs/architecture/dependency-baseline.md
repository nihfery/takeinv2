# Go dependency and image baseline

Locked runtime/toolchain: Go 1.26.6. The workspace `go.mod`/`go.sum` files are authoritative for module resolution. Core direct versions include Gin 1.12.0, pgx 5.10.0, franz-go 1.21.6, go-redis 9.21.0, JWT 5.3.1, OpenTelemetry 1.44.0, and protobuf 1.36.x.

Generation tools: Buf 1.72.0, sqlc 1.31.1, Goose 3.27.3, protoc-gen-go 1.36.10, and protoc-gen-go-grpc 1.6.2. Local quality/security verification uses golangci-lint 2.12.2 and govulncheck 1.7.0.

The 2026-08-16 vulnerability gate upgraded `golang.org/x/text` to 0.39.0, `github.com/quic-go/quic-go` to 0.59.1, and `filippo.io/edwards25519` to 1.1.1. Govulncheck reports no reachable symbol vulnerabilities. It still reports GO-2026-5932 at module level because `golang.org/x/crypto` contains the deprecated `openpgp` package; TAKEIN does not import or call that package and upstream provides no fixed version, so this is recorded as an unreachable upstream-only exception.

Container builds pin `golang:1.26.6-alpine3.23` to manifest digest `sha256:5978cc992ad5ef96a7469713c8af849c1433824761ce3be2c56381403cd8d9a3` and distroless static Debian 13 nonroot to `sha256:f7f8f729987ad0fdf6b05eeeae94b26e6a0f613bdf46feea7fc40f7bd72953e6`. Local infrastructure pins PostgreSQL 18.6, Kafka 4.3.1, and Redis 8.2.2.
