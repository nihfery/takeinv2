# Identity domain

## Ownership

`Identity` owns the `users` aggregate, Go auth model, API
register/login/logout/me, and unified Next.js login behavior. Tables:
`users`, `admin_profiles` (profile record is presented by admin compatibility
controllers), `personal_access_tokens`, and `password_reset_tokens`.

## Authentication surfaces

- JWT protects authenticated API routes.
- Session guards `web`, `admin`, `provider`, and `provider_branch` share the
  Eloquent user provider but use role/scope middleware.
- Provider landing POSTs to Go `/provider/signin`, which creates the Next.js
  session and redirects to the dashboard.
- Access tokens use the identity-service JWT contract.

Auth is only the first boundary: Provider/Branch authorization, account status,
document status, and menu entitlement are evaluated after authentication. MFA
is not implemented in this repository; stronger admin ingress remains an
external/next-step control.
