-- name: GetProviderByID :one
SELECT id, user_id, image, phone_number, category, status, onboarding_status, onboarding_current_step,
       onboarding_version, trial_starts_at, trial_ends_at, document_status, ktp_object_id, nib_number,
       nib_object_id, business_object_id, document_note, document_submitted_at, document_verified_at, created_at, updated_at
FROM provider_profiles WHERE id = $1;

-- name: UpdateOnboarding :one
UPDATE provider_profiles SET onboarding_status = $2, onboarding_current_step = $3,
  onboarding_version = $4, updated_at = now() WHERE id = $1
RETURNING id, user_id, image, phone_number, category, status, onboarding_status, onboarding_current_step,
          onboarding_version, trial_starts_at, trial_ends_at, document_status, ktp_object_id, nib_number,
          nib_object_id, business_object_id, document_note, document_submitted_at, document_verified_at, created_at, updated_at;

-- name: ListProviderBranches :many
SELECT id, provider_id, branch_name, email, phone_code, phone_number, address, country_id, state_id, city_id,
       latitude, longitude, zip_code, working_start_hour, working_end_hour, working_days, holidays,
       image_object_id, image_object_ids, status, created_at, updated_at, description, branch_type, timezone, opened_at
FROM provider_branches WHERE provider_id = $1 ORDER BY id LIMIT $2 OFFSET $3;

-- name: GetBranchInProviderScope :one
SELECT id, provider_id, branch_name, email, phone_code, phone_number, address, country_id, state_id, city_id,
       latitude, longitude, zip_code, working_start_hour, working_end_hour, working_days, holidays,
       image_object_id, image_object_ids, status, created_at, updated_at, description, branch_type, timezone, opened_at
FROM provider_branches WHERE id = $1 AND provider_id = $2;

-- name: CreateProviderBranch :one
INSERT INTO provider_branches (provider_id, branch_name, email, phone_code, phone_number, address, country_id, state_id, city_id, latitude, longitude, zip_code, working_start_hour, working_end_hour, working_days, holidays, image_object_id, image_object_ids, status, description, branch_type, timezone, opened_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
RETURNING id, provider_id, branch_name, email, phone_code, phone_number, address, country_id, state_id, city_id,
          latitude, longitude, zip_code, working_start_hour, working_end_hour, working_days, holidays,
          image_object_id, image_object_ids, status, created_at, updated_at, description, branch_type, timezone, opened_at;

-- name: GetBranchRoleName :one
SELECT role_name FROM provider_roles
WHERE provider_id = $1 AND identity_user_id = $2 AND status = 'active'
ORDER BY id LIMIT 1;

-- name: ListEligibleStaff :many
SELECT DISTINCT s.id, s.provider_id, s.branch_id, s.provider_role_id, s.image_object_id, s.first_name, s.last_name,
       s.email, s.username, s.country_code, s.phone_number, s.gender, s.date_of_birth, s.address, s.country_id,
       s.state_id, s.city_id, s.postal_code, s.bio, s.category_id, s.role, s.rating, s.current_status, s.status,
       s.created_at, s.updated_at
FROM provider_staffs s
JOIN staff_skills sk ON sk.staff_id = s.id
WHERE s.provider_id = $1 AND s.branch_id = $2 AND s.status = 'active' AND s.current_status <> 'offline'
  AND sk.service_id = ANY($3::bigint[])
ORDER BY s.id LIMIT 500;

-- name: GetRolePermissions :many
SELECT p.menu_key FROM provider_role_menu_permissions p WHERE p.provider_role_id = $1 ORDER BY p.menu_key LIMIT 500;
