package httptransport

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/jwtauth"
	"github.com/nihfery/takein/services/notification-service/internal/notification"
)

type Handler struct {
	repository *notification.Repository
	validator  *jwtauth.Validator
}

func New(repository *notification.Repository, validator *jwtauth.Validator) *Handler {
	return &Handler{repository: repository, validator: validator}
}
func (h *Handler) RegisterRoutes(engine *gin.Engine) {
	group := engine.Group("/api/notifications", h.validator.Middleware())
	group.GET("", h.list)
	group.PATCH("/:notification/read", h.read)
	group.POST("/read-all", h.readAll)
}
func (h *Handler) list(c *gin.Context) {
	id, ok := actorID(c)
	if !ok {
		return
	}
	items, err := h.repository.List(c.Request.Context(), id)
	respond(c, items, err)
}
func (h *Handler) read(c *gin.Context) {
	userID, ok := actorID(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("notification"), 10, 64)
	if err != nil {
		respond(c, nil, notification.ErrNotFound)
		return
	}
	err = h.repository.MarkRead(c.Request.Context(), userID, id)
	respond(c, map[string]string{"message": "Notification marked as read."}, err)
}
func (h *Handler) readAll(c *gin.Context) {
	id, ok := actorID(c)
	if !ok {
		return
	}
	respond(c, map[string]string{"message": "Notifications marked as read."}, h.repository.MarkAllRead(c.Request.Context(), id))
}
func actorID(c *gin.Context) (int64, bool) {
	actor, ok := authcontext.ActorFrom(c.Request.Context())
	if !ok {
		return 0, false
	}
	id, err := strconv.ParseInt(actor.UserID, 10, 64)
	if err != nil {
		return 0, false
	}
	return id, true
}
func respond(c *gin.Context, value any, err error) {
	if err == nil {
		c.JSON(http.StatusOK, gin.H{"data": value})
		return
	}
	if errors.Is(err, notification.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"message": "Not found."})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"message": "An internal error occurred."})
}
