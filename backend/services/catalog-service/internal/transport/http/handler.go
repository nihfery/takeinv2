package httptransport

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/jwtauth"
	"github.com/nihfery/takein/services/catalog-service/internal/catalog"
)

type Handler struct {
	service   *catalog.Service
	validator *jwtauth.Validator
}

func New(service *catalog.Service, validator *jwtauth.Validator) *Handler {
	return &Handler{service: service, validator: validator}
}

func (h *Handler) RegisterRoutes(engine *gin.Engine) {
	api := engine.Group("/api")
	api.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "catalog-service"}) })
	api.GET("/readiness", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ready", "service": "catalog-service"}) })
	api.GET("/categories", h.publicCategories)
	api.GET("/locations", h.locations)
	api.GET("/reviews", h.reviews)
	api.GET("/branches", h.branches)
	api.GET("/branches/:branch", h.branch)
	api.GET("/branches/:branch/services", h.branchServices)
	api.GET("/branches/:branch/reviews", h.branchReviews)
	api.GET("/branches/:branch/staff", h.branchStaff)
	api.GET("/staff/:staff", h.staff)
	api.GET("/services", h.publicServices)
	api.GET("/services/:service", h.publicService)
	api.GET("/providers", h.providers)
	api.GET("/coupons", h.publicCoupons)
	api.POST("/coupons/validate", h.validateCoupon)
	owned := api.Group("/provider/services", h.validator.Middleware("provider"))
	owned.GET("", h.providerServices)
	owned.POST("", h.createService)
	owned.GET("/:service", h.providerService)
	owned.PUT("/:service", h.updateService)
	owned.PATCH("/:service", h.updateService)
	owned.DELETE("/:service", h.deleteService)
	owned.PUT("/:service/branch", h.updateServiceBranches)
	owned.PUT("/:service/gallery", h.updateServiceGallery)
	owned.PATCH("/:service/toggle-status", h.providerToggleService)
	adminCategories := api.Group("/admin/service-categories", h.validator.Middleware("admin"))
	adminCategories.GET("", h.adminCategories)
	adminCategories.POST("", h.createCategory)
	adminCategories.GET("/:serviceCategory", h.category)
	adminCategories.PUT("/:serviceCategory", h.updateCategory)
	adminCategories.PATCH("/:serviceCategory", h.updateCategory)
	adminCategories.DELETE("/:serviceCategory", h.deleteCategory)
	adminCategories.PATCH("/:serviceCategory/toggle-featured", h.toggleFeatured)
	adminCategories.PATCH("/:serviceCategory/toggle-status", h.toggleCategoryStatus)
	adminServices := api.Group("/admin/services", h.validator.Middleware("admin"))
	adminServices.GET("", h.adminServices)
	adminServices.GET("/:service", h.adminService)
	adminServices.PATCH("/:service/toggle-status", h.adminToggleService)
	adminCoupons := api.Group("/admin/coupons", h.validator.Middleware("admin"))
	adminCoupons.GET("", h.adminCoupons)
	adminCoupons.POST("", h.createCoupon)
	adminCoupons.GET("/:coupon", h.coupon)
	adminCoupons.PUT("/:coupon", h.updateCoupon)
	adminCoupons.PATCH("/:coupon", h.updateCoupon)
	adminCoupons.DELETE("/:coupon", h.deleteCoupon)
}

