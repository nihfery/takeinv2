#!/bin/sh
set -eu

service="${1:-}"
component="${2:-api}"

case "$service" in
  identity-service|customer-service|provider-service|catalog-service|booking-service|payment-service|billing-service|notification-service|chat-service|media-service|audit-service) ;;
  *) echo "usage: $0 <service-name> [api|worker]" >&2; exit 2 ;;
esac
case "$component" in
  api|worker) ;;
  *) echo "component must be api or worker" >&2; exit 2 ;;
esac

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../.." && pwd)"
service_dir="$repo_root/services/$service"
env_file="$service_dir/.env"

if [ ! -f "$env_file" ]; then
  echo "missing $env_file; copy .env.example to .env first" >&2
  exit 2
fi

set -a
# Local service env files contain literal development values only.
# shellcheck disable=SC1090
. "$env_file"
set +a

if [ "$component" = worker ]; then
  SERVICE_NAME="${service}-worker"
else
  SERVICE_NAME="$service"
fi
export SERVICE_NAME

cd "$service_dir"
exec go run "./cmd/$component"
