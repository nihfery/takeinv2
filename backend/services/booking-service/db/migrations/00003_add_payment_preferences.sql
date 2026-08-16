-- +goose Up
ALTER TABLE bookings
    ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'pay_at_salon'
        CHECK (payment_type IN ('dp', 'full_payment', 'pay_at_salon')),
    ADD COLUMN payment_channel TEXT
        CHECK (payment_channel IS NULL OR payment_channel IN ('qris', 'bca_va', 'bni_va', 'bri_va', 'permata_va', 'cimb_va', 'mandiri_bill')),
    ADD COLUMN payment_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (payment_amount >= 0),
    ADD COLUMN dp_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (dp_amount >= 0);

-- +goose Down
ALTER TABLE bookings
    DROP COLUMN IF EXISTS dp_amount,
    DROP COLUMN IF EXISTS payment_amount,
    DROP COLUMN IF EXISTS payment_channel,
    DROP COLUMN IF EXISTS payment_type;
