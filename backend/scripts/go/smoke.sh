#!/bin/sh
set -eu

compose='docker compose -f docker-compose.yml'
profiles='--profile go-core --profile go-services --profile go-workers'
curl_image="${TAKEIN_SMOKE_CURL_IMAGE:-curlimages/curl:8.17.0}"

$compose $profiles ps takein-postgres takein-redis takein-kafka
for service in takein-postgres takein-redis takein-kafka; do
  container="$($compose $profiles ps -q "$service")"
  test -n "$container"
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container")"
  test "$status" = healthy
done

postgres_container="$($compose $profiles ps -q takein-postgres)"
network="$(docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$postgres_container" | awk '/takein_backend$/ {print; exit}')"
test -n "$network"

probe() {
  docker run --rm --network "$network" "$curl_image" --fail --silent --show-error --max-time 10 "$1" >/dev/null
}

for domain in identity customer provider catalog booking payment billing notification chat media audit; do
  probe "http://takein-${domain}-api:8080/health/live"
  probe "http://takein-${domain}-api:8080/health/ready"
  probe "http://takein-${domain}-api:8080/metrics"
  probe "http://takein-${domain}-worker:8081/health/live"
  probe "http://takein-${domain}-worker:8081/metrics"
done
probe 'http://takein-object-storage:8080/health'

curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:${TAKEIN_EDGE_PORT:-8088}/api/health" >/dev/null
go run ./tools/contract-check/cmd/contract-check
for port in ${TAKEIN_SMOKE_PORTS:-}; do
  curl --fail --silent --show-error "http://127.0.0.1:${port}/health/live" >/dev/null
  curl --fail --silent --show-error "http://127.0.0.1:${port}/health/ready" >/dev/null
done
printf '%s\n' 'smoke: PASS'
