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
	"github.com/nihfery/takein/services/customer-service/internal/customer"
)

type Handler struct {
	service   *customer.Service
	validator *jwtauth.Validator
}

func New(service *customer.Service, validator *jwtauth.Validator) *Handler {
	return &Handler{service: service, validator: validator}
}
func (h *Handler) RegisterRoutes(engine *gin.Engine) {
	api := engine.Group("/api")
	owned := api.Group("/customer", h.validator.Middleware("customer"))
	owned.GET("/profile", h.profile)
	owned.PUT("/profile", h.updateProfile)
	owned.GET("/activity/summary", h.summary)
	owned.GET("/activity", h.activity)
	owned.GET("/favorites", h.favorites)
	owned.POST("/favorites", h.addFavorite)
	owned.DELETE("/favorites/:branch", h.removeFavorite)
	owned.POST("/bookings/code/:bookingCode/review", h.review)
	providerRoutes := api.Group("/provider", h.validator.Middleware("provider"))
	providerRoutes.GET("/customers", h.providerCustomers)
	providerRoutes.GET("/reviews", h.providerReviews)
	admin := api.Group("/admin/customers", h.validator.Middleware("admin"))
	admin.GET("", h.list)
	admin.GET("/:customer", h.show)
	admin.DELETE("/:customer", h.delete)
	admin.PATCH("/:customer/toggle-status", h.toggle)
}
func (h *Handler) profile(c *gin.Context) {
	id, ok := actorID(c)
	if !ok {
		return
	}
	value, err := h.service.Profile(c.Request.Context(), id)
	respond(c, value, err)
}
func (h *Handler) updateProfile(c *gin.Context) {
	id, ok := actorID(c)
	if !ok {
		return
	}
	var request struct {
		Name         string `json:"name" binding:"required,max=255"`
		Email        string `json:"email" binding:"required,email,max=255"`
		PhoneNumber  string `json:"phone_number" binding:"max=255"`
		Gender       string `json:"gender" binding:"omitempty,oneof=male female other"`
		DateOfBirth  string `json:"date_of_birth"`
		Religion     string `json:"religion" binding:"max=100"`
		Allergies    string `json:"allergies" binding:"max=2000"`
		AddressLine1 string `json:"address_line_1" binding:"max=2000"`
		AddressLine2 string `json:"address_line_2" binding:"max=2000"`
		City         string `json:"city" binding:"max=255"`
		State        string `json:"state" binding:"max=255"`
		Country      string `json:"country" binding:"max=255"`
	}
	if !bind(c, &request) {
		return
	}
	value, err := h.service.UpdateProfile(c.Request.Context(), id, customer.ProfileInput{Name: request.Name, Email: request.Email, PhoneNumber: request.PhoneNumber, Gender: request.Gender, DateOfBirth: request.DateOfBirth, Religion: request.Religion, Allergies: request.Allergies, AddressLine1: request.AddressLine1, AddressLine2: request.AddressLine2, City: request.City, State: request.State, Country: request.Country})
	respond(c, value, err)
}
func (h *Handler) summary(c *gin.Context) {
	id, ok := actorID(c)
	if !ok {
		return
	}
	value, err := h.service.Repository().ActivitySummary(c.Request.Context(), id)
	respond(c, value, err)
}
func (h *Handler) activity(c *gin.Context) {
	id, ok := actorID(c)
	if !ok {
		return
	}
	limit := int32(50)
	offset := int32(0)
	items, err := h.service.Repository().Activity(c.Request.Context(), id, limit, offset)
	respond(c, items, err)
}
func (h *Handler) favorites(c *gin.Context) {
	id, ok := actorID(c)
	if !ok {
		return
	}
	items, err := h.service.Repository().Favorites(c.Request.Context(), id)
	respond(c, items, err)
}
func (h *Handler) addFavorite(c *gin.Context) {
	id, ok := actorID(c)
	if !ok {
		return
	}
	var request struct {
		BranchID int64 `json:"branch_id" binding:"required,gt=0"`
	}
	if !bind(c, &request) {
		return
	}
	if err := h.service.Repository().AddFavorite(c.Request.Context(), id, request.BranchID); err != nil {
		respond(c, nil, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"branch_id": request.BranchID}})
}
func (h *Handler) removeFavorite(c *gin.Context) {
	id, ok := actorID(c)
	if !ok {
		return
	}
	branchID, ok := idParam(c, "branch")
	if !ok {
		return
	}
	if err := h.service.Repository().RemoveFavorite(c.Request.Context(), id, branchID); err != nil {
		respond(c, nil, err)
		return
	}
	c.Status(http.StatusNoContent)
}
func (h *Handler) review(c *gin.Context) {
	userID, ok := actorID(c)
	if !ok {
		return
	}
	var request struct {
		Rating         int32    `json:"rating" form:"rating" binding:"required"`
		Comment        string   `json:"comment" form:"comment" binding:"max=1000"`
		StaffID        *int64   `json:"staff_id" form:"staff_id"`
		StaffRating    *int32   `json:"staff_rating" form:"staff_rating"`
		StaffComment   string   `json:"staff_comment" form:"staff_comment" binding:"max=1000"`
		ImageObjectIDs []string `json:"image_object_ids"`
	}
	if !bind(c, &request) {
		return
	}
	if !customer.ValidRating(request.Rating) {
		invalid(c, "rating", "Rating must be between 1 and 5.")
		return
	}
	if strings.HasPrefix(c.ContentType(), "multipart/form-data") {
		objectIDs, uploaded := h.uploadReviewImages(c)
		if !uploaded {
			return
		}
		request.ImageObjectIDs = objectIDs
	}
	value, err := h.service.CreateReview(c.Request.Context(), userID, c.Param("bookingCode"), customer.ReviewInput{Rating: request.Rating, Comment: request.Comment, StaffID: request.StaffID, StaffRating: request.StaffRating, StaffComment: request.StaffComment, ImageObjectIDs: request.ImageObjectIDs})
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Thank you, your review has been submitted.", "data": value})
}
func (h *Handler) list(c *gin.Context) {
	items, err := h.service.Repository().List(c.Request.Context())
	respond(c, items, err)
}
func (h *Handler) show(c *gin.Context) {
	id, ok := idParam(c, "customer")
	if !ok {
		return
	}
	value, err := h.service.Repository().ByID(c.Request.Context(), id)
	respond(c, value, err)
}
func (h *Handler) delete(c *gin.Context) {
	id, ok := idParam(c, "customer")
	if !ok {
		return
	}
	err := h.service.Repository().Delete(c.Request.Context(), id)
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.Status(http.StatusNoContent)
}
func (h *Handler) toggle(c *gin.Context) {
	id, ok := idParam(c, "customer")
	if !ok {
		return
	}
	value, err := h.service.Repository().Toggle(c.Request.Context(), id)
	respond(c, value, err)
}

