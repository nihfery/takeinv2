-- +goose Up
UPDATE provider_branches
SET working_days = '[]'::jsonb
WHERE working_days IS NULL OR jsonb_typeof(working_days) <> 'array';

UPDATE provider_branches
SET holidays = '[]'::jsonb
WHERE holidays IS NULL OR jsonb_typeof(holidays) <> 'array';

UPDATE provider_branches
SET image_object_ids = '[]'::jsonb
WHERE image_object_ids IS NULL OR jsonb_typeof(image_object_ids) <> 'array';

ALTER TABLE provider_branches
    ALTER COLUMN working_days SET DEFAULT '[]'::jsonb,
    ALTER COLUMN working_days SET NOT NULL,
    ALTER COLUMN holidays SET DEFAULT '[]'::jsonb,
    ALTER COLUMN holidays SET NOT NULL,
    ALTER COLUMN image_object_ids SET DEFAULT '[]'::jsonb,
    ALTER COLUMN image_object_ids SET NOT NULL,
    ADD CONSTRAINT provider_branches_working_days_array CHECK (jsonb_typeof(working_days) = 'array'),
    ADD CONSTRAINT provider_branches_holidays_array CHECK (jsonb_typeof(holidays) = 'array'),
    ADD CONSTRAINT provider_branches_image_object_ids_array CHECK (jsonb_typeof(image_object_ids) = 'array');

-- +goose Down
ALTER TABLE provider_branches
    DROP CONSTRAINT IF EXISTS provider_branches_image_object_ids_array,
    DROP CONSTRAINT IF EXISTS provider_branches_holidays_array,
    DROP CONSTRAINT IF EXISTS provider_branches_working_days_array,
    ALTER COLUMN image_object_ids DROP NOT NULL,
    ALTER COLUMN image_object_ids DROP DEFAULT,
    ALTER COLUMN holidays DROP NOT NULL,
    ALTER COLUMN holidays DROP DEFAULT,
    ALTER COLUMN working_days DROP NOT NULL,
    ALTER COLUMN working_days DROP DEFAULT;
