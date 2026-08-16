package postgres

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	catalogeventsv1 "github.com/nihfery/takein/gen/go/takein/events/catalog/v1"
	eventscommonv1 "github.com/nihfery/takein/gen/go/takein/events/common/v1"
	"github.com/nihfery/takein/services/catalog-service/internal/catalog"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type Repository struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

const categoryColumns = `id,parent_id,name,slug,image_object_id,icon,description,status,is_featured,sort_order,created_at,updated_at`
const serviceColumns = `id,provider_id,title,slug,category_text,category_id,code,description,includes,price_type,price,minimum_duration,estimated_duration,maximum_duration,is_queue_enabled,is_scheduled_enabled,requires_dp,dp_amount,payment_policy,slots,additional_services,holidays,branch_ids,gallery_object_ids,video_url,status,verify_status,created_at,updated_at`
const couponColumns = `id,code,product_type,product_ids,coupon_type,coupon_value,quantity,used_count,start_date,end_date,status,created_at,updated_at`

func (r *Repository) ListCategories(ctx context.Context, public bool) ([]map[string]any, error) {
	query := `SELECT ` + categoryColumns + ` FROM service_categories`
	if public {
		query += ` WHERE status='active'`
	}
	query += ` ORDER BY sort_order,id LIMIT 500`
	return r.many(ctx, query)
}
func (r *Repository) Category(ctx context.Context, id int64) (map[string]any, error) {
	return r.one(ctx, `SELECT `+categoryColumns+` FROM service_categories WHERE id=$1`, id)
}
func (r *Repository) CreateCategory(ctx context.Context, input catalog.CategoryInput) (map[string]any, error) {
	featured := true
	if input.Featured != nil {
		featured = *input.Featured
	}
	return r.mutate(ctx, "category", 0, "catalog.category_created", `INSERT INTO service_categories(parent_id,name,slug,description,status,is_featured)VALUES($1,$2,$3,$4,COALESCE(NULLIF($5,''),'active'),$6)RETURNING `+categoryColumns, input.ParentID, input.Name, input.Slug, nullable(input.Description), input.Status, featured)
}
func (r *Repository) UpdateCategory(ctx context.Context, id int64, input catalog.CategoryInput) (map[string]any, error) {
	return r.mutate(ctx, "category", id, "catalog.category_updated", `UPDATE service_categories SET parent_id=COALESCE($2,parent_id),name=COALESCE(NULLIF($3,''),name),slug=COALESCE(NULLIF($4,''),slug),description=COALESCE(NULLIF($5,''),description),status=COALESCE(NULLIF($6,''),status),is_featured=COALESCE($7,is_featured),updated_at=now() WHERE id=$1 RETURNING `+categoryColumns, input.ParentID, input.Name, input.Slug, input.Description, input.Status, input.Featured)
}
func (r *Repository) ToggleCategory(ctx context.Context, id int64, field string) (map[string]any, error) {
	assignment := "status=CASE status WHEN 'active' THEN 'inactive' ELSE 'active' END"
	eventType := "catalog.category_status_changed"
	if field == "featured" {
		assignment = "is_featured=NOT is_featured"
		eventType = "catalog.category_featured_changed"
	}
	return r.mutate(ctx, "category", id, eventType, `UPDATE service_categories SET `+assignment+`,updated_at=now() WHERE id=$1 RETURNING `+categoryColumns)
}
func (r *Repository) DeleteCategory(ctx context.Context, id int64) error {
	return r.delete(ctx, "category", id, "catalog.category_deleted", `DELETE FROM service_categories WHERE id=$1`, id)
}