func (h *Handler) providerCustomers(c *gin.Context) {
	providerID, branchID, ok := providerScope(c, "customers", "bookings")
	if !ok {
		return
	}
	value, err := h.service.Repository().ListProviderCustomers(c.Request.Context(), providerID, branchID, c.Query("search"))
	respond(c, value, err)
}

func (h *Handler) providerReviews(c *gin.Context) {
	providerID, branchID, ok := providerScope(c, "reviews")
	if !ok {
		return
	}
	var rating *int32
	if raw := strings.TrimSpace(c.Query("rating")); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 32)
		if err != nil || parsed < 1 || parsed > 5 {
			invalid(c, "rating", "Rating must be between 1 and 5.")
			return
		}
		value := int32(parsed)
		rating = &value
	}
	value, err := h.service.Repository().ListProviderReviews(c.Request.Context(), providerID, branchID, rating)
	respond(c, value, err)
}

func providerScope(c *gin.Context, permissions ...string) (int64, *int64, bool) {
	actor, ok := authcontext.ActorFrom(c.Request.Context())
	if !ok || actor.Role != "provider" {
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden."})
		return 0, nil, false
	}
	providerID, err := strconv.ParseInt(actor.ProviderID, 10, 64)
	if err != nil || providerID <= 0 {
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden."})
		return 0, nil, false
	}
	if actor.BranchID == "" {
		return providerID, nil, true
	}
	allowed := false
	for _, expected := range permissions {
		for _, actual := range actor.Permissions {
			if actual == expected {
				allowed = true
			}
		}
	}
	branchID, branchErr := strconv.ParseInt(actor.BranchID, 10, 64)
	if !allowed || branchErr != nil || branchID <= 0 {
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden."})
		return 0, nil, false
	}
	return providerID, &branchID, true
}
func actorID(c *gin.Context) (int64, bool) {
	actor, ok := authcontext.ActorFrom(c.Request.Context())
	if !ok {
		return 0, false
	}
	id, err := strconv.ParseInt(actor.UserID, 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Unauthenticated."})
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
		invalid(c, "request", err.Error())
		return false
	}
	return true
}

func (h *Handler) uploadReviewImages(c *gin.Context) ([]string, bool) {
	form, err := c.MultipartForm()
	if err != nil {
		invalid(c, "images", "The uploaded files are invalid.")
		return nil, false
	}
	files := form.File["images"]
	if len(files) > 5 {
		invalid(c, "images", "No more than five images may be uploaded.")
		return nil, false
	}
	objectIDs := make([]string, 0, len(files))
	for _, header := range files {
		const maxBytes int64 = 4 << 20
		if header.Size <= 0 || header.Size > maxBytes {
			invalid(c, "images", "Each image must be JPEG, PNG, or WebP and no larger than 4 MiB.")
			return nil, false
		}
		file, openErr := header.Open()
		if openErr != nil {
			invalid(c, "images", "The uploaded files are invalid.")
			return nil, false
		}
		content, readErr := io.ReadAll(io.LimitReader(file, maxBytes+1))
		_ = file.Close()
		contentType := http.DetectContentType(content)
		if readErr != nil || int64(len(content)) > maxBytes || contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" {
			invalid(c, "images", "Each image must be JPEG, PNG, or WebP and no larger than 4 MiB.")
			return nil, false
		}
		objectID, storeErr := h.service.StoreReviewMedia(c.Request.Context(), header.Filename, contentType, content)
		if storeErr != nil {
			respond(c, nil, storeErr)
			return nil, false
		}
		objectIDs = append(objectIDs, objectID)
	}
	return objectIDs, true
}
func invalid(c *gin.Context, field, message string) {
	c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid.", "errors": gin.H{field: []string{message}}})
}
func respond(c *gin.Context, value any, err error) {
	if err == nil {
		c.JSON(http.StatusOK, gin.H{"data": value})
		return
	}
	switch {
	case errors.Is(err, customer.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"message": "Not found."})
	case errors.Is(err, customer.ErrConflict):
		c.JSON(http.StatusConflict, gin.H{"message": "Resource conflict."})
	case errors.Is(err, customer.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden."})
	case errors.Is(err, customer.ErrValidation):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid."})
	case errors.Is(err, customer.ErrReviewIneligible), strings.HasPrefix(err.Error(), customer.ErrReviewIneligible.Error()+":"):
		message := strings.TrimSpace(strings.TrimPrefix(err.Error(), customer.ErrReviewIneligible.Error()+":"))
		if message == "" {
			message = "Review is not eligible."
		}
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": message})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"message": "An internal error occurred."})
	}
}
