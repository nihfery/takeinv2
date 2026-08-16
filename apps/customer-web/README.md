# YouYaku Customer Web

Next.js marketplace customer di port `5174`. Browser hanya memanggil `/api/*` pada origin Next; route BFF menyimpan access/refresh JWT Go dalam cookie HttpOnly, meneruskan request ke Traefik edge, dan melakukan refresh token server-side.

## Menjalankan lokal

Jalankan stack Go dari root (atau gunakan container yang sudah aktif), lalu frontend:

```bash
cd apps/customer-web
npm ci
npm run dev
```

Buka `http://127.0.0.1:5174`.

Salin `.env.example` menjadi `.env`. Nilai lokal utama:

```text
GO_API_BASE_URL=http://127.0.0.1:8088
GO_IDENTITY_URL=http://127.0.0.1:18081
TAKEIN_COOKIE_SECURE=false
NEXT_PUBLIC_PROVIDER_FRONTEND_URL=http://127.0.0.1:5173
NEXT_PUBLIC_CUSTOMER_APP_URL=http://127.0.0.1:5174
```

Set `TAKEIN_COOKIE_SECURE=true` hanya ketika frontend disajikan melalui HTTPS.

## Integrasi Go

- identity-service: register, login, me, logout, dan refresh sesi.
- catalog-service: pencarian, branch, staff, layanan, review, dan voucher.
- booking-service: availability, hold, finalize, daftar booking, reschedule, dan cancel.
- payment-service: charge, status, dan konfirmasi pembayaran.
- customer-service: profil, aktivitas, review, dan favorit tersimpan di PostgreSQL.

Build production:

```bash
npm run build
npm run start
```
