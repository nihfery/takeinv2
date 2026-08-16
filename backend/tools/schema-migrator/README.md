# TAKEIN schema migrator

This deployment-only image embeds the additive Goose migrations for all eleven
owned PostgreSQL databases. It runs as `nonroot`, requires an explicit
`TAKEIN_<DOMAIN>_POSTGRES_DSN` for every selected domain, never prints DSNs, and
supports only `up` and read-only `status`; destructive `down` is deliberately
absent.

Local verification against the running target databases:

```bash
docker compose -f backend/docker-compose.yml \
  --profile go-core --profile go-migrate \
  run --rm --no-deps takein-schema-migrator status
```

Select domains by appending their names. The tool always restores the approved
migration order, independent of argument order:

```bash
takein-schema-migrator up identity provider catalog
```

Staging and production use the protected workflow described in
`docs/runbooks/deploy-service.md`. Do not run this image against unapproved data
or bypass backup, restore-drill, and change-window gates.
