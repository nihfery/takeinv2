# Contributing

## Aturan umum

- Pertahankan ownership domain: satu service tidak boleh membaca database
  service lain.
- Perubahan API harus memperbarui OpenAPI, route registry, dan test kontrak.
- Perubahan event harus backward-compatible atau memakai versi schema baru.
- Jangan commit `.env`, private key, credential, dump database, atau artefak
  build.
- Jangan mengubah file generated di `backend/gen/go` secara manual; ubah Protobuf lalu
  jalankan generator.

## Backend Go

```bash
make -C backend bootstrap
make -C backend generate
make -C backend contract
make -C backend vet
make -C backend test
make -C backend build
```

Untuk perubahan concurrency-sensitive, jalankan juga:

```bash
make -C backend test-race
make -C backend test-integration
```

Migration database harus additive terlebih dahulu, idempotent pada deployment,
dan kompatibel dengan versi aplikasi yang sedang rolling. Jalankan:

```bash
make -C backend migrate-status
make -C backend migrate
```

## Frontend Next.js

Di aplikasi yang diubah:

```bash
npm ci
npm run lint
npm run build
```

Frontend harus memakai BFF `/api/*`; jangan menanam alamat service internal atau
credential ke bundle browser. Pertahankan tampilan dan perilaku responsif ketika
melakukan perubahan integrasi.

## Pull request

PR harus menjelaskan domain yang berubah, kontrak/schema yang terdampak, cara
rollback yang aman, dan hasil verifikasi. Perubahan lintas domain wajib
menyebutkan alur gRPC/event dan strategi idempotency-nya.

Laporkan masalah keamanan melalui jalur privat pada `SECURITY.md`, bukan issue
publik.
