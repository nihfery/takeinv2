# Local integration test database setup

This tool creates only the allowlisted local PostgreSQL databases used by the catalog, booking, and payment integration suites. It never drops, truncates, or recreates a database. `scripts/go/test-integration.sh` invokes it automatically when a domain-specific external test DSN is not supplied, then applies the corresponding Goose migrations.

The default connection is the loopback-only local Compose administrator. Override it with `TAKEIN_TEST_ADMIN_DSN` when the approved test PostgreSQL instance uses different credentials.
