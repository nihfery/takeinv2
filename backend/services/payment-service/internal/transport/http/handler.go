package httptransport

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/jwtauth"
	"github.com/nihfery/takein/services/payment-service/internal/payment"
)

type Handler struct {
	service   *payment.Service
	validator *jwtauth.Validator
}

func New(service *payment.Service, validator *jwtauth.Validator) *Handler {
	return &Handler{service: service, validator: validator}
}
func (h *Handler) RegisterRoutes(engine *gin.Engine) {
	api := engine.Group("/api")
	customer := api.Group("/customer/bookings", h.validator.Middleware("customer"))
	customer.POST("/:booking/payment/charge", h.charge)
	customer.GET("/:booking/payment/status", h.status)
	customer.POST("/code/:bookingCode/payment/confirm", h.confirmByCode)
	providerPayments := api.Group("/provider/payments", h.validator.Middleware("provider"))
	providerPayments.GET("", h.providerList)
	api.POST("/midtrans/notification", h.notification)
}

func (h *Handler) providerList(c *gin.Context) {
	requestActor, ok := authcontext.ActorFrom(c.Request.Context())
	if !ok || requestActor.Role != "provider" {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Unauthenticated."})
		return
	}
	providerID, err := strconv.ParseInt(requestActor.ProviderID, 10, 64)
	if err != nil || providerID <= 0 {
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden."})
		return
	}
	if requestActor.BranchID != "" && !hasPermission(requestActor.Permissions, "payments") {
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden."})
		return
	}
	filter := payment.ProviderFilter{ProviderID: providerID, Status: strings.TrimSpace(c.Query("status")), PaymentType: strings.TrimSpace(c.Query("payment_type"))}
	if requestActor.BranchID != "" {
		branchID, parseErr := strconv.ParseInt(requestActor.BranchID, 10, 64)
		if parseErr != nil || branchID <= 0 {
			c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden."})
			return
		}
		filter.BranchID = &branchID
	} else if rawBranchID := strings.TrimSpace(c.Query("branch_id")); rawBranchID != "" {
		branchID, parseErr := strconv.ParseInt(rawBranchID, 10, 64)
		if parseErr != nil || branchID <= 0 {
			invalid(c, "branch_id", "The branch identifier is invalid.")
			return
		}
		filter.BranchID = &branchID
	}
	if filter.Status != "" && !oneOf(filter.Status, "unpaid", "pending", "paid", "failed", "refunded", "expired", "cancelled") {
		invalid(c, "status", "The selected status is invalid.")
		return
	}
	if filter.PaymentType != "" && !oneOf(filter.PaymentType, "dp", "full_payment", "pay_at_salon") {
		invalid(c, "payment_type", "The selected payment type is invalid.")
		return
	}
	items, err := h.service.Repository().ListProvider(c.Request.Context(), filter)
	respond(c, items, err)
}

func hasPermission(permissions []string, expected string) bool {
	for _, permission := range permissions {
		if strings.EqualFold(permission, expected) {
			return true
		}
	}
	return false
}

func oneOf(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}
func (h *Handler) charge(c *gin.Context) {
	bookingID, ok := idParam(c, "booking")
	if !ok {
		return
	}
	customerID, valid := actorID(c)
	if !valid {
		return
	}
	key := strings.TrimSpace(c.GetHeader("Idempotency-Key"))
	if key == "" {
		// The legacy/OpenAPI client does not require this header. Deriving a stable
		// key from the owned booking preserves safe retries without widening the
		// public contract.
		key = "booking-" + strconv.FormatInt(bookingID, 10)
	}
	var request struct {
		PaymentChannel string `json:"payment_channel"`
	}
	if c.Request.ContentLength != 0 && !bind(c, &request) {
		return
	}
	input := payment.ChargeInput{PaymentChannel: request.PaymentChannel}
	input.BookingID = bookingID
	input.CustomerID = customerID
	input.IdempotencyKey = key
	value, err := h.service.Charge(c.Request.Context(), input)
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": value})
}
func (h *Handler) status(c *gin.Context) {
	bookingID, ok := idParam(c, "booking")
	if !ok {
		return
	}
	customerID, valid := actorID(c)
	if !valid {
		return
	}
	value, err := h.service.Status(c.Request.Context(), bookingID, customerID)
	respond(c, value, err)
}
func (h *Handler) confirmByCode(c *gin.Context) {
	customerID, ok := actorID(c)
	if !ok {
		return
	}
	value, bookingStatus, err := h.service.ManualConfirm(c.Request.Context(), c.Param("bookingCode"), customerID)
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Payment confirmed successfully.", "data": gin.H{"booking_code": c.Param("bookingCode"), "status": bookingStatus, "payment_status": value.Status, "payment": value}})
}
func (h *Handler) notification(c *gin.Context) {
	raw, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	if err != nil {
		respond(c, nil, err)
		return
	}
	var value payment.Notification
	if err = json.Unmarshal(raw, &value); err != nil {
		invalid(c, "request", "Invalid JSON payload.")
		return
	}
	processed, replay, err := h.service.Webhook(c.Request.Context(), value, raw)
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Notification processed.", "data": processed, "replay": replay})
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
	if err := c.ShouldBindJSON(value); err != nil {
		invalid(c, "request", err.Error())
		return false
	}
	return true
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
	case errors.Is(err, payment.ErrInvalidSignature):
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Invalid notification signature."})
	case errors.Is(err, payment.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden."})
	case errors.Is(err, payment.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"message": "Not found."})
	case errors.Is(err, payment.ErrConflict):
		c.JSON(http.StatusConflict, gin.H{"message": "Payment conflict."})
	case errors.Is(err, payment.ErrManualDisabled):
		c.JSON(http.StatusConflict, gin.H{"message": "Manual payment confirmation is disabled. Payment status must be verified by the gateway."})
	case errors.Is(err, payment.ErrPayAtSalon), errors.Is(err, payment.ErrAlreadyPaid):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": err.Error()})
	case errors.Is(err, payment.ErrInvalidTransition):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "Invalid payment status transition."})
	default:
		c.JSON(http.StatusBadGateway, gin.H{"message": "Payment gateway is unavailable."})
	}
}
