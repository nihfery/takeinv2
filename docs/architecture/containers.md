# Container topology

| Kelompok | Container | Jaringan/port |
| --- | --- | --- |
| Frontend | `provider`, `customer`, `provider-console`, `admin-web` | `takein_backend`; port host hanya melalui overlay lokal |
| Edge | `takein-edge` (Traefik) | internal `8080`, lokal `127.0.0.1:8088` |
| API | `takein-<domain>-api` untuk 11 domain | private `8080` HTTP, `9090` gRPC bila digunakan |
| Worker | `takein-<domain>-worker` untuk 11 domain | private metrics/health `8081` |
| Data | `takein-postgres`, `takein-redis`, `takein-kafka` | private; port diagnosis bind ke loopback |
| Tool | `takein-schema-migrator`, JWT/object-storage init | job satu kali |
| Observability | OTel Collector, Prometheus, Loki, Grafana | port host hanya loopback |

API dan worker memakai filesystem read-only, `/tmp` berupa tmpfs, serta secret
mount read-only. Named volume data tidak dihapus saat redeploy normal.
