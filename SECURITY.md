# Security Policy

## Pelaporan

Jangan membuka issue publik untuk kerentanan. Kirim laporan privat kepada
maintainer dengan dampak, langkah reproduksi minimal, komponen/commit terdampak,
dan mitigasi sementara bila tersedia. Jangan menyertakan token, credential,
data customer, atau dump produksi.

## Model keamanan runtime

- Identity menerbitkan access token RS256 berumur pendek. Semua API memvalidasi
  signature, issuer, audience, expiry, dan role/permission.
- Refresh token disimpan sebagai cookie secure, http-only, dan same-site pada
  BFF Next.js; token tidak ditaruh di local storage.
- gRPC internal memerlukan token service dan hanya tersedia pada jaringan
  privat.
- Provider/admin endpoint menerapkan RBAC serta pemeriksaan ownership resource.
- Webhook Midtrans diverifikasi signature-nya, diproses idempotent, dan status
  authoritative dikonfirmasi ke provider pembayaran.
- Upload media dibatasi ukuran/tipe, memakai object key acak, dan akses private
  menggunakan URL bertanda tangan berumur pendek.
- Rahasia produksi berasal dari secret manager dan mount read-only. Repository
  hanya menyediakan placeholder.

## Data

Setiap domain memiliki database PostgreSQL dan credential terpisah. Service tidak
boleh membaca schema domain lain. Backup harus terenkripsi, diuji restore-nya,
dan aksesnya diaudit. Log, metric, trace, serta audit event tidak boleh memuat
password, token, cookie, signature webhook, atau URL private yang masih aktif.

## Gate minimum

Sebelum rilis jalankan test, race test untuk domain kritis, contract check,
dependency/vulnerability scan, container scan, migration preflight, dan smoke
test. Deployment produksi wajib HTTPS, CORS allowlist eksplisit, private service
network, immutable image tag, serta key rotation yang terdokumentasi.
