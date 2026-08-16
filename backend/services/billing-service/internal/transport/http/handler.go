package httptransport

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/jwtauth"
	"github.com/nihfery/takein/services/billing-service/internal/billing"
)

type Handler struct {
	service   *billing.Service
	validator *jwtauth.Validator
}

func New(service *billing.Service, validator *jwtauth.Validator) *Handler {
	return &Handler{service: service, validator: validator}
}
func (h *Handler) RegisterRoutes(engine *gin.Engine) {
	group := engine.Group("/api/provider/subscriptions", h.validator.Middleware("provider"))
	group.GET("", h.overview)
	group.POST("/plans/:plan/purchase", h.purchase)
}
func (h *Handler) overview(c *gin.Context) {
	id, ok := providerID(c)
	if !ok {
		return
	}
	plans, entitlement, err := h.service.Overview(c.Request.Context(), id)
	if err != nil {
		respond(c, nil, err)
		return
	}
	respond(c, gin.H{"plans": plans, "entitlement": entitlement}, nil)
}
func (h *Handler) purchase(c *gin.Context) {
	providerID, ok := providerID(c)
	if !ok {
		return
	}
	planID, err := strconv.ParseInt(c.Param("plan"), 10, 64)
	if err != nil || planID <= 0 {
		respond(c, nil, billing.ErrNotFound)
		return
	}
	var request struct {
		PaymentChannel string `json:"payment_channel"`
	}
	if c.Request.ContentLength != 0 {
		if err = c.ShouldBindJSON(&request); err != nil {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid."})
			return
		}
	}
	value, charge, err := h.service.Purchase(c.Request.Context(), providerID, planID, request.PaymentChannel)
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"subscription": value, "payment": charge}})
}
func providerID(c *gin.Context) (int64, bool) {
	actor, ok := authcontext.ActorFrom(c.Request.Context())
	if !ok {
		return 0, false
	}
	id, err := strconv.ParseInt(actor.ProviderID, 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusForbidden, gin.H{"message": "Provider context is required."})
		return 0, false
	}
	return id, true
}
func respond(c *gin.Context, value any, err error) {
	if err == nil {
		c.JSON(http.StatusOK, gin.H{"data": value})
		return
	}
	if errors.Is(err, billing.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"message": "Not found."})
		return
	}
	if errors.Is(err, billing.ErrForbidden) {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid."})
		return
	}
	if errors.Is(err, billing.ErrConflict) {
		c.JSON(http.StatusConflict, gin.H{"message": "Complete the existing pending subscription checkout first."})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"message": "An internal error occurred."})
}