func (r *Repository) ListServices(ctx context.Context, providerID *int64, public bool) ([]map[string]any, error) {
	query := `SELECT ` + serviceColumns + ` FROM services WHERE 1=1`
	args := []any{}
	if providerID != nil {
		args = append(args, *providerID)
		query += fmt.Sprintf(` AND provider_id=$%d`, len(args))
	}
	if public {
		query += ` AND status='active' AND verify_status='verified'`
	}
	query += ` ORDER BY id LIMIT 500`
	return r.many(ctx, query, args...)
}
func (r *Repository) ListBranchServices(ctx context.Context, branchID int64) ([]map[string]any, error) {
	return r.many(ctx, `SELECT s.*,
			COALESCE(category.name,s.category_text) AS category_name,
			COALESCE(category.slug,'') AS category_slug,
			parent.id AS main_category_id,
			COALESCE(parent.slug,'') AS main_category_slug
		FROM services s
		JOIN branch_projection branch
		  ON branch.branch_id=$1
		 AND branch.provider_id=s.provider_id
		 AND branch.status='active'
		 AND branch.ready
		LEFT JOIN service_categories category ON category.id=s.category_id
		LEFT JOIN service_categories parent ON parent.id=category.parent_id
		WHERE s.status='active' AND s.verify_status='verified'
		  AND (COALESCE(jsonb_array_length(s.branch_ids),0)=0 OR s.branch_ids @> jsonb_build_array($1::bigint))
		ORDER BY s.id LIMIT 500`, branchID)
}
func (r *Repository) Service(ctx context.Context, id int64, providerID *int64, public bool) (map[string]any, error) {
	query := `SELECT ` + serviceColumns + ` FROM services WHERE id=$1`
	args := []any{id}
	if providerID != nil {
		args = append(args, *providerID)
		query += ` AND provider_id=$2`
	}
	if public {
		query += ` AND status='active' AND verify_status='verified'`
	}
	return r.one(ctx, query, args...)
}
func (r *Repository) CreateService(ctx context.Context, providerID int64, input catalog.ServiceInput) (map[string]any, error) {
	return r.mutate(ctx, "service", 0, "catalog.service_created", `INSERT INTO services(
		provider_id,title,slug,category_text,category_id,code,description,includes,price_type,price,
		minimum_duration,estimated_duration,maximum_duration,is_queue_enabled,is_scheduled_enabled,
		requires_dp,dp_amount,payment_policy,slots,additional_services,holidays,branch_ids,
		gallery_object_ids,video_url,status,verify_status)
		VALUES($1,$2,$3,$4,$5,NULLIF($6,''),NULLIF($7,''),NULLIF($8,''),NULLIF($9,''),$10::numeric/100,
		$11,$12,$13,COALESCE($14,true),COALESCE($15,true),COALESCE($16,false),$17::numeric/100,
		NULLIF($18,''),$19,$20,$21,$22,$23,NULLIF($24,''),COALESCE(NULLIF($25,''),'active'),COALESCE(NULLIF($26,''),'verified'))
		RETURNING `+serviceColumns, providerID, input.Title, input.Slug, input.Category, input.CategoryID,
		input.Code, input.Description, input.Includes, input.PriceType, input.PriceMinor, input.MinimumDuration,
		input.Duration, input.MaximumDuration, input.QueueEnabled, input.ScheduledEnabled, input.RequiresDP,
		input.DPAmountMinor, input.PaymentPolicy, jsonRaw(input.Slots), jsonRaw(input.AdditionalServices),
		jsonRaw(input.Holidays), jsonValue(input.BranchIDs), jsonValue(input.GalleryObjectIDs), input.VideoURL,
		input.Status, input.VerifyStatus)
}
func (r *Repository) UpdateService(ctx context.Context, providerID, id int64, input catalog.ServiceInput) (map[string]any, error) {
	return r.mutate(ctx, "service", id, "catalog.service_updated", `UPDATE services SET
		title=$3,slug=$4,category_text=$5,category_id=$6,code=NULLIF($7,''),description=NULLIF($8,''),includes=NULLIF($9,''),
		price_type=NULLIF($10,''),price=$11::numeric/100,minimum_duration=$12,estimated_duration=$13,maximum_duration=$14,
		is_queue_enabled=COALESCE($15,true),is_scheduled_enabled=COALESCE($16,true),requires_dp=COALESCE($17,false),
		dp_amount=$18::numeric/100,payment_policy=NULLIF($19,''),slots=$20,additional_services=$21,holidays=$22,
		branch_ids=$23,gallery_object_ids=$24,video_url=NULLIF($25,''),status=COALESCE(NULLIF($26,''),'active'),
		verify_status=COALESCE(NULLIF($27,''),verify_status),updated_at=now()
		WHERE id=$1 AND provider_id=$2 RETURNING `+serviceColumns,
		id, providerID, input.Title, input.Slug, input.Category, input.CategoryID, input.Code, input.Description,
		input.Includes, input.PriceType, input.PriceMinor, input.MinimumDuration, input.Duration, input.MaximumDuration,
		input.QueueEnabled, input.ScheduledEnabled, input.RequiresDP, input.DPAmountMinor, input.PaymentPolicy,
		jsonRaw(input.Slots), jsonRaw(input.AdditionalServices), jsonRaw(input.Holidays), jsonValue(input.BranchIDs),
		jsonValue(input.GalleryObjectIDs), input.VideoURL, input.Status, input.VerifyStatus)
}
func (r *Repository) UpdateServiceJSON(ctx context.Context, providerID, id int64, field string, value any) (map[string]any, error) {
	if field != "branch_ids" && field != "gallery_object_ids" {
		return nil, catalog.ErrConflict
	}
	return r.mutate(ctx, "service", id, "catalog.service_updated", `UPDATE services SET `+field+`=$3,updated_at=now() WHERE id=$1 AND provider_id=$2 RETURNING `+serviceColumns, id, providerID, jsonValue(value))
}
func (r *Repository) UpdateServiceGallery(ctx context.Context, providerID, id int64, objectIDs []string, videoURL string) (map[string]any, error) {
	return r.mutate(ctx, "service", id, "catalog.service_updated", `UPDATE services SET gallery_object_ids=$3,video_url=NULLIF($4,''),updated_at=now() WHERE id=$1 AND provider_id=$2 RETURNING `+serviceColumns, id, providerID, jsonValue(objectIDs), videoURL)
}
func (r *Repository) ToggleService(ctx context.Context, id int64, providerID *int64) (map[string]any, error) {
	query := `UPDATE services SET status=CASE status WHEN 'active' THEN 'inactive' ELSE 'active' END,updated_at=now() WHERE id=$1`
	args := []any{id}
	if providerID != nil {
		query += ` AND provider_id=$2`
		args = append(args, *providerID)
	}
	query += ` RETURNING ` + serviceColumns
	return r.mutate(ctx, "service", id, "catalog.service_status_changed", query, args...)
}
func (r *Repository) DeleteService(ctx context.Context, providerID, id int64) error {
	return r.delete(ctx, "service", id, "catalog.service_deleted", `DELETE FROM services WHERE id=$1 AND provider_id=$2`, id, providerID)
}

