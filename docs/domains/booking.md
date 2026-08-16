# Booking domain

## Ownership

`Booking` owns `bookings`, `booking_services`, `booking_participants`, and
`booking_participant_services`. It presents customer API and admin/provider
API/Next.js flows for create, finalize, hold extension, reschedule, cancel,
check-in, start, complete, no-show, walk-in, queue, and calendar behavior.

## Invariants

- Availability, provider/branch/service/staff ownership, schedule, price, and
  participant selections are validated server-side.
- Writes use PostgreSQL transaction and relevant user/staff/booking row locks.
- Create/finalize/reschedule transaction memakai bounded Go deadlock retry
  5 attempts; seluruh invariant divalidasi kembali pada retry.
- Customer idempotency is scoped by the unique `(customer_id, idempotency_key)`
  contract.
- Holds and payment-related status transitions release/retain slots according
  to the existing state machine; arbitrary status rewinds are not allowed.
- Group participants preserve ordered selections, services, staff, contact,
  optional notes/gender, and age group (`child`, `teen`, `adult`, `senior`) for
  additional participants.

Payment is a separate aggregate. A browser return/manual flag cannot mark a
production booking paid; server-side payment authority remains in Payment.
