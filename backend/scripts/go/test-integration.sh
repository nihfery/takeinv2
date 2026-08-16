#!/bin/sh
set -eu

port="${TAKEIN_POSTGRES_PORT:-15432}"
catalog_url="${CATALOG_TEST_DATABASE_URL:-postgres://takein_catalog:catalog_local_only@127.0.0.1:${port}/takein_catalog_test?sslmode=disable}"
booking_url="${BOOKING_TEST_DATABASE_URL:-postgres://takein_booking:booking_local_only@127.0.0.1:${port}/takein_booking_test?sslmode=disable}"
payment_url="${PAYMENT_TEST_DATABASE_URL:-postgres://takein_payment:payment_local_only@127.0.0.1:${port}/takein_payment_test?sslmode=disable}"
provider_url="${PROVIDER_TEST_DATABASE_URL:-postgres://takein_provider:provider_local_only@127.0.0.1:${port}/takein_provider_test?sslmode=disable}"

set --
[ -n "${CATALOG_TEST_DATABASE_URL:-}" ] || set -- "$@" takein_catalog_test
[ -n "${BOOKING_TEST_DATABASE_URL:-}" ] || set -- "$@" takein_booking_test
[ -n "${PAYMENT_TEST_DATABASE_URL:-}" ] || set -- "$@" takein_payment_test
[ -n "${PROVIDER_TEST_DATABASE_URL:-}" ] || set -- "$@" takein_provider_test
if [ "$#" -gt 0 ]; then
  go run ./tools/testdb/cmd/testdb "$@"
fi

goose -dir services/catalog-service/db/migrations postgres "$catalog_url" up
goose -dir services/booking-service/db/migrations postgres "$booking_url" up
goose -dir services/payment-service/db/migrations postgres "$payment_url" up
goose -dir services/provider-service/db/migrations postgres "$provider_url" up

export TEST_OUTBOX_DATABASE_URL="$booking_url"
(cd libs/go && go test -count=3 ./outbox)
export TEST_DATABASE_URL="$catalog_url"
(cd services/catalog-service && go test -count=3 ./internal/persistence/postgres)
export TEST_DATABASE_URL="$booking_url"
(cd services/booking-service && go test -count=3 ./internal/persistence/postgres)
export TEST_DATABASE_URL="$payment_url"
(cd services/payment-service && go test -count=3 ./internal/payment ./internal/persistence/postgres ./internal/consumer)
export TEST_DATABASE_URL="$provider_url"
(cd services/provider-service && go test -count=3 ./internal/persistence/postgres)
