# Authentication

Identity service menerbitkan access token RS256 berumur pendek. Setiap API
memvalidasi signature dengan public key, `iss`, `aud`, `exp`, serta claim actor.
Refresh token dirotasi dan hanya disimpan dalam cookie secure/http-only oleh BFF
Next.js.

Login, register, refresh, logout, reset password, dan lifecycle akun dimiliki
identity-service. Password disimpan menggunakan hash adaptif yang dikonfigurasi
terpusat. Rate limit berlaku per IP dan identity candidate tanpa menaruh password
atau token pada log.

Produksi wajib memakai HTTPS, CORS allowlist eksplisit, key dari secret manager,
dan rotasi key dengan periode overlap public key yang terkontrol.
