package httptransport

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/nihfery/takein/libs/go/jwtauth"
	"github.com/nihfery/takein/services/audit-service/internal/audit"
)

type Handler struct {
	repository *audit.Repository
	validator  *jwtauth.Validator
}

func New(repository *audit.Repository, validator *jwtauth.Validator) *Handler {
	return &Handler{repository: repository, validator: validator}
}
func (h *Handler) RegisterRoutes(engine *gin.Engine) {
	engine.GET("/api/admin/audit", h.validator.Middleware("admin"), h.query)
}
func (h *Handler) query(c *gin.Context) {
	limit, _ := strconv.ParseInt(c.DefaultQuery("limit", "100"), 10, 32)
	items, err := h.repository.Query(c.Request.Context(), c.Query("resource_type"), c.Query("resource_id"), c.Query("actor_id"), int32(limit))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "An internal error occurred."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}
