#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
    echo "Usage: $0 <environment-file> <staging|production> <full-commit-sha>" >&2
    exit 2
fi

environment_file="$1"
expected_environment="$2"
expected_sha="$3"

[[ "${expected_environment}" == "staging" || "${expected_environment}" == "production" ]] || {
    echo "Expected environment must be staging or production." >&2
    exit 2
}
[[ "${expected_sha}" =~ ^[a-f0-9]{40}$ ]] || {
    echo "Expected service version must be a full lowercase commit SHA." >&2
    exit 2
}
[[ ! -L "${environment_file}" && -f "${environment_file}" ]] || {
    echo "The Go runtime environment file must be a regular, non-symlink file." >&2
    exit 2
}

environment_file="$(realpath -e "${environment_file}")"
repository_root="$(realpath -e "$(git rev-parse --show-toplevel)")"
if [[ "${environment_file}" == "${repository_root}" || "${environment_file}" == "${repository_root}"/* ]]; then
    echo "The Go runtime environment file must remain outside the Git worktree." >&2
    exit 2
fi

duplicates="$({ awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{print $1}' "${environment_file}" | sort | uniq -d; } || true)"
if [[ -n "${duplicates}" ]]; then
    echo "The Go runtime environment file contains duplicate keys:" >&2
    printf '%s\n' "${duplicates}" >&2
    exit 2
fi

value_of() {
    local name="$1"
    local value
    value="$(awk -F= -v key="${name}" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "${environment_file}")"
    value="${value%$'\r'}"
    if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
        value="${value:1:${#value}-2}"
    elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
        value="${value:1:${#value}-2}"
    fi
    printf '%s' "${value}"
}

reject_placeholder() {
    local name="$1"
    local value="$2"
    local lowered="${value,,}"
    if [[ -z "${value}" || "${lowered}" == *replace_* || "${lowered}" == *example.invalid* ||
          "${lowered}" == *local_only* || "${lowered}" == *changeme* || "${lowered}" == *placeholder* ]]; then
        echo "${name} is absent or still contains a placeholder." >&2
        exit 2
    fi
}

require_value() {
    local name="$1"
    local value
    value="$(value_of "${name}")"
    reject_placeholder "${name}" "${value}"
    printf '%s' "${value}"
}

app_environment="$(require_value TAKEIN_APP_ENV)"
[[ "${app_environment}" == "${expected_environment}" ]] || {
    echo "TAKEIN_APP_ENV does not match the protected deployment environment." >&2
    exit 2
}
service_version="$(require_value TAKEIN_SERVICE_VERSION)"
[[ "${service_version}" == "${expected_sha}" ]] || {
    echo "TAKEIN_SERVICE_VERSION must exactly match the requested deployment commit." >&2
    exit 2
}

declare -A database_names=()
for domain in identity customer provider catalog booking payment billing notification chat media audit; do
    upper="${domain^^}"
    name="TAKEIN_${upper}_POSTGRES_DSN"
    dsn="$(require_value "${name}")"
    lowered="${dsn,,}"
    [[ "${dsn}" =~ ^postgres(ql)?:// ]] || {
        echo "${name} must be a PostgreSQL URL." >&2
        exit 2
    }
    if [[ "${lowered}" == *localhost* || "${lowered}" == *127.0.0.1* || "${lowered}" == *takein-postgres* ]]; then
        echo "${name} points to a local development database." >&2
        exit 2
    fi
    [[ "${lowered}" == *sslmode=verify-full* || "${lowered}" == *sslmode=verify-ca* ]] || {
        echo "${name} must verify the PostgreSQL TLS certificate." >&2
        exit 2
    }
    without_query="${dsn%%\?*}"
    database_name="${without_query##*/}"
    [[ -n "${database_name}" ]] || {
        echo "${name} does not select a database." >&2
        exit 2
    }
    if [[ -n "${database_names[${database_name}]:-}" ]]; then
        echo "${name} shares database ${database_name} with another service." >&2
        exit 2
    fi
    database_names["${database_name}"]="${domain}"
done

redis_address="$(require_value TAKEIN_REDIS_ADDR)"
redis_password="$(require_value TAKEIN_REDIS_PASSWORD)"
if [[ "${redis_address,,}" == *localhost* || "${redis_address}" == *127.0.0.1* || "${redis_address,,}" == *takein-redis* ]]; then
    echo "TAKEIN_REDIS_ADDR points to a local development service." >&2
    exit 2
fi
[[ ${#redis_password} -ge 16 ]] || {
    echo "TAKEIN_REDIS_PASSWORD is unexpectedly short." >&2
    exit 2
}

kafka_brokers="$(require_value TAKEIN_KAFKA_BROKERS)"
if [[ "${kafka_brokers,,}" == *localhost* || "${kafka_brokers}" == *127.0.0.1* || "${kafka_brokers,,}" == *takein-kafka* ]]; then
    echo "TAKEIN_KAFKA_BROKERS points to a local development broker." >&2
    exit 2
fi
IFS=',' read -r -a broker_list <<< "${kafka_brokers}"
if [[ "${expected_environment}" == "production" && ${#broker_list[@]} -lt 3 ]]; then
    echo "Production requires at least three declared Kafka brokers." >&2
    exit 2
fi
kafka_protocol="$(require_value TAKEIN_KAFKA_SECURITY_PROTOCOL)"
[[ "${kafka_protocol}" == "SASL_SSL" || "${kafka_protocol}" == "SSL" ]] || {
    echo "Kafka must use an encrypted security protocol." >&2
    exit 2
}
if [[ "${kafka_protocol}" == "SASL_SSL" ]]; then
    kafka_mechanism="$(require_value TAKEIN_KAFKA_SASL_MECHANISM)"
    [[ "${kafka_mechanism}" == "PLAIN" || "${kafka_mechanism}" == "SCRAM-SHA-256" || "${kafka_mechanism}" == "SCRAM-SHA-512" ]] || {
        echo "TAKEIN_KAFKA_SASL_MECHANISM is unsupported." >&2
        exit 2
    }
    kafka_username="$(require_value TAKEIN_KAFKA_USERNAME)"
    kafka_password="$(require_value TAKEIN_KAFKA_PASSWORD)"
    [[ ${#kafka_username} -ge 3 && ${#kafka_password} -ge 16 ]] || {
        echo "Kafka credentials are unexpectedly short." >&2
        exit 2
    }
fi

internal_token="$(require_value INTERNAL_GRPC_TOKEN)"
[[ ${#internal_token} -ge 32 ]] || {
    echo "INTERNAL_GRPC_TOKEN must contain at least 32 characters." >&2
    exit 2
}
jwt_issuer="$(require_value JWT_ISSUER)"
[[ "${jwt_issuer}" =~ ^https:// ]] || {
    echo "JWT_ISSUER must use HTTPS." >&2
    exit 2
}
require_value JWT_AUDIENCE >/dev/null

runtime_secrets_source="$(require_value TAKEIN_RUNTIME_SECRETS_SOURCE)"
[[ "${runtime_secrets_source}" == /* && ! -L "${runtime_secrets_source}" && -d "${runtime_secrets_source}" ]] || {
    echo "TAKEIN_RUNTIME_SECRETS_SOURCE must be an existing absolute, non-symlink directory." >&2
    exit 2
}
runtime_secrets_source="$(realpath -e "${runtime_secrets_source}")"
if [[ "${runtime_secrets_source}" == "${repository_root}" || "${runtime_secrets_source}" == "${repository_root}"/* ]]; then
    echo "Runtime secrets must remain outside the Git worktree." >&2
    exit 2
fi

jwt_private_path="$(require_value JWT_PRIVATE_KEY_FILE)"
jwt_public_path="$(require_value JWT_PUBLIC_KEY_FILE)"
[[ "${jwt_private_path}" == "/run/takein-secrets/jwt-private.pem" ]] || {
    echo "JWT_PRIVATE_KEY_FILE must use the read-only runtime secrets mount." >&2
    exit 2
}
[[ "${jwt_public_path}" == "/run/takein-secrets/jwt-public.pem" ]] || {
    echo "JWT_PUBLIC_KEY_FILE must use the read-only runtime secrets mount." >&2
    exit 2
}
private_host_file="${runtime_secrets_source}/jwt-private.pem"
public_host_file="${runtime_secrets_source}/jwt-public.pem"
[[ ! -L "${private_host_file}" && -f "${private_host_file}" && ! -L "${public_host_file}" && -f "${public_host_file}" ]] || {
    echo "The runtime secrets directory must contain regular jwt-private.pem and jwt-public.pem files." >&2
    exit 2
}
private_mode="$(stat -c '%a' "${private_host_file}")"
private_mode_value=$((8#${private_mode}))
if (( private_mode_value & 077 )); then
    echo "jwt-private.pem must not grant permissions to group or other users." >&2
    exit 2
fi

kafka_ca_path="$(value_of TAKEIN_KAFKA_TLS_CA_FILE)"
if [[ -n "${kafka_ca_path}" ]]; then
    [[ "${kafka_ca_path}" == "/run/takein-secrets/kafka-ca.pem" && -f "${runtime_secrets_source}/kafka-ca.pem" && ! -L "${runtime_secrets_source}/kafka-ca.pem" ]] || {
        echo "The configured Kafka CA must be a regular kafka-ca.pem file in the runtime secrets mount." >&2
        exit 2
    }
fi

midtrans_base_url="$(require_value MIDTRANS_BASE_URL)"
if [[ "${expected_environment}" == "production" ]]; then
    [[ "${midtrans_base_url}" == "https://app.midtrans.com" ]] || {
        echo "Production MIDTRANS_BASE_URL is not the approved production endpoint." >&2
        exit 2
    }
else
    [[ "${midtrans_base_url}" == "https://app.sandbox.midtrans.com" ]] || {
        echo "Staging MIDTRANS_BASE_URL must use the Midtrans sandbox." >&2
        exit 2
    }
fi
midtrans_key="$(require_value MIDTRANS_SERVER_KEY)"
[[ ${#midtrans_key} -ge 16 ]] || {
    echo "MIDTRANS_SERVER_KEY is unexpectedly short." >&2
    exit 2
}

for name in S3_ENDPOINT S3_PUBLIC_BASE_URL TAKEIN_OTEL_EXPORTER_OTLP_ENDPOINT; do
    endpoint="$(require_value "${name}")"
    [[ "${endpoint}" =~ ^https:// ]] || {
        echo "${name} must use HTTPS." >&2
        exit 2
    }
done
require_value S3_REGION >/dev/null
require_value S3_BUCKET >/dev/null
require_value S3_ACCESS_KEY_ID >/dev/null
s3_secret="$(require_value S3_SECRET_ACCESS_KEY)"
[[ ${#s3_secret} -ge 16 ]] || {
    echo "S3_SECRET_ACCESS_KEY is unexpectedly short." >&2
    exit 2
}

cors_origins="$(require_value TAKEIN_CORS_ALLOWED_ORIGINS)"
IFS=',' read -r -a origin_list <<< "${cors_origins}"
for origin in "${origin_list[@]}"; do
    [[ "${origin}" =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]] || {
        echo "TAKEIN_CORS_ALLOWED_ORIGINS contains a non-HTTPS or malformed origin." >&2
        exit 2
    }
done

echo "Go ${expected_environment} runtime settings passed structural preflight. Secret values were not printed."