func (h *Handler) publicCategories(c *gin.Context) {
	items, err := h.service.Repository().ListCategories(c.Request.Context(), true)
	respond(c, items, err)
}
func (h *Handler) locations(c *gin.Context) {
	items, err := h.service.Repository().PublicLocations(c.Request.Context())
	respond(c, items, err)
}
func (h *Handler) reviews(c *gin.Context) {
	items, err := h.service.Repository().PublicReviews(c.Request.Context(), nil)
	respond(c, items, err)
}
func (h *Handler) branches(c *gin.Context) {
	items, err := h.service.Repository().PublicBranches(c.Request.Context(), nil)
	respond(c, items, err)
}
func (h *Handler) branch(c *gin.Context) {
	id, ok := idParam(c, "branch")
	if !ok {
		return
	}
	item, err := h.service.Repository().PublicBranch(c.Request.Context(), id)
	respond(c, item, err)
}
func (h *Handler) branchServices(c *gin.Context) {
	id, ok := idParam(c, "branch")
	if !ok {
		return
	}
	items, err := h.service.Repository().ListBranchServices(c.Request.Context(), id)
	respond(c, items, err)
}
func (h *Handler) branchReviews(c *gin.Context) {
	id, ok := idParam(c, "branch")
	if !ok {
		return
	}
	items, err := h.service.Repository().PublicReviews(c.Request.Context(), &id)
	respond(c, items, err)
}
func (h *Handler) branchStaff(c *gin.Context) {
	id, ok := idParam(c, "branch")
	if !ok {
		return
	}
	items, err := h.service.Repository().PublicStaff(c.Request.Context(), &id, nil)
	respond(c, items, err)
}
func (h *Handler) staff(c *gin.Context) {
	id, ok := idParam(c, "staff")
	if !ok {
		return
	}
	item, err := h.service.Repository().PublicStaffOne(c.Request.Context(), id)
	respond(c, item, err)
}
func (h *Handler) publicServices(c *gin.Context) {
	items, err := h.service.Repository().ListServices(c.Request.Context(), nil, true)
	respond(c, items, err)
}
func (h *Handler) publicService(c *gin.Context) {
	id, ok := idParam(c, "service")
	if !ok {
		return
	}
	item, err := h.service.Repository().Service(c.Request.Context(), id, nil, true)
	respond(c, item, err)
}
func (h *Handler) providers(c *gin.Context) {
	items, err := h.service.Repository().PublicProviders(c.Request.Context())
	respond(c, items, err)
}
func (h *Handler) publicCoupons(c *gin.Context) {
	items, err := h.service.Repository().ListCoupons(c.Request.Context(), true)
	respond(c, items, err)
}
func (h *Handler) validateCoupon(c *gin.Context) {
	var request struct {
		Code       string  `json:"coupon_code" binding:"required,max=100"`
		ServiceIDs []int64 `json:"service_ids" binding:"required,min=1,dive,gt=0"`
	}
	if !bind(c, &request) {
		return
	}
	summary, err := h.service.Repository().PriceSummary(c.Request.Context(), request.Code, request.ServiceIDs, "")
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Voucher berhasil diterapkan.", "data": priceSummaryResponse(summary)})
}

