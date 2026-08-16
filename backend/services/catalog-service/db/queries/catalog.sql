-- name: ListPublicCategories :many
SELECT id, parent_id, name, slug, image_object_id, icon, description, status, is_featured, sort_order, created_at, updated_at
FROM service_categories WHERE status = 'active' ORDER BY sort_order, name LIMIT $1 OFFSET $2;

-- name: ListPublicServices :many
SELECT id, provider_id, title, slug, category_text, category_id, code, description, includes, price_type, price,
       minimum_duration, estimated_duration, maximum_duration, is_queue_enabled, is_scheduled_enabled, requires_dp,
       dp_amount, payment_policy, slots, additional_services, holidays, branch_ids, gallery_object_ids, video_url,
       status, verify_status, created_at, updated_at
FROM services WHERE status = 'active' AND verify_status = 'verified' ORDER BY id LIMIT $1 OFFSET $2;

-- name: GetServiceSnapshot :many
SELECT id, provider_id, title, price, estimated_duration, is_queue_enabled, is_scheduled_enabled, requires_dp, dp_amount
FROM services WHERE provider_id = $1 AND id = ANY($2::bigint[]) AND status = 'active' AND verify_status = 'verified'
ORDER BY id LIMIT 500;

-- name: ListProviderServices :many
SELECT id, provider_id, title, slug, category_text, category_id, code, description, includes, price_type, price,
       minimum_duration, estimated_duration, maximum_duration, is_queue_enabled, is_scheduled_enabled, requires_dp,
       dp_amount, payment_policy, slots, additional_services, holidays, branch_ids, gallery_object_ids, video_url,
       status, verify_status, created_at, updated_at
FROM services WHERE provider_id = $1 ORDER BY id LIMIT $2 OFFSET $3;

-- name: GetActiveCouponForUpdate :one
SELECT id, code, product_type, product_ids, coupon_type, coupon_value, quantity, used_count, start_date, end_date, status, created_at, updated_at
FROM coupons WHERE code = $1 AND status = 'active' AND CURRENT_DATE BETWEEN start_date AND end_date FOR UPDATE;

-- name: IncrementCouponUsage :exec
UPDATE coupons SET used_count = used_count + 1, updated_at = now()
WHERE id = $1 AND (quantity IS NULL OR used_count < quantity);
