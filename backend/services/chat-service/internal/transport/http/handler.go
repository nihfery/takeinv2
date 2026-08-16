package httptransport

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/jwtauth"
	"github.com/nihfery/takein/services/chat-service/internal/chat"
)

type Handler struct {
	repository *chat.Repository
	validator  *jwtauth.Validator
	origins    []string
}

func New(repository *chat.Repository, validator *jwtauth.Validator, origins []string) *Handler {
	return &Handler{repository: repository, validator: validator, origins: origins}
}
func (h *Handler) RegisterRoutes(engine *gin.Engine) {
	group := engine.Group("/api/chat", h.validator.Middleware())
	group.GET("/threads", h.list)
	group.GET("/threads/:thread", h.thread)
	group.GET("/threads/:thread/messages", h.messages)
	group.POST("/threads/:thread/messages", h.message)
	group.PATCH("/threads/:thread/ticket", h.ticket)
	group.GET("/threads/:thread/events", h.events)
	engine.GET("/api/chat/threads/:thread/realtime", h.validator.WebSocketMiddleware(), h.realtime)
}

func (h *Handler) realtime(c *gin.Context) {
	_, id, ok := h.authorized(c)
	if !ok {
		return
	}
	connection, err := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{OriginPatterns: h.origins, Subprotocols: []string{"takein.v1"}, CompressionMode: websocket.CompressionContextTakeover})
	if err != nil {
		return
	}
	defer func() { _ = connection.Close(websocket.StatusNormalClosure, "connection closed") }()
	connection.SetReadLimit(4096)
	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()
	closed := make(chan error, 1)
	go func() {
		for {
			if _, _, readErr := connection.Read(ctx); readErr != nil {
				closed <- readErr
				return
			}
		}
	}()
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	var last int64
	for {
		select {
		case <-ctx.Done():
			return
		case <-closed:
			return
		case <-ticker.C:
			items, queryErr := h.repository.Messages(ctx, id)
			if queryErr != nil {
				_ = connection.Close(websocket.StatusInternalError, "message stream unavailable")
				return
			}
			for _, item := range items {
				messageID, _ := item["id"].(int64)
				if messageID <= last {
					continue
				}
				if writeErr := wsjson.Write(ctx, connection, map[string]any{"type": "chat.message", "thread_id": id, "data": item}); writeErr != nil {
					return
				}
				last = messageID
			}
		}
	}
}
func (h *Handler) list(c *gin.Context) {
	items, err := h.repository.List(c.Request.Context(), actor(c))
	respond(c, items, err)
}
func (h *Handler) authorized(c *gin.Context) (map[string]any, int64, bool) {
	id, err := strconv.ParseInt(c.Param("thread"), 10, 64)
	if err != nil {
		respond(c, nil, chat.ErrNotFound)
		return nil, 0, false
	}
	thread, err := h.repository.Thread(c.Request.Context(), id)
	if err != nil {
		respond(c, nil, err)
		return nil, 0, false
	}
	if !chat.CanAccess(actor(c), thread) {
		respond(c, nil, chat.ErrForbidden)
		return nil, 0, false
	}
	return thread, id, true
}
func (h *Handler) thread(c *gin.Context) {
	value, _, ok := h.authorized(c)
	if ok {
		respond(c, value, nil)
	}
}
func (h *Handler) messages(c *gin.Context) {
	_, id, ok := h.authorized(c)
	if !ok {
		return
	}
	items, err := h.repository.Messages(c.Request.Context(), id)
	respond(c, items, err)
}
func (h *Handler) message(c *gin.Context) {
	_, id, ok := h.authorized(c)
	if !ok {
		return
	}
	var request struct {
		Body               string     `json:"body" binding:"required,max=5000"`
		AttachmentObjectID *uuid.UUID `json:"attachment_object_id"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid."})
		return
	}
	value, err := h.repository.CreateMessage(c.Request.Context(), id, actor(c), request.Body, request.AttachmentObjectID)
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": value})
}
func (h *Handler) ticket(c *gin.Context) {
	thread, id, ok := h.authorized(c)
	if !ok {
		return
	}
	var request struct {
		Status  string `json:"status" binding:"required"`
		Subject string `json:"subject"`
		Body    string `json:"body"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid."})
		return
	}
	from, _ := thread["ticket_status"].(string)
	if !chat.CanTicketTransition(from, request.Status) {
		respond(c, nil, chat.ErrInvalidTransition)
		return
	}
	value, err := h.repository.Ticket(c.Request.Context(), id, from, request.Status, request.Subject, request.Body, actor(c))
	respond(c, value, err)
}
func (h *Handler) events(c *gin.Context) {
	_, id, ok := h.authorized(c)
	if !ok {
		return
	}
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	var last int64
	for {
		select {
		case <-c.Request.Context().Done():
			return
		case <-ticker.C:
			items, err := h.repository.Messages(c.Request.Context(), id)
			if err != nil {
				return
			}
			for _, item := range items {
				messageID, _ := item["id"].(int64)
				if messageID <= last {
					continue
				}
				payload, _ := json.Marshal(item)
				_, _ = fmt.Fprintf(c.Writer, "id: %d\nevent: message\ndata: %s\n\n", messageID, payload)
				c.Writer.Flush()
				last = messageID
			}
		}
	}
}
func actor(c *gin.Context) chat.Actor {
	value, _ := authcontext.ActorFrom(c.Request.Context())
	userID, _ := strconv.ParseInt(value.UserID, 10, 64)
	providerID, _ := strconv.ParseInt(value.ProviderID, 10, 64)
	return chat.Actor{UserID: userID, Role: value.Role, ProviderID: providerID}
}
func respond(c *gin.Context, value any, err error) {
	if err == nil {
		c.JSON(http.StatusOK, gin.H{"data": value})
		return
	}
	switch {
	case errors.Is(err, chat.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"message": "Not found."})
	case errors.Is(err, chat.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden."})
	case errors.Is(err, chat.ErrInvalidTransition):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "Invalid ticket transition."})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"message": "An internal error occurred."})
	}
}