func (h *Handler) providerServices(c *gin.Context) {
	id, ok := providerID(c)
	if !ok {
		return
	}
	items, err := h.service.Repository().ListServices(c.Request.Context(), &id, false)
	respond(c, items, err)
}
func (h *Handler) createService(c *gin.Context) {
	providerID, ok := providerID(c)
	if !ok {
		return
	}
	var input catalog.ServiceInput
	if !bind(c, &input) {
		return
	}
	if objectID, ok := h.upload(c, "gallery_image", "service-gallery", 2<<20); !ok {
		return
	} else if objectID != "" {
		input.GalleryObjectIDs = []string{objectID}
	}
	if err := input.Normalize(); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid.", "errors": gin.H{"request": []string{err.Error()}}})
		return
	}
	if err := h.service.ValidateBranches(c.Request.Context(), providerID, input.BranchIDs); err != nil {
		respond(c, nil, err)
		return
	}
	if err := h.service.ValidateMedia(c.Request.Context(), input.GalleryObjectIDs); err != nil {
		respond(c, nil, err)
		return
	}
	item, err := h.service.Repository().CreateService(c.Request.Context(), providerID, input)
	created(c, item, err)
}
func (h *Handler) providerService(c *gin.Context) {
	providerID, ok := providerID(c)
	if !ok {
		return
	}
	id, valid := idParam(c, "service")
	if !valid {
		return
	}
	item, err := h.service.Repository().Service(c.Request.Context(), id, &providerID, false)
	respond(c, item, err)
}
func (h *Handler) updateService(c *gin.Context) {
	providerID, ok := providerID(c)
	if !ok {
		return
	}
	id, valid := idParam(c, "service")
	if !valid {
		return
	}
	var input catalog.ServiceInput
	if !bind(c, &input) {
		return
	}
	if objectID, ok := h.upload(c, "gallery_image", "service-gallery", 2<<20); !ok {
		return
	} else if objectID != "" {
		input.GalleryObjectIDs = []string{objectID}
	}
	if err := input.Normalize(); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid.", "errors": gin.H{"request": []string{err.Error()}}})
		return
	}
	if err := h.service.ValidateBranches(c.Request.Context(), providerID, input.BranchIDs); err != nil {
		respond(c, nil, err)
		return
	}
	if err := h.service.ValidateMedia(c.Request.Context(), input.GalleryObjectIDs); err != nil {
		respond(c, nil, err)
		return
	}
	item, err := h.service.Repository().UpdateService(c.Request.Context(), providerID, id, input)
	respond(c, item, err)
}
func (h *Handler) deleteService(c *gin.Context) {
	providerID, ok := providerID(c)
	if !ok {
		return
	}
	id, valid := idParam(c, "service")
	if !valid {
		return
	}
	err := h.service.Repository().DeleteService(c.Request.Context(), providerID, id)
	noContent(c, err)
}
func (h *Handler) updateServiceBranches(c *gin.Context) { h.updateJSON(c, "branch_ids") }
func (h *Handler) updateServiceGallery(c *gin.Context) {
	providerID, ok := providerID(c)
	if !ok {
		return
	}
	id, valid := idParam(c, "service")
	if !valid {
		return
	}
	var request struct {
		GalleryObjectIDs []string `json:"gallery_object_ids" form:"gallery_object_ids"`
		VideoURL         string   `json:"video_url" form:"video_url"`
	}
	if !bind(c, &request) {
		return
	}
	if objectID, uploaded := h.upload(c, "gallery_image", "service-gallery", 2<<20); !uploaded {
		return
	} else if objectID != "" {
		request.GalleryObjectIDs = []string{objectID}
	}
	if err := h.service.ValidateMedia(c.Request.Context(), request.GalleryObjectIDs); err != nil {
		respond(c, nil, err)
		return
	}
	item, err := h.service.Repository().UpdateServiceGallery(c.Request.Context(), providerID, id, request.GalleryObjectIDs, request.VideoURL)
	respond(c, item, err)
}
func (h *Handler) updateJSON(c *gin.Context, field string) {
	providerID, ok := providerID(c)
	if !ok {
		return
	}
	id, valid := idParam(c, "service")
	if !valid {
		return
	}
	request := map[string]any{}
	if !bind(c, &request) {
		return
	}
	value, exists := request[field]
	if !exists {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid."})
		return
	}
	if field == "branch_ids" {
		branchIDs, err := numericIDs(value)
		if err != nil {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid.", "errors": gin.H{"branch_ids": []string{"Branch IDs must be positive integers."}}})
			return
		}
		if err = h.service.ValidateBranches(c.Request.Context(), providerID, branchIDs); err != nil {
			respond(c, nil, err)
			return
		}
		value = branchIDs
	}
	item, err := h.service.Repository().UpdateServiceJSON(c.Request.Context(), providerID, id, field, value)
	respond(c, item, err)
}

func numericIDs(value any) ([]int64, error) {
	items, ok := value.([]any)
	if !ok {
		return nil, errors.New("identifier list is required")
	}
	result := make([]int64, 0, len(items))
	seen := map[int64]struct{}{}
	for _, item := range items {
		var id int64
		switch number := item.(type) {
		case float64:
			id = int64(number)
			if float64(id) != number {
				return nil, errors.New("identifier must be an integer")
			}
		case int64:
			id = number
		default:
			return nil, errors.New("identifier must be numeric")
		}
		if id <= 0 {
			return nil, errors.New("identifier must be positive")
		}
		if _, exists := seen[id]; !exists {
			seen[id] = struct{}{}
			result = append(result, id)
		}
	}
	return result, nil
}
func (h *Handler) providerToggleService(c *gin.Context) {
	providerID, ok := providerID(c)
	if !ok {
		return
	}
	id, valid := idParam(c, "service")
	if !valid {
		return
	}
	item, err := h.service.Repository().ToggleService(c.Request.Context(), id, &providerID)
	respond(c, item, err)
}

