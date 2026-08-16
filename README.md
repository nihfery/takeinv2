# TakeIn

Monorepo reservasi salon berbasis Go microservices, PostgreSQL per service,
Kafka, Redis, dan empat aplikasi Next.js.

## Struktur

| Lokasi | Fungsi |
| --- | --- |
| `backend/services/*-service` | 11 domain service Go: identity, customer, provider, catalog, booking, payment, billing, notification, chat, media, audit |
| `backend/libs/go` | library bersama untuk auth, HTTP/gRPC, observability, event, dan persistence |
| `backend/gen/go` | kode Protobuf/gRPC hasil generate |
| `backend/contracts` | OpenAPI, Protobuf, event schema, dan ownership registry |
| `backend/infra` | PostgreSQL bootstrap, Traefik, observability, dan secret lokal |
| `backend/tools` | schema migrator, contract checker, Kafka admin, dan tooling CI backend |
| `apps/customer-web` | aplikasi customer Next.js, port lokal `5174` |
| `apps/provider-landing` | landing/registrasi provider Next.js, port lokal `5173` |
| `apps/provider-console` | dashboard provider Next.js, port lokal `5175` |
| `apps/admin-web` | dashboard admin Next.js, port lokal `5176` |

## Menjalankan lokal

Prasyarat: Docker Desktop, Go `1.26.6`, Node.js `22`, npm, dan GNU Make
(atau jalankan perintah Compose/script secara langsung dari Git Bash/WSL).

```bash
cp .env.example .env
make -C backend bootstrap
make -C backend up-local
```

Alur `make up-local`:

1. menjalankan PostgreSQL, Redis, dan Kafka;
2. menjalankan seluruh migrasi PostgreSQL dan membuat topic Kafka;
3. membangun lalu menjalankan 11 API, 11 worker, dan Traefik edge;
4. membuka port API/gRPC/metrics khusus lokal.

Jalankan frontend melalui Compose:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.local.yml \
  --profile go-core --profile go-services --profile go-workers \
  up -d --build provider customer provider-console admin-web
```

Endpoint utama:

- Go edge: `http://127.0.0.1:8088`
- customer: `http://127.0.0.1:5174`
- provider landing: `http://127.0.0.1:5173`
- provider console: `http://127.0.0.1:5175/provider/login`
- admin: `http://127.0.0.1:5176/admin/login`
- PostgreSQL untuk DBeaver: `127.0.0.1:15432`

## Pemeriksaan

```bash
make -C backend generate
make -C backend contract
make -C backend vet
make -C backend test
make -C backend build
docker compose -f backend/docker-compose.yml config --quiet
docker compose -f docker-compose.yml config --quiet
```

Build frontend per aplikasi:

```bash
npm --prefix apps/customer-web ci && npm --prefix apps/customer-web run build
npm --prefix apps/provider-landing ci && npm --prefix apps/provider-landing run build
npm --prefix apps/provider-console ci && npm --prefix apps/provider-console run build
npm --prefix apps/admin-web ci && npm --prefix apps/admin-web run build
```

## Data dan keamanan

- Setiap service memiliki database PostgreSQL dan credential sendiri.
- Browser berkomunikasi melalui BFF Next.js dan Traefik; port internal service
  tidak dipublikasikan pada deployment produksi.
- Token akses ditandatangani RS256. Private key dan credential produksi harus
  berasal dari secret manager, bukan dari repository.
- Jangan menjalankan `docker compose down -v` kecuali reset seluruh data memang
  disengaja.

Dokumentasi arsitektur ada di `ARCHITECTURE.md`, ownership tabel di
`docs/database/table-ownership.md`, dan deployment di
`docs/dokploy-deployment.md`.
