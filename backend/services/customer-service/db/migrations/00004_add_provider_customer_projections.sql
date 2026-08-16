-- +goose Up
ALTER TABLE customer_profiles
    ADD COLUMN display_name TEXT,
    ADD COLUMN email TEXT;

ALTER TABLE customer_activities
    ADD COLUMN provider_id BIGINT,
    ADD COLUMN branch_id BIGINT,
    ADD COLUMN booking_date DATE,
    ADD COLUMN status TEXT,
    ADD COLUMN total_price_minor_units BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN currency TEXT NOT NULL DEFAULT 'IDR';
CREATE INDEX customer_activities_provider_scope_idx
    ON customer_activities(provider_id, branch_id, booking_date DESC);

ALTER TABLE pending_customer_activities
    ADD COLUMN provider_id BIGINT,
    ADD COLUMN branch_id BIGINT,
    ADD COLUMN booking_date DATE,
    ADD COLUMN status TEXT,
    ADD COLUMN total_price_minor_units BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN currency TEXT NOT NULL DEFAULT 'IDR';

ALTER TABLE branch_reviews ADD COLUMN provider_id BIGINT;
ALTER TABLE staff_reviews
    ADD COLUMN provider_id BIGINT,
    ADD COLUMN branch_id BIGINT;
CREATE INDEX branch_reviews_provider_scope_idx ON branch_reviews(provider_id, branch_id, created_at DESC);
CREATE INDEX staff_reviews_provider_scope_idx ON staff_reviews(provider_id, branch_id, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS staff_reviews_provider_scope_idx;
DROP INDEX IF EXISTS branch_reviews_provider_scope_idx;
ALTER TABLE staff_reviews DROP COLUMN IF EXISTS branch_id, DROP COLUMN IF EXISTS provider_id;
ALTER TABLE branch_reviews DROP COLUMN IF EXISTS provider_id;
DROP INDEX IF EXISTS customer_activities_provider_scope_idx;
ALTER TABLE pending_customer_activities
    DROP COLUMN IF EXISTS currency,
    DROP COLUMN IF EXISTS total_price_minor_units,
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS booking_date,
    DROP COLUMN IF EXISTS branch_id,
    DROP COLUMN IF EXISTS provider_id;
ALTER TABLE customer_activities
    DROP COLUMN IF EXISTS currency,
    DROP COLUMN IF EXISTS total_price_minor_units,
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS booking_date,
    DROP COLUMN IF EXISTS branch_id,
    DROP COLUMN IF EXISTS provider_id;
ALTER TABLE customer_profiles DROP COLUMN IF EXISTS email, DROP COLUMN IF EXISTS display_name;
