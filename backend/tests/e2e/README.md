# Critical Go E2E

`cmd/e2e` exercises every critical flow listed in the migration PRD through the
Traefik/API edge: identity, provider readiness and catalog visibility, booking
hold/finalize/payment/cancel/reschedule/review, trial/subscription activation,
cross-provider authorization, authenticated WebSocket chat, and signed media
URLs. The Midtrans webhook is signed, replayed, and observed through the
payment-to-booking and payment-to-billing event chains.

Run from the repository root:

```bash
make test-e2e
```

The wrapper starts the target Compose profiles with `COMPOSE_PARALLEL_LIMIT=2`,
applies migrations, creates topics, waits for the edge, and sets
`E2E_ALLOW_FIXTURES=true`. The runner seeds only data that has no public setup
API (an admin role, plan/trial, and chat thread). Fixture DSNs must resolve only
to loopback unless `E2E_ALLOW_REMOTE_FIXTURES=true` is explicitly set for a
disposable remote E2E database. Never enable that override for shared, staging,
or production data.

Real Midtrans sandbox callbacks and real R2 object transfer remain separate
staging gates; the local suite uses the repository-owned Midtrans mock and
validates SigV4 URL generation without contacting an external bucket.
