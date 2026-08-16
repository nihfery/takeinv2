#!/usr/bin/env bash
set -euo pipefail

sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
temp_root="$(mktemp -d "${TMPDIR:-/tmp}/takein-go-env.XXXXXXXX")"
secrets_dir="${temp_root}/secrets"
environment_file="${temp_root}/runtime.env"

cleanup() {
    if [[ -n "${temp_root:-}" && -d "${temp_root}" && "${temp_root}" == "${TMPDIR:-/tmp}/takein-go-env."* ]]; then
        rm -f -- "${secrets_dir}/jwt-private.pem" "${secrets_dir}/jwt-public.pem" "${environment_file}"
        rmdir -- "${secrets_dir}" "${temp_root}"
    fi
}
trap cleanup EXIT

mkdir -m 700 "${secrets_dir}"
printf '%s\n' 'test-private-key-material' > "${secrets_dir}/jwt-private.pem"
printf '%s\n' 'test-public-key-material' > "${secrets_dir}/jwt-public.pem"
chmod 600 "${secrets_dir}/jwt-private.pem"
chmod 644 "${secrets_dir}/jwt-public.pem"

cat > "${environment_file}" <<EOF
TAKEIN_APP_ENV=staging
TAKEIN_SERVICE_VERSION=${sha}
TAKEIN_IDENTITY_POSTGRES_DSN=postgres://identity:secret@db.internal:5432/takein_identity?sslmode=verify-full
TAKEIN_CUSTOMER_POSTGRES_DSN=postgres://customer:secret@db.internal:5432/takein_customer?sslmode=verify-full
TAKEIN_PROVIDER_POSTGRES_DSN=postgres://provider:secret@db.internal:5432/takein_provider?sslmode=verify-full
TAKEIN_CATALOG_POSTGRES_DSN=postgres://catalog:secret@db.internal:5432/takein_catalog?sslmode=verify-full
TAKEIN_BOOKING_POSTGRES_DSN=postgres://booking:secret@db.internal:5432/takein_booking?sslmode=verify-full
TAKEIN_PAYMENT_POSTGRES_DSN=postgres://payment:secret@db.internal:5432/takein_payment?sslmode=verify-full
TAKEIN_BILLING_POSTGRES_DSN=postgres://billing:secret@db.internal:5432/takein_billing?sslmode=verify-full
TAKEIN_NOTIFICATION_POSTGRES_DSN=postgres://notification:secret@db.internal:5432/takein_notification?sslmode=verify-full
TAKEIN_CHAT_POSTGRES_DSN=postgres://chat:secret@db.internal:5432/takein_chat?sslmode=verify-full
TAKEIN_MEDIA_POSTGRES_DSN=postgres://media:secret@db.internal:5432/takein_media?sslmode=verify-full
TAKEIN_AUDIT_POSTGRES_DSN=postgres://audit:secret@db.internal:5432/takein_audit?sslmode=verify-full
TAKEIN_REDIS_ADDR=redis.internal:6379
TAKEIN_REDIS_PASSWORD=staging-redis-secret
TAKEIN_KAFKA_BROKERS=kafka.internal:9093
TAKEIN_KAFKA_SECURITY_PROTOCOL=SASL_SSL
TAKEIN_KAFKA_SASL_MECHANISM=SCRAM-SHA-512
TAKEIN_KAFKA_USERNAME=takein
TAKEIN_KAFKA_PASSWORD=staging-kafka-secret
TAKEIN_KAFKA_TLS_CA_FILE=
INTERNAL_GRPC_TOKEN=testtesttesttesttesttesttesttest
JWT_ISSUER=https://identity.staging.internal
JWT_AUDIENCE=takein-api
TAKEIN_RUNTIME_SECRETS_SOURCE=${secrets_dir}
JWT_PRIVATE_KEY_FILE=/run/takein-secrets/jwt-private.pem
JWT_PUBLIC_KEY_FILE=/run/takein-secrets/jwt-public.pem
MIDTRANS_BASE_URL=https://app.sandbox.midtrans.com
MIDTRANS_SERVER_KEY=SB-Mid-server-staging-secret
S3_ENDPOINT=https://r2.internal
S3_PUBLIC_BASE_URL=https://assets.staging.internal
S3_REGION=auto
S3_BUCKET=takein-staging
S3_ACCESS_KEY_ID=staging-access-key
S3_SECRET_ACCESS_KEY=staging-object-secret
TAKEIN_OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.staging.internal
TAKEIN_CORS_ALLOWED_ORIGINS=https://staging.internal,https://partners.staging.internal
EOF

bash tools/ci/validate-go-runtime-env.sh "${environment_file}" staging "${sha}"

sed -i 's|/takein_provider?|/takein_identity?|' "${environment_file}"
if bash tools/ci/validate-go-runtime-env.sh "${environment_file}" staging "${sha}" >"${temp_root}/negative.out" 2>&1; then
    echo "The preflight accepted two services sharing one database." >&2
    exit 1
fi
if grep -q 'staging-object-secret\|staging-kafka-secret\|staging-redis-secret' "${temp_root}/negative.out"; then
    echo "The preflight leaked a secret in its error output." >&2
    exit 1
fi
rm -f -- "${temp_root}/negative.out"

echo "Go runtime environment preflight tests: PASS"
