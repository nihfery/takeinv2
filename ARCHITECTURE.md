# Arsitektur TakeIn

TakeIn menggunakan empat frontend Next.js, satu edge Traefik, dan 11 domain
service Go. Setiap service menyimpan data pada database PostgreSQL miliknya dan
bertukar event melalui Kafka. Redis dipakai untuk cache, rate limit, dan state
runtime yang tidak menjadi sumber kebenaran bisnis.

```text
Browser
  |-- customer-web ---------|
  |-- provider-landing -----|--> Next.js BFF --> Traefik edge --> Go API
  |-- provider-console -----|                         |
  `-- admin-web ------------|                         +--> PostgreSQL per service
                                                      +--> Redis
                                                      `--> Kafka --> Go workers
```

## Batas domain

| Service | Ownership utama |
| --- | --- |
| identity | akun, credential, token, role global |
| customer | profil, aktivitas, favorit, ulasan customer |
| provider | profil provider, cabang, staf, permission provider |
| catalog | kategori, layanan, katalog publik, kupon katalog |
| booking | cart/checkout booking, slot, booking, participant |
| payment | transaksi dan webhook pembayaran booking |
| billing | paket dan subscription provider |
| notification | notifikasi aplikasi dan delivery async |
| chat | thread, message, unread state, WebSocket |
| media | metadata object dan akses upload/download |
| audit | immutable audit event |

Service tidak membaca tabel milik service lain. Kebutuhan sinkron menggunakan
gRPC internal dengan token antar-service; propagasi state dan side effect
menggunakan event Kafka yang versioned.

## Jalur HTTP dan autentikasi

- Frontend memanggil route `/api/*` pada origin Next.js masing-masing.
- Route handler Next.js meneruskan permintaan ke `takein-edge` atau langsung ke
  identity service untuk refresh internal.
- Traefik menentukan pemilik route berdasarkan prefix/path kontrak.
- Identity menerbitkan access token RS256; API memverifikasi issuer, audience,
  signature, expiry, dan claim role.
- Refresh token hanya berada dalam cookie secure/http-only milik BFF.

## Data dan konsistensi

- PostgreSQL transaction dan constraint menjaga invariant lokal domain.
- Idempotency key diwajibkan pada operasi booking/payment yang dapat diulang.
- Outbox/inbox dan consumer idempotent menjaga pengiriman event at-least-once.
- Saga dipakai untuk workflow lintas booking, payment, notification, dan audit.
- Object media disimpan pada penyimpanan S3-compatible; database menyimpan
  metadata dan policy akses.

## Runtime

`backend/docker-compose.yml` mendefinisikan dependency dasar, edge, schema
migrator, 11 API, serta 11 worker. `backend/docker-compose.local.yml` hanya
membuka port diagnosis backend lokal. `docker-compose.yml` di root menyertakan
komposisi backend tersebut dan menambahkan empat frontend; overlay
`docker-compose.local.yml` membuka port frontend lokal.

Observability menggunakan OpenTelemetry Collector, Prometheus, Loki, dan
Grafana. Setiap request membawa request ID/correlation ID dan setiap service
menyediakan liveness, readiness, serta metrics endpoint.