func (h *Handler) adminCategories(c *gin.Context) {
	items, err := h.service.Repository().ListCategories(c.Request.Context(), false)
	respond(c, items, err)
}
func (h *Handler) category(c *gin.Context) {
	id, ok := idParam(c, "serviceCategory")
	if !ok {
		return
	}
	item, err := h.service.Repository().Category(c.Request.Context(), id)
	respond(c, item, err)
}
func (h *Handler) createCategory(c *gin.Context) {
	var input catalog.CategoryInput
	if !bind(c, &input) {
		return
	}
	item, err := h.service.Repository().CreateCategory(c.Request.Context(), input)
	created(c, item, err)
}
func (h *Handler) updateCategory(c *gin.Context) {
	id, ok := idParam(c, "serviceCategory")
	if !ok {
		return
	}
	var input catalog.CategoryInput
	if !bind(c, &input) {
		return
	}
	item, err := h.service.Repository().UpdateCategory(c.Request.Context(), id, input)
	respond(c, item, err)
}
func (h *Handler) deleteCategory(c *gin.Context) {
	id, ok := idParam(c, "serviceCategory")
	if !ok {
		return
	}
	noContent(c, h.service.Repository().DeleteCategory(c.Request.Context(), id))
}
func (h *Handler) toggleFeatured(c *gin.Context) {
	id, ok := idParam(c, "serviceCategory")
	if !ok {
		return
	}
	item, err := h.service.Repository().ToggleCategory(c.Request.Context(), id, "featured")
	respond(c, item, err)
}
func (h *Handler) toggleCategoryStatus(c *gin.Context) {
	id, ok := idParam(c, "serviceCategory")
	if !ok {
		return
	}
	item, err := h.service.Repository().ToggleCategory(c.Request.Context(), id, "status")
	respond(c, item, err)
}
func (h *Handler) adminServices(c *gin.Context) {
	items, err := h.service.Repository().ListServices(c.Request.Context(), nil, false)
	respond(c, items, err)
}
func (h *Handler) adminService(c *gin.Context) {
	id, ok := idParam(c, "service")
	if !ok {
		return
	}
	item, err := h.service.Repository().Service(c.Request.Context(), id, nil, false)
	respond(c, item, err)
}
func (h *Handler) adminToggleService(c *gin.Context) {
	id, ok := idParam(c, "service")
	if !ok {
		return
	}
	item, err := h.service.Repository().ToggleService(c.Request.Context(), id, nil)
	respond(c, item, err)
}
func (h *Handler) adminCoupons(c *gin.Context) {
	items, err := h.service.Repository().ListCoupons(c.Request.Context(), false)
	respond(c, items, err)
}
func (h *Handler) coupon(c *gin.Context) {
	id, ok := idParam(c, "coupon")
	if !ok {
		return
	}
	item, err := h.service.Repository().Coupon(c.Request.Context(), id)
	respond(c, item, err)
}
func (h *Handler) createCoupon(c *gin.Context) {
	var input catalog.CouponInput
	if !bind(c, &input) {
		return
	}
	if err := input.Normalize(); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid.", "errors": gin.H{"request": []string{err.Error()}}})
		return
	}
	item, err := h.service.Repository().CreateCoupon(c.Request.Context(), input)
	created(c, item, err)
}
func (h *Handler) updateCoupon(c *gin.Context) {
	id, ok := idParam(c, "coupon")
	if !ok {
		return
	}
	var input catalog.CouponInput
	if !bind(c, &input) {
		return
	}
	if err := input.Normalize(); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid.", "errors": gin.H{"request": []string{err.Error()}}})
		return
	}
	item, err := h.service.Repository().UpdateCoupon(c.Request.Context(), id, input)
	respond(c, item, err)
}