func (r *Repository) ListCoupons(ctx context.Context, public bool) ([]map[string]any, error) {
	query := `SELECT ` + couponColumns + ` FROM coupons`
	if public {
		query += ` WHERE status='active' AND CURRENT_DATE BETWEEN start_date AND end_date AND (quantity IS NULL OR used_count<quantity)`
	}
	query += ` ORDER BY id LIMIT 500`
	return r.many(ctx, query)
}
func (r *Repository) Coupon(ctx context.Context, id int64) (map[string]any, error) {
	return r.one(ctx, `SELECT `+couponColumns+` FROM coupons WHERE id=$1`, id)
}
func (r *Repository) CouponByCode(ctx context.Context, code string) (map[string]any, error) {
	return r.one(ctx, `SELECT `+couponColumns+` FROM coupons WHERE lower(code)=lower($1)`, code)
}
func (r *Repository) ValidateCoupon(ctx context.Context, code string, amountMinor int64) (map[string]any, error) {
	return r.one(ctx, `SELECT id,code,coupon_type,coupon_value,LEAST($2::bigint,CASE WHEN coupon_type='fixed' THEN round(coupon_value*100)::bigint ELSE (($2::numeric*coupon_value)/100)::bigint END) AS discount_minor,$2::bigint-LEAST($2::bigint,CASE WHEN coupon_type='fixed' THEN round(coupon_value*100)::bigint ELSE (($2::numeric*coupon_value)/100)::bigint END) AS total_minor FROM coupons WHERE lower(code)=lower($1) AND status='active' AND CURRENT_DATE BETWEEN start_date AND end_date AND (quantity IS NULL OR used_count<quantity)`, code, amountMinor)
}

