#!/bin/sh
set -eu

compose='docker compose -f docker-compose.yml'
profiles='--profile go-core --profile go-services --profile go-workers --profile go-migrate'

# Build one target at a time. Docker Desktop's BuildKit can otherwise fan out
# every service from the Go/Next Compose model and exhaust the API.
for service in takein-object-storage takein-midtrans-mock; do
  $compose $profiles build "$service"
done
$compose $profiles build takein-schema-migrator
for domain in identity customer provider catalog booking payment billing notification chat media audit; do
  $compose $profiles build "takein-${domain}-api"
  $compose $profiles build "takein-${domain}-worker"
done
