# Deploy service

1. Pastikan seluruh workflow wajib sukses untuk commit exact.
2. Validasi environment dengan
   `backend/tools/ci/validate-go-runtime-env.sh`.
3. Tarik image API/worker dan schema migrator bertag `sha-<commit>`.
4. Build empat frontend dari commit yang sama.
5. Jalankan schema migrator, lalu `up --wait` untuk edge, API, worker, dan
   frontend.
6. Periksa status migration, health/readiness, log error, consumer lag, dan
   endpoint smoke publik.

Workflow staging dan production menjalankan urutan ini melalui
`backend/tools/ci/deploy-remote.sh`.
