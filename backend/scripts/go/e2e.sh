#!/bin/sh
set -eu

compose='docker compose -f docker-compose.yml'
export COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-2}"
export TAKEIN_RATE_LIMIT_REGISTER="${TAKEIN_RATE_LIMIT_REGISTER:-1000}"
export TAKEIN_RATE_LIMIT_LOGIN="${TAKEIN_RATE_LIMIT_LOGIN:-1000}"
export OTEL_SDK_DISABLED="${OTEL_SDK_DISABLED:-true}"

runtime_services='takein-object-storage takein-midtrans-mock takein-edge
takein-identity-api takein-customer-api takein-provider-api takein-catalog-api takein-booking-api takein-payment-api takein-billing-api takein-notification-api takein-chat-api takein-media-api takein-audit-api
takein-identity-worker takein-customer-worker takein-provider-worker takein-catalog-worker takein-booking-worker takein-payment-worker takein-billing-worker takein-notification-worker takein-chat-worker takein-media-worker takein-audit-worker'

$compose --profile go-core up -d --wait takein-postgres takein-redis takein-kafka
sh scripts/go/migrate.sh
go run ./tools/kafka-admin/cmd/kafka-admin --brokers "127.0.0.1:${TAKEIN_KAFKA_PORT:-29092}"
if [ "${E2E_SKIP_BUILD:-false}" != "true" ]; then
  sh scripts/go/build-runtime.sh
fi
$compose --profile go-core --profile go-services --profile go-workers up -d --no-build $runtime_services
# Docker Desktop can miss file-provider notifications for Windows bind mounts.
# Recreate only the stateless edge so every E2E run uses the current routes.
$compose --profile go-core --profile go-services up -d --no-build --force-recreate takein-edge

edge="${E2E_BASE_URL:-http://127.0.0.1:${TAKEIN_EDGE_PORT:-8088}}"
attempt=0
until curl --fail --silent --show-error "$edge/api/health" >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 120 ]; then
    printf '%s\n' 'E2E edge did not become ready within 120 seconds.' >&2
    exit 1
  fi
  sleep 1
done

export E2E_ALLOW_FIXTURES=true
(cd tests/e2e && GOWORK=off go run ./cmd/e2e)
