# Deployment architecture

Deployment penuh memakai `docker-compose.yml` di root, yang menyertakan
`backend/docker-compose.yml`. Backend juga dapat dijalankan mandiri dari folder
`backend`. Image API, worker, dan schema migrator diberi tag immutable
`sha-<commit>`. Empat frontend Next.js dibangun dari commit yang sama.

Urutan rilis: validasi environment, tarik image, build frontend, jalankan schema
migrator, naikkan API/worker/edge/frontend dengan health wait, periksa status
migration, lalu smoke test endpoint publik. Rollback menggunakan image commit
sebelumnya selama schema masih backward-compatible; perubahan schema tidak
dibalik secara destruktif.

Semua endpoint service internal dan database tetap private. Hanya ingress HTTPS
untuk customer, partner, provider console, admin, API, dan webhook yang boleh
dipublikasikan.
