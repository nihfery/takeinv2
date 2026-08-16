# Payment domain

`Payment` owns `payments`, `payment_gateway_transactions`, the customer charge
and status endpoints, Midtrans gateway client, and `/api/midtrans/notification`.
Subscription payment uses the same gateway service but Subscription retains its
own aggregate/state fields.

## Payment invariants

- Production manual customer confirmation is disabled.
- Incoming notification signature is verified before processing.
- Go fetches authoritative status from Midtrans and matches order ID,
  amount, currency, status code, and fraud state as applicable.
- Payment/gateway/booking rows are locked and updated transactionally.
- State transition checks make replay idempotent and prevent regressions such as
  paid back to pending; late/refund states follow explicit rules.
- Processing and sensitive changes are written to Audit.

Email/notification/broadcast/telemetry failure must not reverse a committed
payment. Midtrans credentials and production activation are external secrets,
not provisioned by this repository.
