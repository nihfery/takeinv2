package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"math/big"
	"regexp"
	"strings"
	"time"
)

type CategoryInput struct {
	ParentID    *int64 `json:"parent_id"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description"`
	Status      string `json:"status"`
	Featured    *bool  `json:"is_featured"`
}
type ServiceInput struct {
	Title              string          `json:"title" form:"title"`
	Slug               string          `json:"slug" form:"slug"`
	Category           string          `json:"category" form:"category"`
	CategoryID         *int64          `json:"category_id" form:"category_id"`
	Code               string          `json:"code" form:"code"`
	Description        string          `json:"description" form:"description"`
	Includes           string          `json:"includes" form:"includes"`
	PriceType          string          `json:"price_type" form:"price_type"`
	Price              json.Number     `json:"price" form:"price"`
	PriceMinor         int64           `json:"price_minor" form:"price_minor"`
	MinimumDuration    int32           `json:"minimum_duration" form:"minimum_duration"`
	Duration           int32           `json:"estimated_duration" form:"estimated_duration"`
	MaximumDuration    int32           `json:"maximum_duration" form:"maximum_duration"`
	QueueEnabled       *bool           `json:"is_queue_enabled" form:"is_queue_enabled"`
	ScheduledEnabled   *bool           `json:"is_scheduled_enabled" form:"is_scheduled_enabled"`
	RequiresDP         *bool           `json:"requires_dp" form:"requires_dp"`
	DPAmount           json.Number     `json:"dp_amount" form:"dp_amount"`
	DPAmountMinor      *int64          `json:"-"`
	PaymentPolicy      string          `json:"payment_policy" form:"payment_policy"`
	Slots              json.RawMessage `json:"slots" form:"slots"`
	AdditionalServices json.RawMessage `json:"additional_services" form:"additional_services"`
	Holidays           json.RawMessage `json:"holidays" form:"holidays"`
	Status             string          `json:"status" form:"status"`
	VerifyStatus       string          `json:"verify_status" form:"verify_status"`
	BranchIDs          []int64         `json:"branch_ids" form:"branch_ids"`
	GalleryObjectIDs   []string        `json:"gallery_object_ids" form:"gallery_object_ids"`
	VideoURL           string          `json:"video_url" form:"video_url"`
}

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

func (input *ServiceInput) Normalize() error {
	input.Title = strings.TrimSpace(input.Title)
	input.Category = strings.TrimSpace(input.Category)
	if input.Title == "" || input.Category == "" {
		return errors.New("title and category are required")
	}
	if input.Price != "" {
		minor, err := decimalMinor(input.Price)
		if err != nil {
			return errors.New("price must have at most two decimal places")
		}
		input.PriceMinor = minor
	}
	if input.PriceMinor < 0 {
		return errors.New("price cannot be negative")
	}
	if input.DPAmount != "" {
		minor, err := decimalMinor(input.DPAmount)
		if err != nil || minor < 0 {
			return errors.New("dp_amount must be a non-negative amount with at most two decimal places")
		}
		input.DPAmountMinor = &minor
	}
	if input.Duration <= 0 {
		input.Duration = 30
	}
	if input.MaximumDuration <= 0 {
		input.MaximumDuration = input.Duration
	}
	if input.MinimumDuration < 0 || input.MaximumDuration < input.Duration || input.Duration < input.MinimumDuration {
		return errors.New("service durations are inconsistent")
	}
	if strings.TrimSpace(input.Slug) == "" {
		input.Slug = strings.Trim(nonSlug.ReplaceAllString(strings.ToLower(input.Title), "-"), "-")
	}
	if input.Slug == "" {
		return errors.New("title cannot produce an empty slug")
	}
	return nil
}

func decimalMinor(value json.Number) (int64, error) {
	ratio, ok := new(big.Rat).SetString(value.String())
	if !ok || ratio.Sign() < 0 {
		return 0, errors.New("invalid amount")
	}
	ratio.Mul(ratio, big.NewRat(100, 1))
	if !ratio.IsInt() || !ratio.Num().IsInt64() {
		return 0, errors.New("amount is not representable in minor units")
	}
	return ratio.Num().Int64(), nil
}

type CouponInput struct {
	Code        string      `json:"code"`
	ProductType string      `json:"product_type"`
	ProductIDs  []int64     `json:"product_ids"`
	Type        string      `json:"coupon_type"`
	Value       json.Number `json:"coupon_value"`
	ValueMinor  int64       `json:"value_minor"`
	Quantity    *int32      `json:"quantity"`
	StartDate   string      `json:"start_date"`
	EndDate     string      `json:"end_date"`
	Status      string      `json:"status"`
}

