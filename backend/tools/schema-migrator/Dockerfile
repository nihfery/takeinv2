# syntax=docker/dockerfile:1.7
ARG GO_IMAGE=golang:1.26.6-alpine3.23@sha256:5978cc992ad5ef96a7469713c8af849c1433824761ce3be2c56381403cd8d9a3
FROM ${GO_IMAGE} AS build
WORKDIR /src/tools/schema-migrator
COPY tools/schema-migrator ./
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build GOWORK=off CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w -buildid=" -o /out/schema-migrator ./cmd/schema-migrator

FROM gcr.io/distroless/static-debian13:nonroot@sha256:f7f8f729987ad0fdf6b05eeeae94b26e6a0f613bdf46feea7fc40f7bd72953e6
WORKDIR /
COPY --from=build --chown=nonroot:nonroot /out/schema-migrator /schema-migrator
COPY --chown=nonroot:nonroot services/identity-service/db/migrations /migrations/identity
COPY --chown=nonroot:nonroot services/provider-service/db/migrations /migrations/provider
COPY --chown=nonroot:nonroot services/catalog-service/db/migrations /migrations/catalog
COPY --chown=nonroot:nonroot services/booking-service/db/migrations /migrations/booking
COPY --chown=nonroot:nonroot services/payment-service/db/migrations /migrations/payment
COPY --chown=nonroot:nonroot services/billing-service/db/migrations /migrations/billing
COPY --chown=nonroot:nonroot services/customer-service/db/migrations /migrations/customer
COPY --chown=nonroot:nonroot services/notification-service/db/migrations /migrations/notification
COPY --chown=nonroot:nonroot services/media-service/db/migrations /migrations/media
COPY --chown=nonroot:nonroot services/chat-service/db/migrations /migrations/chat
COPY --chown=nonroot:nonroot services/audit-service/db/migrations /migrations/audit
USER nonroot:nonroot
ENTRYPOINT ["/schema-migrator"]
