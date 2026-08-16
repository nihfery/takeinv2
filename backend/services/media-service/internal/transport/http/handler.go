package httptransport

import (
	"errors"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/jwtauth"
	"github.com/nihfery/takein/services/media-service/internal/media"
	"github.com/nihfery/takein/services/media-service/internal/storage"
)

var safePurpose = regexp.MustCompile(`^[a-z0-9_-]{1,64}$`)

type Handler struct {
	repository *media.Repository
	signer     *storage.Signer
	validator  *jwtauth.Validator
	bucket     string
}

func New(repository *media.Repository, signer *storage.Signer, validator *jwtauth.Validator, bucket string) *Handler {
	return &Handler{repository: repository, signer: signer, validator: validator, bucket: bucket}
}
func (h *Handler) RegisterRoutes(engine *gin.Engine) {
	group := engine.Group("/api/media", h.validator.Middleware())
	group.POST("/presign-upload", h.upload)
	group.POST("/:object/complete", h.complete)
	group.GET("/:object/download", h.download)
	group.DELETE("/:object", h.delete)
}
func (h *Handler) upload(c *gin.Context) {
	actor, _ := authcontext.ActorFrom(c.Request.Context())
	var request struct {
		Purpose     string `json:"purpose" binding:"required"`
		FileName    string `json:"file_name" binding:"required,max=255"`
		ContentType string `json:"content_type" binding:"required,max=120"`
		Visibility  string `json:"visibility" binding:"omitempty,oneof=private public"`
	}
	if err := c.ShouldBindJSON(&request); err != nil || !safePurpose.MatchString(request.Purpose) {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid."})
		return
	}
	visibility := request.Visibility
	if visibility == "" {
		visibility = "private"
	}
	extension := strings.ToLower(filepath.Ext(request.FileName))
	if len(extension) > 10 {
		extension = ""
	}
	id := uuid.New()
	key := actor.Role + "/" + actor.UserID + "/" + request.Purpose + "/" + id.String() + extension
	value, err := h.repository.Create(c.Request.Context(), actor.Role, actor.UserID, request.Purpose, h.bucket, key, request.ContentType, visibility)
	if err != nil {
		respond(c, nil, err)
		return
	}
	url, err := h.signer.Presign(http.MethodPut, h.bucket, key, 15*time.Minute)
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"object": value, "upload_url": url, "expires_in": 900}})
}
func (h *Handler) complete(c *gin.Context) {
	value, ok := h.authorized(c)
	if !ok {
		return
	}
	var request struct {
		SizeBytes int64  `json:"size_bytes" binding:"required,min=0"`
		Checksum  string `json:"checksum_sha256" binding:"required,len=64"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid."})
		return
	}
	actualSize, err := h.signer.Head(c.Request.Context(), value.Bucket, value.ObjectKey)
	if err != nil {
		respond(c, nil, err)
		return
	}
	if actualSize != request.SizeBytes {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "Uploaded object size does not match completion metadata."})
		return
	}
	updated, err := h.repository.Complete(c.Request.Context(), value.ID, request.SizeBytes, request.Checksum)
	respond(c, updated, err)
}
func (h *Handler) download(c *gin.Context) {
	value, ok := h.authorized(c)
	if !ok {
		return
	}
	if value.Status != "ready" {
		respond(c, nil, media.ErrNotFound)
		return
	}
	url, err := h.signer.Presign(http.MethodGet, value.Bucket, value.ObjectKey, 5*time.Minute)
	respond(c, gin.H{"download_url": url, "expires_in": 300}, err)
}
func (h *Handler) delete(c *gin.Context) {
	value, ok := h.authorized(c)
	if !ok {
		return
	}
	if err := h.repository.Delete(c.Request.Context(), value.ID); err != nil {
		respond(c, nil, err)
		return
	}
	c.Status(http.StatusNoContent)
}
func (h *Handler) authorized(c *gin.Context) (media.Object, bool) {
	id, err := uuid.Parse(c.Param("object"))
	if err != nil {
		respond(c, nil, media.ErrNotFound)
		return media.Object{}, false
	}
	value, err := h.repository.ByID(c.Request.Context(), id)
	if err != nil {
		respond(c, nil, err)
		return media.Object{}, false
	}
	actor, _ := authcontext.ActorFrom(c.Request.Context())
	if !media.Authorized(actor.Role, actor.UserID, value) {
		respond(c, nil, media.ErrForbidden)
		return media.Object{}, false
	}
	return value, true
}
func respond(c *gin.Context, value any, err error) {
	if err == nil {
		c.JSON(http.StatusOK, gin.H{"data": value})
		return
	}
	switch {
	case errors.Is(err, media.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"message": "Not found."})
	case errors.Is(err, media.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden."})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"message": "An internal error occurred."})
	}
}
