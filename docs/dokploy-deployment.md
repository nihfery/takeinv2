# Deployment Dokploy

## Konfigurasi

1. Hubungkan repository dan pilih commit/branch yang dilindungi.
2. Gunakan `docker-compose.yml`; file ini menyertakan
   `backend/docker-compose.yml` secara eksplisit.
3. Simpan environment produksi di luar worktree, mengikuti
   `platform/deploy/dokploy.env.example`.
4. Mount direktori secret read-only yang berisi `jwt-private.pem`,
   `jwt-public.pem`, dan CA Kafka bila digunakan.
5. Publikasikan hanya origin customer, partner, provider console, admin, API,
   webhook, dan WebSocket melalui HTTPS. Database, Redis, Kafka, gRPC, worker,
   metrics, dan object credential tetap private.

## Rilis

Workflow deployment memverifikasi CI commit exact, environment dan secret
structure, lalu menjalankan `backend/tools/ci/deploy-remote.sh`. Script menarik image
immutable 11 API/worker dan schema migrator, membangun empat frontend, menjalankan
migration, mengangkat runtime dengan health wait, dan mengecek status schema.

Sesudah deploy periksa:

```bash
docker compose --env-file <approved-env-file> \
  -f docker-compose.yml ps

docker compose --env-file <approved-env-file> \
  -f docker-compose.yml \
  --profile go-core --profile go-migrate run --rm --no-deps \
  takein-schema-migrator status
```

Lakukan smoke test pada endpoint readiness publik, login tiap aktor, booking
dummy, webhook sandbox, Kafka consumer lag, dan log error. Jangan menjalankan
`down -v` pada proyek dengan data yang harus dipertahankan.

## Rollback

Deploy image commit sebelumnya hanya jika schema backward-compatible. Untuk
perubahan data atau schema yang tidak kompatibel, hentikan write, lakukan
reconciliation/forward-fix, dan ikuti runbook backup/restore PostgreSQL.
