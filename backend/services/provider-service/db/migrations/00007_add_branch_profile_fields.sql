-- +goose Up
ALTER TABLE provider_branches
    ADD COLUMN description TEXT NOT NULL DEFAULT '',
    ADD COLUMN branch_type TEXT NOT NULL DEFAULT 'physical'
        CHECK (branch_type IN ('physical', 'hybrid', 'mobile')),
    ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    ADD COLUMN opened_at DATE;

UPDATE provider_branches
SET description = 'Official branch profile for ' || branch_name || '.',
    timezone = CASE
        WHEN state_id IN (
            'Bali', 'Gorontalo', 'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara',
            'Nusa Tenggara Barat', 'Nusa Tenggara Timur', 'Sulawesi Barat', 'Sulawesi Selatan',
            'Sulawesi Tengah', 'Sulawesi Tenggara', 'Sulawesi Utara'
        ) THEN 'Asia/Makassar'
        WHEN state_id IN ('Maluku', 'Maluku Utara', 'Papua', 'Papua Barat') THEN 'Asia/Jayapura'
        ELSE 'Asia/Jakarta'
    END,
    opened_at = created_at::date
WHERE description = '' OR opened_at IS NULL;

-- +goose Down
ALTER TABLE provider_branches
    DROP COLUMN IF EXISTS opened_at,
    DROP COLUMN IF EXISTS timezone,
    DROP COLUMN IF EXISTS branch_type,
    DROP COLUMN IF EXISTS description;
