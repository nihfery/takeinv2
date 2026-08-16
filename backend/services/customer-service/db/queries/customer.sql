-- name: GetCustomerProfileByUserID :one
SELECT id, user_id, customer_code, phone_number, gender, date_of_birth, religion, allergies, avatar,
       address_line_1, address_line_2, city, state, country, status, created_at, updated_at
FROM customer_profiles WHERE user_id = $1;

-- name: UpsertCustomerProfile :one
INSERT INTO customer_profiles (user_id, customer_code, phone_number, gender, date_of_birth, religion, allergies, avatar, address_line_1, address_line_2, city, state, country, status)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
ON CONFLICT (user_id) DO UPDATE SET
  phone_number = EXCLUDED.phone_number, gender = EXCLUDED.gender, date_of_birth = EXCLUDED.date_of_birth,
  religion = EXCLUDED.religion, allergies = EXCLUDED.allergies, avatar = EXCLUDED.avatar,
  address_line_1 = EXCLUDED.address_line_1, address_line_2 = EXCLUDED.address_line_2,
  city = EXCLUDED.city, state = EXCLUDED.state, country = EXCLUDED.country, status = EXCLUDED.status, updated_at = now()
RETURNING id, user_id, customer_code, phone_number, gender, date_of_birth, religion, allergies, avatar,
          address_line_1, address_line_2, city, state, country, status, created_at, updated_at;

-- name: ListCustomerActivities :many
SELECT id, customer_id, booking_id, created_at, updated_at FROM customer_activities
WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3;

-- name: CountCustomerActivities :one
SELECT count(*) FROM customer_activities WHERE customer_id = $1;

-- name: CreateBranchReview :one
INSERT INTO branch_reviews (booking_id, customer_id, branch_id, rating, comment, images)
VALUES ($1,$2,$3,$4,$5,$6)
RETURNING id, booking_id, customer_id, branch_id, rating, comment, images, created_at, updated_at;

-- name: CreateStaffReview :one
INSERT INTO staff_reviews (booking_id, customer_id, staff_id, rating, comment)
VALUES ($1,$2,$3,$4,$5)
RETURNING id, booking_id, customer_id, staff_id, rating, comment, created_at, updated_at;

