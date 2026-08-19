package httptransport

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/jwtauth"
	"github.com/nihfery/takein/services/booking-service/internal/booking"
)

type Handler struct {
	service   *booking.Service
	validator *jwtauth.Validator
}

func New(service *booking.Service, validator *jwtauth.Validator) *Handler {
	return &Handler{service: service, validator: validator}
}
func (h *Handler) RegisterRoutes(engine *gin.Engine) {
	api := engine.Group("/api")
	public := api.Group("/customer")
	public.POST("/booking/eligible-staff", h.eligibleStaff)
	public.POST("/booking/check-availability", h.validator.OptionalMiddleware("customer"), h.availability)
	public.POST("/booking/interaction", h.interaction)
	public.POST("/graphql", h.validator.OptionalMiddleware("customer"), h.graphql)
	customer := api.Group("/customer", h.validator.Middleware("customer"))
	customer.GET("/bookings", h.list)
	customer.POST("/bookings", h.create)
	customer.POST("/bookings/:booking/finalize", h.finalize)
	customer.POST("/bookings/:booking/hold/extend", h.extend)
	customer.GET("/bookings/code/:bookingCode", h.byCode)
	customer.GET("/bookings/:booking", h.byID)
	customer.PATCH("/bookings/:booking/reschedule", h.reschedule)
	customer.PATCH("/bookings/:booking/cancel", h.cancel)
	admin := api.Group("/admin/bookings", h.validator.Middleware("admin"))
	admin.GET("", h.adminList)
	admin.GET("/:booking", h.adminShow)
	admin.PATCH("/:booking/status", h.adminStatus)
	provider := api.Group("/provider/bookings", h.validator.Middleware("provider"))
	provider.GET("", h.providerList)
	provider.GET("/calendar", h.providerCalendar)
	provider.GET("/queue", h.providerQueue)
	provider.GET("/:booking", h.providerShow)
	provider.PATCH("/:booking", h.providerUpdate)
	provider.POST("/walk-in/availability", h.providerAvailability)
	provider.POST("/walk-in", h.providerCreateWalkIn)
	provider.POST("/:booking/call", h.providerAction("call", "queue"))
	provider.POST("/:booking/check-in", h.providerAction("check-in", "bookings"))
	provider.POST("/:booking/start", h.providerAction("start", "bookings"))
	provider.POST("/:booking/complete", h.providerAction("complete", "bookings"))
	provider.POST("/:booking/cancel", h.providerAction("cancel", "bookings"))
	provider.POST("/:booking/no-show", h.providerAction("no-show", "bookings"))
}

type availabilityRequest struct {
	BranchID         int64   `json:"branch_id" binding:"required"`
	ServiceIDs       []int64 `json:"service_ids" binding:"required,min=1"`
	BookingDate      string  `json:"booking_date"`
	StaffID          *int64  `json:"staff_id"`
	HeldBookingID    *int64  `json:"held_booking_id"`
	BookingType      string  `json:"booking_type" binding:"omitempty,oneof=scheduled queue"`
	ParticipantCount int32   `json:"participant_count" binding:"omitempty,min=1,max=5"`
}

func (request availabilityRequest) query() booking.AvailabilityQuery {
	return booking.AvailabilityQuery{BranchID: request.BranchID, ServiceIDs: request.ServiceIDs, BookingDate: request.BookingDate, StaffID: request.StaffID, HeldBookingID: request.HeldBookingID, BookingType: request.BookingType, ParticipantCount: request.ParticipantCount}
}

