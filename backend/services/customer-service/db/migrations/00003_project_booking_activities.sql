-- +goose Up
DELETE FROM customer_activities older
USING customer_activities newer
WHERE older.customer_id = newer.customer_id
  AND older.booking_id = newer.booking_id
  AND older.booking_id IS NOT NULL
  AND older.id < newer.id;

CREATE UNIQUE INDEX customer_activities_customer_booking_uidx
    ON customer_activities(customer_id, booking_id);

CREATE TABLE pending_customer_activities (
    booking_id BIGINT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX pending_customer_activities_user_idx
    ON pending_customer_activities(user_id);

-- +goose Down
DROP TABLE IF EXISTS pending_customer_activities;
DROP INDEX IF EXISTS customer_activities_customer_booking_uidx;