func priceSummaryResponse(summary catalog.PriceSummary) gin.H {
	return gin.H{
		"coupon":               summary.Coupon,
		"subtotal":             float64(summary.SubtotalMinor) / 100,
		"eligible_subtotal":    float64(summary.EligibleSubtotalMinor) / 100,
		"discount_amount":      float64(summary.DiscountMinor) / 100,
		"after_discount":       float64(summary.SubtotalMinor-summary.DiscountMinor) / 100,
		"tax_rate":             0.05,
		"tax_amount":           float64(summary.TaxMinor) / 100,
		"payable_amount":       float64(summary.PayableMinor) / 100,
		"subtotal_minor":       summary.SubtotalMinor,
		"discount_minor":       summary.DiscountMinor,
		"tax_minor":            summary.TaxMinor,
		"payable_amount_minor": summary.PayableMinor,
	}
}
func (h *Handler) deleteCoupon(c *gin.Context) {
	id, ok := idParam(c, "coupon")
	if !ok {
		return
	}
	noContent(c, h.service.Repository().DeleteCoupon(c.Request.Context(), id))
}

func providerID(c *gin.Context) (int64, bool) {
	actor, ok := authcontext.ActorFrom(c.Request.Context())
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Unauthenticated."})
		return 0, false
	}
	id, err := strconv.ParseInt(actor.ProviderID, 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusForbidden, gin.H{"message": "Provider context is required."})
		return 0, false
	}
	return id, true
}
func idParam(c *gin.Context, name string) (int64, bool) {
	id, err := strconv.ParseInt(c.Param(name), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusNotFound, gin.H{"message": "Not found."})
		return 0, false
	}
	return id, true
}
func bind(c *gin.Context, value any) bool {
	if err := c.ShouldBind(value); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid.", "errors": gin.H{"request": []string{err.Error()}}})
		return false
	}
	return true
}

func (h *Handler) upload(c *gin.Context, field, purpose string, maxBytes int64) (string, bool) {
	if !strings.HasPrefix(c.ContentType(), "multipart/form-data") {
		return "", true
	}
	header, err := c.FormFile(field)
	if errors.Is(err, http.ErrMissingFile) {
		return "", true
	}
	if err != nil || header.Size <= 0 || header.Size > maxBytes {
		invalidUpload(c, field)
		return "", false
	}
	file, err := header.Open()
	if err != nil {
		invalidUpload(c, field)
		return "", false
	}
	defer func() { _ = file.Close() }()
	content, err := io.ReadAll(io.LimitReader(file, maxBytes+1))
	if err != nil || int64(len(content)) > maxBytes {
		invalidUpload(c, field)
		return "", false
	}
	contentType := http.DetectContentType(content)
	if contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" {
		invalidUpload(c, field)
		return "", false
	}
	objectID, err := h.service.StoreMedia(c.Request.Context(), purpose, header.Filename, contentType, content)
	if err != nil {
		respond(c, nil, err)
		return "", false
	}
	return objectID, true
}

func invalidUpload(c *gin.Context, field string) {
	c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid.", "errors": gin.H{field: []string{"The uploaded file is invalid."}}})
}
func created(c *gin.Context, value any, err error) {
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": value})
}
func noContent(c *gin.Context, err error) {
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.Status(http.StatusNoContent)
}
func respond(c *gin.Context, value any, err error) {
	if err == nil {
		c.JSON(http.StatusOK, gin.H{"data": value})
		return
	}
	switch {
	case errors.Is(err, catalog.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden."})
	case errors.Is(err, catalog.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"message": "Not found."})
	case errors.Is(err, catalog.ErrValidation), errors.Is(err, catalog.ErrInvalidCoupon):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid.", "errors": gin.H{"request": []string{err.Error()}}})
	case errors.Is(err, catalog.ErrConflict):
		c.JSON(http.StatusConflict, gin.H{"message": "Resource conflict."})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"message": "An internal error occurred."})
	}
}
