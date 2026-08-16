-- +goose Up
-- Queue and walk-in bookings can legitimately have no starts_at value. Keep
-- the legacy calendar date as first-class data so queue numbering, provider
-- calendars, and historical migration do not infer a date from created_at.
ALTER TABLE bookings ADD COLUMN booking_date DATE;

UPDATE bookings
SET booking_date = COALESCE(
    (starts_at AT TIME ZONE 'Asia/Bangkok')::date,
    (created_at AT TIME ZONE 'Asia/Bangkok')::date
)
WHERE booking_date IS NULL;

ALTER TABLE bookings ALTER COLUMN booking_date SET NOT NULL;

CREATE INDEX bookings_provider_calendar_idx
    ON bookings(provider_id, branch_id, booking_date, created_at DESC);

CREATE UNIQUE INDEX bookings_branch_daily_queue_idx
    ON bookings(branch_id, booking_date, queue_number)
    WHERE branch_id IS NOT NULL AND queue_number IS NOT NULL;

-- Customer and provider commands both need durable idempotency. Generalize
-- the original customer-only key without changing existing customer rows.
ALTER TABLE idempotency_records DROP CONSTRAINT idempotency_records_pkey;
ALTER TABLE idempotency_records RENAME COLUMN customer_id TO actor_id;
ALTER TABLE idempotency_records
    ADD COLUMN actor_type TEXT NOT NULL DEFAULT 'customer'
        CHECK (actor_type IN ('customer', 'provider', 'admin'));
ALTER TABLE idempotency_records
    ADD PRIMARY KEY(actor_type, actor_id, idempotency_key);

-- +goose Down
DROP INDEX IF EXISTS bookings_branch_daily_queue_idx;
DROP INDEX IF EXISTS bookings_provider_calendar_idx;
ALTER TABLE idempotency_records DROP CONSTRAINT idempotency_records_pkey;
ALTER TABLE idempotency_records DROP COLUMN actor_type;
ALTER TABLE idempotency_records RENAME COLUMN actor_id TO customer_id;
ALTER TABLE idempotency_records ADD PRIMARY KEY(customer_id, idempotency_key);
ALTER TABLE bookings DROP COLUMN IF EXISTS booking_date;