func (input *CouponInput) Normalize() error {
	input.Code = strings.ToUpper(strings.TrimSpace(input.Code))
	if input.Value == "" {
		return errors.New("coupon_value is required")
	}
	minor, err := decimalMinor(input.Value)
	if err != nil {
		return errors.New("coupon_value must have at most two decimal places")
	}
	input.ValueMinor = minor
	if input.Code == "" || len(input.Code) > 100 || input.ProductType != "all" && input.ProductType != "service" && input.ProductType != "category" || input.Type != "fixed" && input.Type != "percentage" || input.ValueMinor < 0 {
		return errors.New("coupon fields are invalid")
	}
	if input.Type == "percentage" && input.ValueMinor > 10_000 {
		return errors.New("percentage coupon cannot exceed 100 percent")
	}
	if input.Quantity != nil && *input.Quantity < 1 {
		return errors.New("quantity must be at least one")
	}
	start, startErr := time.Parse("2006-01-02", input.StartDate)
	end, endErr := time.Parse("2006-01-02", input.EndDate)
	if startErr != nil || endErr != nil || end.Before(start) {
		return errors.New("coupon dates are invalid")
	}
	if input.Status == "" {
		input.Status = "active"
	}
	if input.Status != "active" && input.Status != "inactive" {
		return errors.New("coupon status is invalid")
	}
	if input.ProductType == "all" {
		input.ProductIDs = nil
		return nil
	}
	unique := make([]int64, 0, len(input.ProductIDs))
	seen := make(map[int64]struct{}, len(input.ProductIDs))
	for _, id := range input.ProductIDs {
		if id <= 0 {
			return errors.New("product_ids must contain positive identifiers")
		}
		if _, exists := seen[id]; !exists {
			seen[id] = struct{}{}
			unique = append(unique, id)
		}
	}
	input.ProductIDs = unique
	if len(input.ProductIDs) == 0 {
		return errors.New("product_ids are required for scoped coupons")
	}
	return nil
}

type PriceSummary struct {
	SubtotalMinor         int64
	EligibleSubtotalMinor int64
	DiscountMinor         int64
	TaxMinor              int64
	PayableMinor          int64
	Coupon                map[string]any
}
type Snapshot struct {
	ID, ProviderID                 int64
	Title, Currency                string
	PriceMinor, DPAmountMinor      int64
	Duration                       int32
	QueueEnabled, ScheduledEnabled bool
	RequiresDP                     bool
}
type ProviderClient interface {
	ValidateBranches(context.Context, int64, []int64) error
}
type MediaClient interface {
	Store(context.Context, string, string, string, []byte, string) (string, error)
	Reference(context.Context, string) error
}

type Repository interface {
	ListCategories(context.Context, bool) ([]map[string]any, error)
	Category(context.Context, int64) (map[string]any, error)
	CreateCategory(context.Context, CategoryInput) (map[string]any, error)
	UpdateCategory(context.Context, int64, CategoryInput) (map[string]any, error)
	ToggleCategory(context.Context, int64, string) (map[string]any, error)
	DeleteCategory(context.Context, int64) error
	ListServices(context.Context, *int64, bool) ([]map[string]any, error)
	ListBranchServices(context.Context, int64) ([]map[string]any, error)
	Service(context.Context, int64, *int64, bool) (map[string]any, error)
	CreateService(context.Context, int64, ServiceInput) (map[string]any, error)
	UpdateService(context.Context, int64, int64, ServiceInput) (map[string]any, error)
	UpdateServiceJSON(context.Context, int64, int64, string, any) (map[string]any, error)
	UpdateServiceGallery(context.Context, int64, int64, []string, string) (map[string]any, error)
	ToggleService(context.Context, int64, *int64) (map[string]any, error)
	DeleteService(context.Context, int64, int64) error
	ListCoupons(context.Context, bool) ([]map[string]any, error)
	Coupon(context.Context, int64) (map[string]any, error)
	CouponByCode(context.Context, string) (map[string]any, error)
	ValidateCoupon(context.Context, string, int64) (map[string]any, error)
	PriceSummary(context.Context, string, []int64, string) (PriceSummary, error)
	ReleaseCoupon(context.Context, string) (bool, error)
	CreateCoupon(context.Context, CouponInput) (map[string]any, error)
	UpdateCoupon(context.Context, int64, CouponInput) (map[string]any, error)
	DeleteCoupon(context.Context, int64) error
	PublicProviders(context.Context) ([]map[string]any, error)
	PublicBranches(context.Context, *int64) ([]map[string]any, error)
	PublicBranch(context.Context, int64) (map[string]any, error)
	PublicStaff(context.Context, *int64, *int64) ([]map[string]any, error)
	PublicStaffOne(context.Context, int64) (map[string]any, error)
	PublicReviews(context.Context, *int64) ([]map[string]any, error)
	PublicLocations(context.Context) ([]map[string]any, error)
	ServiceSnapshots(context.Context, int64, int64, []int64) ([]Snapshot, error)
}

type Service struct {
	repository Repository
	provider   ProviderClient
	media      MediaClient
}

func NewService(repository Repository) *Service            { return &Service{repository: repository} }
func (s *Service) Repository() Repository                  { return s.repository }
func (s *Service) ConfigureProvider(client ProviderClient) { s.provider = client }
func (s *Service) ConfigureMedia(client MediaClient)       { s.media = client }
func (s *Service) ValidateBranches(ctx context.Context, providerID int64, branchIDs []int64) error {
	if len(branchIDs) == 0 {
		return nil
	}
	if s.provider == nil {
		return ErrConflict
	}
	return s.provider.ValidateBranches(ctx, providerID, branchIDs)
}

func (s *Service) StoreMedia(ctx context.Context, purpose, fileName, contentType string, content []byte) (string, error) {
	if s.media == nil {
		return "", errors.New("media service is unavailable")
	}
	return s.media.Store(ctx, purpose, fileName, contentType, content, "public")
}

func (s *Service) ValidateMedia(ctx context.Context, objectIDs []string) error {
	if len(objectIDs) == 0 {
		return nil
	}
	if s.media == nil {
		return errors.New("media service is unavailable")
	}
	for _, objectID := range objectIDs {
		if err := s.media.Reference(ctx, objectID); err != nil {
			return err
		}
	}
	return nil
}
