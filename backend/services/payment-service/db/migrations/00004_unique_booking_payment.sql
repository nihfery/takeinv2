-- +goose Up
-- The legacy aggregate has one payment per booking. This constraint also
-- makes the booking-event projection idempotent under Kafka redelivery.
CREATE UNIQUE INDEX payments_booking_unique_idx
    ON payments(booking_id)
    WHERE booking_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS payments_booking_unique_idx;
