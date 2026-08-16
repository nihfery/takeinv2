#!/bin/sh
set -eu

create_database() {
  database="$1"
  username="$2"
  password="$3"

  psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    --set=database="$database" --set=username="$username" --set=password="$password" <<-'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'username', :'password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'username') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'username')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'database') \gexec
SQL
}

create_database takein_identity "$TAKEIN_IDENTITY_DB_USER" "$TAKEIN_IDENTITY_DB_PASSWORD"
create_database takein_customer "$TAKEIN_CUSTOMER_DB_USER" "$TAKEIN_CUSTOMER_DB_PASSWORD"
create_database takein_provider "$TAKEIN_PROVIDER_DB_USER" "$TAKEIN_PROVIDER_DB_PASSWORD"
create_database takein_catalog "$TAKEIN_CATALOG_DB_USER" "$TAKEIN_CATALOG_DB_PASSWORD"
create_database takein_booking "$TAKEIN_BOOKING_DB_USER" "$TAKEIN_BOOKING_DB_PASSWORD"
create_database takein_payment "$TAKEIN_PAYMENT_DB_USER" "$TAKEIN_PAYMENT_DB_PASSWORD"
create_database takein_billing "$TAKEIN_BILLING_DB_USER" "$TAKEIN_BILLING_DB_PASSWORD"
create_database takein_notification "$TAKEIN_NOTIFICATION_DB_USER" "$TAKEIN_NOTIFICATION_DB_PASSWORD"
create_database takein_chat "$TAKEIN_CHAT_DB_USER" "$TAKEIN_CHAT_DB_PASSWORD"
create_database takein_media "$TAKEIN_MEDIA_DB_USER" "$TAKEIN_MEDIA_DB_PASSWORD"
create_database takein_audit "$TAKEIN_AUDIT_DB_USER" "$TAKEIN_AUDIT_DB_PASSWORD"

