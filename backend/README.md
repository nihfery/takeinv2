# TakeIn Go backend

Folder ini adalah root mandiri seluruh backend Go TakeIn. Semua path pada
`go.work`, `Makefile`, Dockerfile, script, dan Compose backend dihitung relatif
terhadap folder ini.

## Isi

- `services`: 11 microservice domain dan worker-nya.
- `libs/go`: library bersama backend.
- `gen/go`: hasil generate Protobuf/gRPC.
- `contracts`: OpenAPI, Protobuf, event schema, serta registry ownership/route.
- `infra`: bootstrap PostgreSQL, route Traefik, observability, dan secret lokal.
- `tools`, `scripts`, `tests`: migrator, pemeriksa kontrak, otomasi, dan E2E.

## Menjalankan

Dari root repository:

```bash
make -C backend bootstrap
make -C backend up-local
```

Atau dari folder ini:

```bash
make bootstrap
make up-local
```

`docker-compose.yml` di folder ini menjalankan backend secara mandiri dengan
project Compose `salonku`, sama dengan komposisi full-stack di root.
`docker-compose.local.yml` membuka port diagnosis
API, gRPC, dan metrics hanya pada loopback.

Pemeriksaan utama:

```bash
make generate
make contract
make vet
make test
make build
docker compose config --quiet
```