func (r *Repository) PriceSummary(ctx context.Context, code string, serviceIDs []int64, redemptionKey string) (catalog.PriceSummary, error) {
	if len(serviceIDs) == 0 {
		return catalog.PriceSummary{}, catalog.ErrInvalidCoupon
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return catalog.PriceSummary{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	type servicePrice struct {
		categoryID *int64
		priceMinor int64
	}
	rows, err := tx.Query(ctx, `SELECT id,category_id,round(price*100)::bigint FROM services WHERE id=ANY($1::bigint[]) AND status='active' AND verify_status='verified'`, serviceIDs)
	if err != nil {
		return catalog.PriceSummary{}, err
	}
	prices := map[int64]servicePrice{}
	for rows.Next() {
		var id int64
		var price servicePrice
		if err = rows.Scan(&id, &price.categoryID, &price.priceMinor); err != nil {
			rows.Close()
			return catalog.PriceSummary{}, err
		}
		prices[id] = price
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return catalog.PriceSummary{}, err
	}
	var subtotal int64
	for _, id := range serviceIDs {
		price, exists := prices[id]
		if !exists {
			return catalog.PriceSummary{}, catalog.ErrInvalidCoupon
		}
		subtotal += price.priceMinor
	}
	summary := catalog.PriceSummary{SubtotalMinor: subtotal, EligibleSubtotalMinor: subtotal}
	if strings.TrimSpace(code) == "" {
		summary.TaxMinor = roundedPercent(subtotal, 500)
		summary.PayableMinor = subtotal + summary.TaxMinor
		if err = tx.Commit(ctx); err != nil {
			return catalog.PriceSummary{}, err
		}
		return summary, nil
	}
	hashPayload, _ := json.Marshal(struct {
		Code       string  `json:"code"`
		ServiceIDs []int64 `json:"service_ids"`
		Subtotal   int64   `json:"subtotal_minor"`
	}{strings.ToUpper(strings.TrimSpace(code)), serviceIDs, subtotal})
	hash := fmt.Sprintf("%x", sha256.Sum256(hashPayload))
	var existing, couponID int64
	var storedHash string
	var storedDiscount int64
	if redemptionKey != "" {
		err = tx.QueryRow(ctx, `SELECT coupon_id,request_hash,discount_minor FROM coupon_redemptions WHERE redemption_key=$1`, redemptionKey).Scan(&existing, &storedHash, &storedDiscount)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return catalog.PriceSummary{}, err
		}
		if err == nil {
			if storedHash != hash {
				return catalog.PriceSummary{}, catalog.ErrConflict
			}
			couponID = existing
		}
	}
	var couponCode, productType, couponType, endDate string
	var productRaw []byte
	var valueScaled, usedCount int64
	var quantity *int32
	query := `SELECT id,code,product_type,COALESCE(product_ids,'[]'::jsonb),coupon_type,round(coupon_value*100)::bigint,quantity,used_count,end_date::text FROM coupons WHERE lower(code)=lower($1) AND status='active' AND CURRENT_DATE BETWEEN start_date AND end_date FOR UPDATE`
	argument := any(code)
	if couponID > 0 {
		query = `SELECT id,code,product_type,COALESCE(product_ids,'[]'::jsonb),coupon_type,round(coupon_value*100)::bigint,quantity,used_count,end_date::text FROM coupons WHERE id=$1 FOR UPDATE`
		argument = couponID
	}
	err = tx.QueryRow(ctx, query, argument).Scan(&couponID, &couponCode, &productType, &productRaw, &couponType, &valueScaled, &quantity, &usedCount, &endDate)
	if errors.Is(err, pgx.ErrNoRows) {
		return catalog.PriceSummary{}, catalog.ErrInvalidCoupon
	}
	if err != nil {
		return catalog.PriceSummary{}, err
	}
	if existing == 0 && quantity != nil && usedCount >= int64(*quantity) {
		return catalog.PriceSummary{}, catalog.ErrInvalidCoupon
	}
	productIDs := []int64{}
	if err = json.Unmarshal(productRaw, &productIDs); err != nil {
		return catalog.PriceSummary{}, err
	}
	allowed := map[int64]struct{}{}
	for _, id := range productIDs {
		allowed[id] = struct{}{}
	}
	var eligible int64
	for _, id := range serviceIDs {
		price := prices[id]
		matches := productType == "all"
		if productType == "service" {
			_, matches = allowed[id]
		}
		if productType == "category" && price.categoryID != nil {
			_, matches = allowed[*price.categoryID]
		}
		if matches {
			eligible += price.priceMinor
		}
	}
	if eligible <= 0 {
		return catalog.PriceSummary{}, catalog.ErrInvalidCoupon
	}
	discount := valueScaled
	if couponType == "percentage" {
		discount = roundedPercent(eligible, valueScaled)
	}
	if discount > eligible {
		discount = eligible
	}
	redeemedNow := false
	if existing > 0 {
		discount = storedDiscount
	} else if redemptionKey != "" {
		result, insertErr := tx.Exec(ctx, `INSERT INTO coupon_redemptions(coupon_id,redemption_key,request_hash,discount_minor) VALUES($1,$2,$3,$4) ON CONFLICT(redemption_key) DO NOTHING`, couponID, redemptionKey, hash, discount)
		if insertErr != nil {
			return catalog.PriceSummary{}, insertErr
		}
		if result.RowsAffected() == 0 {
			var duplicateCoupon int64
			if err = tx.QueryRow(ctx, `SELECT coupon_id,request_hash,discount_minor FROM coupon_redemptions WHERE redemption_key=$1`, redemptionKey).Scan(&duplicateCoupon, &storedHash, &storedDiscount); err != nil {
				return catalog.PriceSummary{}, err
			}
			if duplicateCoupon != couponID || storedHash != hash {
				return catalog.PriceSummary{}, catalog.ErrConflict
			}
			discount = storedDiscount
		} else {
			redeemedNow = true
			if _, err = tx.Exec(ctx, `UPDATE coupons SET used_count=used_count+1,updated_at=now() WHERE id=$1`, couponID); err != nil {
				return catalog.PriceSummary{}, err
			}
			if err = writeOutbox(ctx, tx, "coupon", couponID, "catalog.coupon_redeemed", map[string]any{"status": "active"}); err != nil {
				return catalog.PriceSummary{}, err
			}
		}
	}
	summary.EligibleSubtotalMinor = eligible
	summary.DiscountMinor = discount
	afterDiscount := subtotal - discount
	summary.TaxMinor = roundedPercent(afterDiscount, 500)
	summary.PayableMinor = afterDiscount + summary.TaxMinor
	summary.Coupon = map[string]any{"id": couponID, "code": couponCode, "product_type": productType, "coupon_type": couponType, "coupon_value": float64(valueScaled) / 100, "remaining_quantity": remaining(quantity, usedCount, redeemedNow), "end_date": endDate}
	if err = tx.Commit(ctx); err != nil {
		return catalog.PriceSummary{}, err
	}
	return summary, nil
}

func (r *Repository) ReleaseCoupon(ctx context.Context, redemptionKey string) (bool, error) {
	if strings.TrimSpace(redemptionKey) == "" {
		return false, nil
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var couponID int64
	err = tx.QueryRow(ctx, `DELETE FROM coupon_redemptions WHERE redemption_key=$1 RETURNING coupon_id`, redemptionKey).Scan(&couponID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, tx.Commit(ctx)
	}
	if err != nil {
		return false, err
	}
	if _, err = tx.Exec(ctx, `UPDATE coupons SET used_count=GREATEST(0,used_count-1),updated_at=now() WHERE id=$1`, couponID); err != nil {
		return false, err
	}
	if err = writeOutbox(ctx, tx, "coupon", couponID, "catalog.coupon_redemption_released", map[string]any{"status": "active"}); err != nil {
		return false, err
	}
	return true, tx.Commit(ctx)
}

func roundedPercent(amountMinor, basisPoints int64) int64 {
	return (amountMinor*basisPoints + 5_000) / 10_000
}

func remaining(quantity *int32, used int64, incremented bool) any {
	if quantity == nil {
		return nil
	}
	if incremented {
		used++
	}
	value := int64(*quantity) - used
	if value < 0 {
		value = 0
	}
	return value
}

func (r *Repository) CreateCoupon(ctx context.Context, input catalog.CouponInput) (map[string]any, error) {
	if err := r.validateCouponProducts(ctx, input); err != nil {
		return nil, err
	}
	return r.mutate(ctx, "coupon", 0, "catalog.coupon_created", `INSERT INTO coupons(code,product_type,product_ids,coupon_type,coupon_value,quantity,start_date,end_date,status)VALUES(upper($1),$2,$3,$4,$5::numeric/100,$6,$7,$8,COALESCE(NULLIF($9,''),'active'))RETURNING `+couponColumns, input.Code, input.ProductType, jsonValue(input.ProductIDs), input.Type, input.ValueMinor, input.Quantity, input.StartDate, input.EndDate, input.Status)
}
func (r *Repository) UpdateCoupon(ctx context.Context, id int64, input catalog.CouponInput) (map[string]any, error) {
	if err := r.validateCouponProducts(ctx, input); err != nil {
		return nil, err
	}
	return r.mutate(ctx, "coupon", id, "catalog.coupon_updated", `UPDATE coupons SET code=upper($2),product_type=$3,product_ids=$4,coupon_type=$5,coupon_value=$6::numeric/100,quantity=$7,start_date=$8::date,end_date=$9::date,status=COALESCE(NULLIF($10,''),'active'),updated_at=now() WHERE id=$1 RETURNING `+couponColumns, id, input.Code, input.ProductType, jsonValue(input.ProductIDs), input.Type, input.ValueMinor, input.Quantity, input.StartDate, input.EndDate, input.Status)
}

func (r *Repository) validateCouponProducts(ctx context.Context, input catalog.CouponInput) error {
	if input.ProductType == "all" {
		return nil
	}
	table := "services"
	if input.ProductType == "category" {
		table = "service_categories"
	}
	var count int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM `+table+` WHERE id=ANY($1::bigint[])`, input.ProductIDs).Scan(&count); err != nil {
		return err
	}
	if count != len(input.ProductIDs) {
		return catalog.ErrValidation
	}
	return nil
}
func (r *Repository) DeleteCoupon(ctx context.Context, id int64) error {
	return r.delete(ctx, "coupon", id, "catalog.coupon_deleted", `DELETE FROM coupons WHERE id=$1`, id)
}

func (r *Repository) PublicProviders(ctx context.Context) ([]map[string]any, error) {
	return r.many(ctx, `SELECT provider_id,name,category,status,ready,updated_at FROM provider_projection WHERE status='active' AND ready ORDER BY provider_id LIMIT 500`)
}

const publicBranchSelect = `SELECT
		branch.branch_id,
		branch.provider_id,
		branch.branch_name,
		branch.city_id,
		branch.state_id,
		branch.country_id,
		branch.address,
		branch.latitude,
		branch.longitude,
		branch.status,
		branch.ready,
		branch.updated_at,
		COALESCE(service_data.services,'[]'::jsonb) AS services,
		COALESCE(service_data.services_count,0) AS services_count,
		COALESCE(service_data.min_price,0) AS min_price
	FROM branch_projection branch
	LEFT JOIN LATERAL (
		SELECT
			jsonb_agg(jsonb_build_object(
				'id',service.id,
				'provider_id',service.provider_id,
				'title',service.title,
				'slug',service.slug,
				'code',service.code,
				'description',service.description,
				'category_id',service.category_id,
				'category_name',COALESCE(category.name,service.category_text),
				'category_text',service.category_text,
				'category_slug',COALESCE(category.slug,''),
				'main_category_id',parent.id,
				'main_category_slug',COALESCE(parent.slug,''),
				'price',service.price,
				'price_type',service.price_type,
				'minimum_duration',service.minimum_duration,
				'estimated_duration',service.estimated_duration,
				'maximum_duration',service.maximum_duration,
				'is_queue_enabled',service.is_queue_enabled,
				'is_scheduled_enabled',service.is_scheduled_enabled,
				'requires_dp',service.requires_dp,
				'dp_amount',service.dp_amount,
				'branch_ids',service.branch_ids
			) ORDER BY service.id) AS services,
			count(*) AS services_count,
			min(service.price) AS min_price
		FROM services service
		LEFT JOIN service_categories category ON category.id=service.category_id
		LEFT JOIN service_categories parent ON parent.id=category.parent_id
		WHERE service.provider_id=branch.provider_id
		  AND service.status='active'
		  AND service.verify_status='verified'
		  AND (
			COALESCE(jsonb_array_length(service.branch_ids),0)=0
			OR service.branch_ids @> jsonb_build_array(branch.branch_id)
		  )
	) service_data ON true`

func (r *Repository) PublicBranches(ctx context.Context, providerID *int64) ([]map[string]any, error) {
	query := publicBranchSelect + ` WHERE branch.status='active' AND branch.ready`
	args := []any{}
	if providerID != nil {
		args = append(args, *providerID)
		query += ` AND branch.provider_id=$1`
	}
	query += ` ORDER BY branch.branch_id LIMIT 500`
	return r.many(ctx, query, args...)
}
func (r *Repository) PublicBranch(ctx context.Context, id int64) (map[string]any, error) {
	return r.one(ctx, publicBranchSelect+` WHERE branch.branch_id=$1 AND branch.status='active' AND branch.ready`, id)
}
func (r *Repository) PublicStaff(ctx context.Context, branchID, providerID *int64) ([]map[string]any, error) {
	query := `SELECT staff_id,provider_id,branch_id,display_name,status,service_ids,updated_at FROM staff_projection WHERE status='active'`
	args := []any{}
	if branchID != nil {
		args = append(args, *branchID)
		query += fmt.Sprintf(` AND branch_id=$%d`, len(args))
	}
	if providerID != nil {
		args = append(args, *providerID)
		query += fmt.Sprintf(` AND provider_id=$%d`, len(args))
	}
	query += ` ORDER BY staff_id LIMIT 500`
	return r.many(ctx, query, args...)
}
func (r *Repository) PublicStaffOne(ctx context.Context, id int64) (map[string]any, error) {
	return r.one(ctx, `SELECT staff_id,provider_id,branch_id,display_name,status,service_ids,updated_at FROM staff_projection WHERE staff_id=$1 AND status='active'`, id)
}
func (r *Repository) PublicReviews(ctx context.Context, branchID *int64) ([]map[string]any, error) {
	query := `SELECT review_id,branch_id,staff_id,rating,comment,created_at FROM review_projection`
	args := []any{}
	if branchID != nil {
		args = append(args, *branchID)
		query += ` WHERE branch_id=$1`
	}
	query += ` ORDER BY created_at DESC LIMIT 100`
	return r.many(ctx, query, args...)
}
func (r *Repository) PublicLocations(ctx context.Context) ([]map[string]any, error) {
	return r.many(ctx, `SELECT country_id,state_id,city_id,count(*) AS branch_count FROM branch_projection WHERE status='active' AND ready GROUP BY country_id,state_id,city_id ORDER BY country_id,state_id,city_id LIMIT 500`)
}

func (r *Repository) ServiceSnapshots(ctx context.Context, providerID, branchID int64, serviceIDs []int64) ([]catalog.Snapshot, error) {
	rows, err := r.pool.Query(ctx, `SELECT id,provider_id,title,round(price*100)::bigint,'IDR',estimated_duration,is_queue_enabled,is_scheduled_enabled,requires_dp,round(COALESCE(dp_amount,0)*100)::bigint
		FROM services
		WHERE ($1=0 OR provider_id=$1) AND id=ANY($2::bigint[]) AND status='active' AND verify_status='verified'
		  AND (COALESCE(jsonb_array_length(branch_ids),0)=0 OR branch_ids @> jsonb_build_array($3::bigint))
		ORDER BY id LIMIT 500`, providerID, serviceIDs, branchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []catalog.Snapshot{}
	for rows.Next() {
		var item catalog.Snapshot
		if err = rows.Scan(&item.ID, &item.ProviderID, &item.Title, &item.PriceMinor, &item.Currency, &item.Duration, &item.QueueEnabled, &item.ScheduledEnabled, &item.RequiresDP, &item.DPAmountMinor); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) many(ctx context.Context, query string, args ...any) ([]map[string]any, error) {
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, translate(err)
	}
	defer rows.Close()
	return pgx.CollectRows(rows, pgx.RowToMap)
}
func (r *Repository) one(ctx context.Context, query string, args ...any) (map[string]any, error) {
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, translate(err)
	}
	defer rows.Close()
	value, err := pgx.CollectOneRow(rows, pgx.RowToMap)
	return value, translate(err)
}
func (r *Repository) mutate(ctx context.Context, aggregate string, id int64, eventType, query string, args ...any) (map[string]any, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return nil, translate(err)
	}
	value, err := pgx.CollectOneRow(rows, pgx.RowToMap)
	rows.Close()
	if err != nil {
		return nil, translate(err)
	}
	if id == 0 {
		id = toInt64(value["id"])
	}
	if err = writeOutbox(ctx, tx, aggregate, id, eventType, value); err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return value, nil
}
func (r *Repository) delete(ctx context.Context, aggregate string, id int64, eventType, query string, args ...any) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	result, err := tx.Exec(ctx, query, args...)
	if err != nil {
		return translate(err)
	}
	if result.RowsAffected() != 1 {
		return catalog.ErrNotFound
	}
	if err = writeOutbox(ctx, tx, aggregate, id, eventType, map[string]any{"id": id}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func writeOutbox(ctx context.Context, tx pgx.Tx, aggregate string, id int64, eventType string, value any) error {
	eventID := uuid.New()
	now := time.Now().UTC()
	metadata := &eventscommonv1.EventMetadata{EventId: eventID.String(), EventVersion: 1, OccurredAt: timestamppb.New(now), Producer: "catalog-service", AggregateId: fmt.Sprint(id)}
	row, _ := value.(map[string]any)
	status := fmt.Sprint(row["status"])
	var message proto.Message
	switch aggregate {
	case "service":
		message = &catalogeventsv1.ServiceChanged{Metadata: metadata, ProviderId: fmt.Sprint(row["provider_id"]), ServiceId: fmt.Sprint(id), Status: status, ChangeType: eventType}
	case "coupon":
		message = &catalogeventsv1.CouponChanged{Metadata: metadata, CouponId: fmt.Sprint(id), Status: status, ChangeType: eventType}
	case "category":
		message = &catalogeventsv1.CategoryChanged{Metadata: metadata, CategoryId: fmt.Sprint(id), Status: status, ChangeType: eventType}
	default:
		return fmt.Errorf("unsupported catalog aggregate %q", aggregate)
	}
	payload, err := proto.Marshal(message)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,occurred_at)VALUES($1,$2,$3,$4,1,$5,'{"content-type":"application/protobuf"}'::jsonb,$6)`, eventID, aggregate, fmt.Sprint(id), eventType, payload, now)
	return err
}
func translate(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return catalog.ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if strings.HasPrefix(pgErr.Code, "23") {
			return catalog.ErrConflict
		}
	}
	return err
}
func nullable(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}
func jsonValue(value any) []byte { encoded, _ := json.Marshal(value); return encoded }
func jsonRaw(value json.RawMessage) any {
	if len(value) == 0 || string(value) == "null" {
		return nil
	}
	return []byte(value)
}
func toInt64(value any) int64 {
	switch number := value.(type) {
	case int64:
		return number
	case int32:
		return int64(number)
	}
	return 0
}
