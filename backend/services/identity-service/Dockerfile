# syntax=docker/dockerfile:1.7
ARG GO_IMAGE=golang:1.26.6-alpine3.23@sha256:5978cc992ad5ef96a7469713c8af849c1433824761ce3be2c56381403cd8d9a3
FROM ${GO_IMAGE} AS build
ARG SERVICE=identity-service
ARG BINARY=api
WORKDIR /src
COPY go.work go.work.sum ./
COPY gen ./gen
COPY libs ./libs
COPY services ./services
COPY tools ./tools
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w -buildid=" -o /out/service "./services/${SERVICE}/cmd/${BINARY}"

FROM gcr.io/distroless/static-debian13:nonroot@sha256:f7f8f729987ad0fdf6b05eeeae94b26e6a0f613bdf46feea7fc40f7bd72953e6
WORKDIR /
COPY --from=build --chown=nonroot:nonroot /out/service /service
USER nonroot:nonroot
EXPOSE 8080 8081 9090
ENTRYPOINT ["/service"]
