# YouYaku Provider Web

Next.js landing dan registrasi provider di port `5173`. Login dan dashboard
operasional dipisahkan ke `apps/provider-web` pada port `5175`. Sesi JWT Go
disimpan oleh BFF Next dalam cookie HttpOnly; token tidak masuk ke localStorage
atau response JavaScript.

## Menjalankan lokal

Pastikan Traefik edge dan 11 microservice Go aktif, lalu:

```bash
cd apps/provider-landing
npm ci
npm run dev
```

Buka `http://127.0.0.1:5173`. Salin `.env.example` menjadi `.env` dengan nilai utama:

```text
GO_API_BASE_URL=http://127.0.0.1:8088
GO_IDENTITY_URL=http://127.0.0.1:18081
TAKEIN_COOKIE_SECURE=false
NEXT_PUBLIC_PROVIDER_FRONTEND_URL=http://127.0.0.1:5173
NEXT_PUBLIC_PROVIDER_LOGIN_URL=http://127.0.0.1:5175/auth/v1/login
NEXT_PUBLIC_PROVIDER_DASHBOARD_URL=http://127.0.0.1:5175/dashboard/default
NEXT_PUBLIC_PROVIDER_VERIFICATION_URL=http://127.0.0.1:5175/provider/verification
```

Set `TAKEIN_COOKIE_SECURE=true` pada deployment HTTPS.

## Provider console

Route dashboard tidak berada dalam build landing ini. Setelah login/registrasi,
browser diarahkan ke aplikasi `apps/provider-web`.

Registrasi menunggu proyeksi provider Kafka terbaca. Pengguna lalu masuk kembali
di origin provider console agar cookie dashboard tetap host-only.

Build production:

```bash
npm run build
npm run start
```
