-- name: CreateBooking :one
INSERT INTO bookings (booking_code, provider_id, customer_id, branch_id, staff_id, booking_type, booking_date, status, starts_at, ends_at,
  total_duration, total_price, currency, customer_name, customer_phone, participant_count, notes, queue_number,
  held_at, hold_expires_at, idempotency_key)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
RETURNING id, booking_code, provider_id, customer_id, branch_id, staff_id, booking_type, booking_date, status, starts_at, ends_at,
  actual_started_at, actual_ended_at, total_duration, total_price, currency, customer_name, customer_phone,
  participant_count, notes, queue_number, checked_in_at, completed_at, held_at, hold_expires_at, expired_at,
  idempotency_key, created_at, updated_at;

-- name: GetBookingByID :one
SELECT id, booking_code, provider_id, customer_id, branch_id, staff_id, booking_type, booking_date, status, starts_at, ends_at,
  actual_started_at, actual_ended_at, total_duration, total_price, currency, customer_name, customer_phone,
  participant_count, notes, queue_number, checked_in_at, completed_at, held_at, hold_expires_at, expired_at,
  idempotency_key, created_at, updated_at
FROM bookings WHERE id = $1;

-- name: GetOwnedBookingByCode :one
SELECT id, booking_code, provider_id, customer_id, branch_id, staff_id, booking_type, booking_date, status, starts_at, ends_at,
  actual_started_at, actual_ended_at, total_duration, total_price, currency, customer_name, customer_phone,
  participant_count, notes, queue_number, checked_in_at, completed_at, held_at, hold_expires_at, expired_at,
  idempotency_key, created_at, updated_at
FROM bookings WHERE booking_code = $1 AND customer_id = $2;

-- name: ListCustomerBookings :many
SELECT id, booking_code, provider_id, customer_id, branch_id, staff_id, booking_type, booking_date, status, starts_at, ends_at,
  actual_started_at, actual_ended_at, total_duration, total_price, currency, customer_name, customer_phone,
  participant_count, notes, queue_number, checked_in_at, completed_at, held_at, hold_expires_at, expired_at,
  idempotency_key, created_at, updated_at
FROM bookings WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3;

-- name: LockConflictingBookings :many
SELECT id, starts_at, ends_at, status FROM bookings
WHERE staff_id = $1 AND starts_at < $3 AND ends_at > $2
  AND status IN ('pending','pending_hold','pending_payment','confirmed','waiting','checked_in','in_progress','inprogress')
FOR UPDATE;

-- name: LockBooking :one
SELECT id, booking_code, provider_id, customer_id, branch_id, staff_id, booking_type, booking_date, status, starts_at, ends_at,
  actual_started_at, actual_ended_at, total_duration, total_price, currency, customer_name, customer_phone,
  participant_count, notes, queue_number, checked_in_at, completed_at, held_at, hold_expires_at, expired_at,
  idempotency_key, created_at, updated_at
FROM bookings WHERE id = $1 FOR UPDATE;

-- name: UpdateBookingState :one
UPDATE bookings SET status = $2, held_at = $3, hold_expires_at = $4, expired_at = $5, updated_at = now()
WHERE id = $1
RETURNING id, booking_code, provider_id, customer_id, branch_id, staff_id, booking_type, booking_date, status, starts_at, ends_at,
  actual_started_at, actual_ended_at, total_duration, total_price, currency, customer_name, customer_phone,
  participant_count, notes, queue_number, checked_in_at, completed_at, held_at, hold_expires_at, expired_at,
  idempotency_key, created_at, updated_at;

-- name: CreateBookingServiceSnapshot :exec
INSERT INTO booking_services (booking_id, service_id, service_title, price, estimated_duration)
VALUES ($1,$2,$3,$4,$5);

-- name: CreateBookingParticipant :one
INSERT INTO booking_participants (booking_id, position, is_primary, name, phone, email, gender, age_group, description,
  provider_staff_id, starts_at, ends_at, total_duration, total_price)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
RETURNING id;

-- name: CreateParticipantServiceSnapshot :exec
INSERT INTO booking_participant_services (booking_participant_id, service_id, service_title, price, estimated_duration)
VALUES ($1,$2,$3,$4,$5);

-- name: InsertBookingOutbox :exec
INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, event_version, payload, headers, occurred_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8);

-- name: InsertBookingInbox :execrows
INSERT INTO inbox_events (event_id, topic, partition_id, offset_id, event_type)
VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING;