func (h *Handler) eligibleStaff(c *gin.Context) {
	var request availabilityRequest
	if !bind(c, &request) {
		return
	}
	items, err := h.service.LookupAvailability(c.Request.Context(), request.query(), false)
	c.Header("Cache-Control", "private, max-age=15")
	c.Header("Pragma", "cache")
	respond(c, items, err)
}
func (h *Handler) availability(c *gin.Context) {
	var request availabilityRequest
	if !bind(c, &request) {
		return
	}
	value, err := h.service.LookupAvailability(c.Request.Context(), request.query(), true)
	c.Header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	c.Header("Pragma", "no-cache")
	respond(c, value, err)
}
func (h *Handler) interaction(c *gin.Context) {
	var request struct {
		Event       string  `json:"event" binding:"required,oneof=service_selected staff_selected date_selected slot_selected continue_to_confirm"`
		BranchID    *int64  `json:"branch_id"`
		ServiceIDs  []int64 `json:"service_ids"`
		StaffID     *int64  `json:"staff_id"`
		BookingDate string  `json:"booking_date"`
		StartTime   string  `json:"start_time"`
	}
	if !bind(c, &request) {
		return
	}
	c.Status(http.StatusNoContent)
}
func (h *Handler) list(c *gin.Context) {
	customerID, ok := customerID(c)
	if !ok {
		return
	}
	items, err := h.service.Repository().ListCustomer(c.Request.Context(), customerID)
	respond(c, items, err)
}
func (h *Handler) create(c *gin.Context) {
	customerID, ok := customerID(c)
	if !ok {
		return
	}
	var request booking.CreateRequest
	if !bind(c, &request) {
		return
	}
	key := strings.TrimSpace(c.GetHeader("Idempotency-Key"))
	if key == "" {
		key = strings.TrimSpace(request.IdempotencyKey)
	}
	if key == "" {
		key = uuid.NewString()
	}
	canonical, _ := json.Marshal(struct {
		CustomerID int64                 `json:"customer_id"`
		Request    booking.CreateRequest `json:"request"`
	}{CustomerID: customerID, Request: request})
	sum := sha256.Sum256(canonical)
	value, err := h.service.Create(c.Request.Context(), customerID, request, key, hex.EncodeToString(sum[:]))
	if err != nil {
		respond(c, nil, err)
		return
	}
	message := "Booking berhasil dibuat."
	if value.Status == "pending_hold" {
		message = "The schedule has been held for 3 minutes."
	}
	c.JSON(http.StatusCreated, gin.H{"message": message, "data": value})
}
func (h *Handler) finalize(c *gin.Context) {
	id, ok := idParam(c, "booking")
	if !ok {
		return
	}
	customerID, valid := customerID(c)
	if !valid {
		return
	}
	var request booking.FinalizeRequest
	if !bind(c, &request) {
		return
	}
	value, err := h.service.Finalize(c.Request.Context(), id, customerID, request)
	respond(c, value, err)
}
func (h *Handler) extend(c *gin.Context) {
	id, ok := idParam(c, "booking")
	if !ok {
		return
	}
	customerID, valid := customerID(c)
	if !valid {
		return
	}
	value, err := h.service.Repository().ExtendHold(c.Request.Context(), id, customerID, 5*time.Minute)
	respond(c, value, err)
}
func (h *Handler) byCode(c *gin.Context) {
	value, err := h.service.Repository().ByCode(c.Request.Context(), c.Param("bookingCode"))
	if err == nil {
		err = owned(c, value)
	}
	respond(c, value, err)
}
func (h *Handler) byID(c *gin.Context) {
	id, ok := idParam(c, "booking")
	if !ok {
		return
	}
	value, err := h.service.Repository().ByID(c.Request.Context(), id)
	if err == nil {
		err = owned(c, value)
	}
	respond(c, value, err)
}
func (h *Handler) reschedule(c *gin.Context) {
	id, ok := idParam(c, "booking")
	if !ok {
		return
	}
	customerID, valid := customerID(c)
	if !valid {
		return
	}
	var request struct {
		BookingDate string `json:"booking_date"`
		StartTime   string `json:"start_time"`
		StaffID     *int64 `json:"staff_id"`
	}
	if !bind(c, &request) {
		return
	}
	current, err := h.service.Repository().ByID(c.Request.Context(), id)
	if err == nil {
		err = owned(c, current)
	}
	if err != nil {
		respond(c, nil, err)
		return
	}
	if request.BookingDate == "" || request.StartTime == "" {
		invalid(c, "start_time", "A valid future booking date and start time are required.")
		return
	}
	value, err := h.service.Reschedule(c.Request.Context(), current, customerID, request.StaffID, request.BookingDate, request.StartTime)
	respond(c, value, err)
}
func (h *Handler) cancel(c *gin.Context) {
	id, ok := idParam(c, "booking")
	if !ok {
		return
	}
	customerID, valid := customerID(c)
	if !valid {
		return
	}
	value, err := h.service.Repository().Cancel(c.Request.Context(), id, customerID)
	respond(c, value, err)
}
func (h *Handler) graphql(c *gin.Context) {
	var request struct {
		OperationName string          `json:"operationName"`
		Query         string          `json:"query" binding:"required"`
		Variables     json.RawMessage `json:"variables"`
	}
	if !bind(c, &request) {
		return
	}
	operation := request.OperationName
	if operation == "" {
		for _, candidate := range []string{"CustomerBookingPage", "CustomerBookingEligibleStaff", "CustomerBookingAvailability"} {
			if strings.Contains(request.Query, candidate) || strings.Contains(request.Query, strings.ToLower(candidate[:1])+candidate[1:]) {
				operation = candidate
				break
			}
		}
	}
	var variables struct {
		BranchID         int64   `json:"branchId"`
		ServiceIDs       []int64 `json:"serviceIds"`
		BookingDate      string  `json:"bookingDate"`
		StaffID          *int64  `json:"staffId"`
		HeldBookingID    *int64  `json:"heldBookingId"`
		BookingType      string  `json:"bookingType"`
		ParticipantCount int32   `json:"participantCount"`
	}
	if len(request.Variables) > 0 && string(request.Variables) != "null" {
		if err := json.Unmarshal(request.Variables, &variables); err != nil {
			graphqlError(c, "variables", "Invalid GraphQL variables.")
			return
		}
	}
	if variables.BookingType == "" {
		variables.BookingType = "scheduled"
	}
	query := booking.AvailabilityQuery{BranchID: variables.BranchID, ServiceIDs: variables.ServiceIDs, BookingDate: variables.BookingDate, StaffID: variables.StaffID, HeldBookingID: variables.HeldBookingID, BookingType: variables.BookingType, ParticipantCount: variables.ParticipantCount}
	var data gin.H
	switch operation {
	case "CustomerBookingPage":
		page, err := h.service.BookingPage(c.Request.Context(), variables.BranchID)
		if err != nil {
			graphqlServiceError(c, err)
			return
		}
		if len(variables.ServiceIDs) > 0 {
			preview, previewErr := h.service.LookupAvailability(c.Request.Context(), query, true)
			if previewErr != nil {
				graphqlServiceError(c, previewErr)
				return
			}
			page["booking_preview"] = preview
		}
		data = gin.H{"customerBookingPage": page}
	case "CustomerBookingEligibleStaff":
		value, err := h.service.LookupAvailability(c.Request.Context(), query, false)
		if err != nil {
			graphqlServiceError(c, err)
			return
		}
		data = gin.H{"customerBookingEligibleStaff": value}
	case "CustomerBookingAvailability":
		value, err := h.service.LookupAvailability(c.Request.Context(), query, true)
		if err != nil {
			graphqlServiceError(c, err)
			return
		}
		data = gin.H{"customerBookingAvailability": value}
	default:
		graphqlError(c, "operationName", "GraphQL operation tidak tersedia untuk customer landing.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func graphqlError(c *gin.Context, field, message string) {
	c.JSON(http.StatusUnprocessableEntity, gin.H{"data": nil, "errors": []gin.H{{"message": message, "path": []string{field}}}})
}

func graphqlServiceError(c *gin.Context, err error) {
	if errors.Is(err, booking.ErrInvalidTransition) || errors.Is(err, booking.ErrForbidden) || errors.Is(err, booking.ErrNotFound) {
		graphqlError(c, "variables", "The booking selection is invalid or unavailable.")
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"data": nil, "errors": []gin.H{{"message": "An internal error occurred."}}})
}
func (h *Handler) adminList(c *gin.Context) {
	items, err := h.service.Repository().AdminList(c.Request.Context())
	respond(c, items, err)
}
func (h *Handler) adminShow(c *gin.Context) {
	id, ok := idParam(c, "booking")
	if !ok {
		return
	}
	value, err := h.service.Repository().ByID(c.Request.Context(), id)
	respond(c, value, err)
}
func (h *Handler) adminStatus(c *gin.Context) {
	id, ok := idParam(c, "booking")
	if !ok {
		return
	}
	var request struct {
		Status string `json:"status" binding:"required"`
	}
	if !bind(c, &request) {
		return
	}
	value, err := h.service.Repository().AdminTransition(c.Request.Context(), id, request.Status)
	respond(c, value, err)
}

func (h *Handler) providerList(c *gin.Context) {
	h.providerListMode(c, "bookings", "")
}

func (h *Handler) providerCalendar(c *gin.Context) {
	h.providerListMode(c, "calendar", "calendar")
}

func (h *Handler) providerQueue(c *gin.Context) {
	h.providerListMode(c, "queue", "queue")
}

func (h *Handler) providerShow(c *gin.Context) {
	providerID, branchScope, requestActor, ok := providerScope(c)
	if !ok || !providerPermission(requestActor, "bookings") {
		if ok {
			respond(c, nil, booking.ErrForbidden)
		}
		return
	}
	id, valid := idParam(c, "booking")
	if !valid {
		return
	}
	value, err := h.service.ProviderBooking(c.Request.Context(), providerID, branchScope, id)
	respond(c, value, err)
}

func (h *Handler) providerUpdate(c *gin.Context) {
	providerID, branchScope, requestActor, ok := providerScope(c)
	if !ok || !providerPermission(requestActor, "bookings") {
		if ok {
			respond(c, nil, booking.ErrForbidden)
		}
		return
	}
	id, valid := idParam(c, "booking")
	if !valid {
		return
	}
	var request booking.ProviderUpdateRequest
	if !bind(c, &request) {
		return
	}
	value, err := h.service.UpdateProviderBooking(c.Request.Context(), providerID, branchScope, id, request)
	respond(c, value, err)
}

func (h *Handler) providerListMode(c *gin.Context, permission, mode string) {
	providerID, branchScope, requestActor, ok := providerScope(c)
	if !ok || !providerPermission(requestActor, permission) {
		if ok {
			respond(c, nil, booking.ErrForbidden)
		}
		return
	}
	filter := booking.ProviderListFilter{
		ProviderID: providerID, BranchID: branchScope, BookingDate: strings.TrimSpace(c.Query("date")),
		DateFrom: strings.TrimSpace(c.Query("from")), DateTo: strings.TrimSpace(c.Query("to")),
		BookingType: strings.TrimSpace(c.Query("booking_type")), Status: strings.TrimSpace(c.Query("status")), Mode: mode,
	}
	if mode == "queue" && filter.BookingDate == "" {
		filter.BookingDate = time.Now().In(time.FixedZone("Asia/Bangkok", 7*60*60)).Format("2006-01-02")
	}
	if filter.BranchID == nil && strings.TrimSpace(c.Query("branch_id")) != "" {
		branchID, err := strconv.ParseInt(c.Query("branch_id"), 10, 64)
		if err != nil || branchID <= 0 {
			invalid(c, "branch_id", "The branch identifier is invalid.")
			return
		}
		filter.BranchID = &branchID
	}
	if filter.BookingDate != "" {
		if _, err := time.Parse("2006-01-02", filter.BookingDate); err != nil {
			invalid(c, "date", "The date must use YYYY-MM-DD format.")
			return
		}
	}
	if mode == "calendar" {
		if filter.DateFrom == "" || filter.DateTo == "" {
			invalid(c, "from", "Calendar from and to dates are required.")
			return
		}
		from, fromErr := time.Parse("2006-01-02", filter.DateFrom)
		to, toErr := time.Parse("2006-01-02", filter.DateTo)
		if fromErr != nil || toErr != nil || to.Before(from) || to.Sub(from) > 366*24*time.Hour {
			invalid(c, "from", "Calendar range must be valid and no longer than 366 days.")
			return
		}
	}
	if filter.BookingType != "" && !oneOf(filter.BookingType, "scheduled", "queue", "walk_in", "manual", "group") {
		invalid(c, "booking_type", "The selected booking type is invalid.")
		return
	}
	if filter.Status != "" && !oneOf(filter.Status, "open", "pending", "pending_hold", "expired_hold", "payment_expired", "inprogress", "completed", "order_completed", "refund_completed", "provider_cancelled", "customer_cancelled", "rescheduled", "pending_payment", "confirmed", "waiting", "checked_in", "in_progress", "cancelled", "no_show") {
		invalid(c, "status", "The selected booking status is invalid.")
		return
	}
	items, err := h.service.Repository().ListProvider(c.Request.Context(), filter)
	respond(c, items, err)
}

func (h *Handler) providerAvailability(c *gin.Context) {
	providerID, branchScope, requestActor, ok := providerScope(c)
	if !ok || !providerPermission(requestActor, "walk_in") {
		if ok {
			respond(c, nil, booking.ErrForbidden)
		}
		return
	}
	var request availabilityRequest
	if !bind(c, &request) {
		return
	}
	request.BookingType = "scheduled"
	value, err := h.service.ProviderAvailability(c.Request.Context(), providerID, branchScope, request.query())
	respond(c, value, err)
}

func (h *Handler) providerCreateWalkIn(c *gin.Context) {
	providerID, branchScope, requestActor, ok := providerScope(c)
	if !ok || !providerPermission(requestActor, "walk_in") {
		if ok {
			respond(c, nil, booking.ErrForbidden)
		}
		return
	}
	var request booking.ProviderCreateRequest
	if !bind(c, &request) {
		return
	}
	key := strings.TrimSpace(c.GetHeader("Idempotency-Key"))
	if key == "" {
		key = uuid.NewString()
	}
	canonical, _ := json.Marshal(struct {
		ProviderID int64                         `json:"provider_id"`
		Request    booking.ProviderCreateRequest `json:"request"`
	}{ProviderID: providerID, Request: request})
	sum := sha256.Sum256(canonical)
	value, err := h.service.CreateProviderBooking(c.Request.Context(), providerID, branchScope, request, key, hex.EncodeToString(sum[:]))
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Offline appointment berhasil dijadwalkan tanpa bentrok.", "data": value})
}

func (h *Handler) providerAction(action, permission string) gin.HandlerFunc {
	return func(c *gin.Context) {
		providerID, branchScope, requestActor, ok := providerScope(c)
		if !ok || !providerPermission(requestActor, permission) {
			if ok {
				respond(c, nil, booking.ErrForbidden)
			}
			return
		}
		id, valid := idParam(c, "booking")
		if !valid {
			return
		}
		value, err := h.service.ProviderTransition(c.Request.Context(), providerID, branchScope, id, action)
		respond(c, value, err)
	}
}

func providerScope(c *gin.Context) (int64, *int64, authcontext.Actor, bool) {
	actor, ok := authcontext.ActorFrom(c.Request.Context())
	if !ok || actor.Role != "provider" {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Unauthenticated."})
		return 0, nil, authcontext.Actor{}, false
	}
	providerID, err := strconv.ParseInt(actor.ProviderID, 10, 64)
	if err != nil || providerID <= 0 {
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden."})
		return 0, nil, actor, false
	}
	var branchScope *int64
	if actor.BranchID != "" {
		branchID, parseErr := strconv.ParseInt(actor.BranchID, 10, 64)
		if parseErr != nil || branchID <= 0 {
			c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden."})
			return 0, nil, actor, false
		}
		branchScope = &branchID
	}
	return providerID, branchScope, actor, true
}

func providerPermission(actor authcontext.Actor, permission string) bool {
	if actor.BranchID == "" {
		return true
	}
	for _, candidate := range actor.Permissions {
		if strings.EqualFold(candidate, permission) {
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

func owned(c *gin.Context, value booking.Booking) error {
	id, ok := customerID(c)
	if !ok {
		return booking.ErrForbidden
	}
	if value.CustomerID == nil || *value.CustomerID != id {
		return booking.ErrForbidden
	}
	return nil
}
func customerID(c *gin.Context) (int64, bool) {
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
	case errors.Is(err, booking.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden."})
	case errors.Is(err, booking.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"message": "Not found."})
	case errors.Is(err, booking.ErrSlotConflict):
		c.JSON(http.StatusConflict, gin.H{"message": "The selected staff slot is no longer available.", "code": "booking_slot_conflict"})
	case errors.Is(err, booking.ErrIdempotencyMismatch):
		c.JSON(http.StatusConflict, gin.H{"message": "Idempotency key was reused with a different request.", "code": "idempotency_mismatch"})
	case errors.Is(err, booking.ErrIdempotencyInProgress):
		c.JSON(http.StatusConflict, gin.H{"message": "The request is still being processed.", "code": "idempotency_in_progress"})
	case errors.Is(err, booking.ErrInvalidTransition):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "Invalid booking status transition."})
	case errors.Is(err, booking.ErrPaymentMismatch):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "Payment amount or currency does not match booking."})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"message": "An internal error occurred."})
	}
}
