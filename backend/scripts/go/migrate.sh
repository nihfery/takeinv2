#!/bin/sh
set -eu

mode="${1:-up}"
port="${TAKEIN_POSTGRES_PORT:-15432}"
for domain in identity customer provider catalog booking payment billing notification chat media audit; do
  upper=$(printf '%s' "$domain" | tr '[:lower:]' '[:upper:]')
  dsn_name="TAKEIN_${upper}_POSTGRES_DSN"
  dsn=$(printenv "$dsn_name" 2>/dev/null || true)
  if [ -z "$dsn" ]; then
    user_name="TAKEIN_${upper}_DB_USER"
    password_name="TAKEIN_${upper}_DB_PASSWORD"
    user=$(printenv "$user_name" 2>/dev/null || true)
    password=$(printenv "$password_name" 2>/dev/null || true)
    user=${user:-takein_${domain}}
    password=${password:-${domain}_local_only}
    dsn="postgres://${user}:${password}@127.0.0.1:${port}/takein_${domain}?sslmode=disable"
  fi
  if [ "$mode" = status ]; then
    goose -dir "services/${domain}-service/db/migrations" postgres "$dsn" status
  else
    goose -dir "services/${domain}-service/db/migrations" postgres "$dsn" up
  fi
done
