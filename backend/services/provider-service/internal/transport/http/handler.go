package httptransport

import (
	"errors"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/jwtauth"
	"github.com/nihfery/takein/services/provider-service/internal/provider"
)

type Handler struct {
	service   *provider.Service
	validator *jwtauth.Validator
}

func New(service *provider.Service, validator *jwtauth.Validator) *Handler {
	return &Handler{service: service, validator: validator}
}

func (h *Handler) RegisterRoutes(engine *gin.Engine) {
	api := engine.Group("/api")
	owned := api.Group("/provider", h.validator.Middleware("provider"))
	owned.GET("/profile", h.showProfile)
	owned.GET("/branch-profile", h.showBranchProfile)
	owned.PUT("/branch-profile", h.updateBranchProfile)
	owned.PUT("/profile", h.updateProfile)
	owned.POST("/profile/documents", h.updateDocuments)
	owned.GET("/profile/documents/:document", h.document)
	owned.GET("/branches", h.listBranches)
	owned.POST("/branches", h.createBranch)
	owned.GET("/branches/:branch", h.showBranch)
	owned.PUT("/branches/:branch", h.updateBranch)
	owned.PATCH("/branches/:branch", h.updateBranch)
	owned.DELETE("/branches/:branch", h.deleteBranch)
	owned.PUT("/branches/:branch/staff", h.assignStaff)
	owned.GET("/branches/:branch/preview", h.showBranch)
	owned.GET("/staff", h.listStaff)
	owned.POST("/staff", h.createStaff)
	owned.GET("/staff/:staff", h.showStaff)
	owned.PUT("/staff/:staff", h.updateStaff)
	owned.PATCH("/staff/:staff", h.updateStaff)
	owned.DELETE("/staff/:staff", h.deleteStaff)
	owned.GET("/staff/:staff/skills", h.staffSkills)
	owned.PUT("/staff/:staff/skills", h.replaceStaffSkills)
	owned.GET("/staff/:staff/schedules", h.staffSchedules)
	owned.PUT("/staff/:staff/schedules", h.replaceStaffSchedules)
	owned.GET("/roles-permissions", h.listRoles)
	owned.POST("/roles-permissions", h.createRole)
	owned.PUT("/roles-permissions/:role", h.updateRole)
	owned.PATCH("/roles-permissions/:role/toggle-status", h.toggleRole)
	owned.DELETE("/roles-permissions/:role", h.deactivateRole)
	admin := api.Group("/admin/providers", h.validator.Middleware("admin"))
	admin.GET("", h.listProviders)
	admin.GET("/:provider", h.showProvider)
	admin.DELETE("/:provider", h.deleteProvider)
	admin.GET("/:provider/documents/:document", h.adminDocument)
	admin.PATCH("/:provider/toggle-status", h.toggleProvider)
	admin.PATCH("/:provider/document-status", h.documentStatus)
}

func (h *Handler) showProfile(c *gin.Context) {
	profile, err := h.service.ResolveProfile(c.Request.Context(), actor(c))
	if err != nil {
		respond(c, nil, err)
		return
	}
	identityValue, err := h.service.Identity(c.Request.Context(), profile.UserID)
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": profile, "identity": identityValue})
}
func (h *Handler) showBranchProfile(c *gin.Context) {
	value, err := h.service.ResolveBranchProfile(c.Request.Context(), actor(c))
	respond(c, value, err)
}
func (h *Handler) updateBranchProfile(c *gin.Context) {
	var input provider.BranchProfileUpdateInput
	if !bind(c, &input) {
		return
	}
	value, err := h.service.UpdateBranchProfile(c.Request.Context(), actor(c), input)
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Branch profile updated.", "data": value})
}
func (h *Handler) updateProfile(c *gin.Context) {
	profile, err := h.service.ResolveProfile(c.Request.Context(), actor(c))
	if err != nil {
		respond(c, nil, err)
		return
	}
	var input provider.ProfileInput
	if !bind(c, &input) {
		return
	}
	if objectID, ok := h.upload(c, "image", "provider-profile", 2<<20, imageTypes, "public"); !ok {
		return
	} else if objectID != "" {
		input.ImageObjectID = objectID
	}
	updated, identityValue, err := h.service.UpdateProfile(c.Request.Context(), actor(c), profile, input)
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Profile berhasil diperbarui.", "data": updated, "identity": identityValue})
}
func (h *Handler) updateDocuments(c *gin.Context) {
	requestActor := actor(c)
	if requestActor.BranchID > 0 {
		respond(c, nil, provider.ErrForbidden)
		return
	}
	profile, err := h.service.ResolveProfile(c.Request.Context(), actor(c))
	if err != nil {
		respond(c, nil, err)
		return
	}
	if profile.DocumentStatus == "verified" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "Dokumen sudah verified dan tidak bisa dimodifikasi lagi."})
		return
	}
	var request struct {
		NIBNumber        string `json:"nib_number" form:"nib_number"`
		KTPObjectID      string `json:"ktp_object_id" form:"ktp_object_id"`
		NIBObjectID      string `json:"nib_object_id" form:"nib_object_id"`
		BusinessObjectID string `json:"business_object_id" form:"business_object_id"`
	}
	if !bind(c, &request) {
		return
	}
	if !validNIB.MatchString(strings.TrimSpace(request.NIBNumber)) {
		invalidField(c, "nib_number")
		return
	}
	for _, upload := range []struct {
		field, purpose string
		max            int64
		allowed        map[string]bool
		target         *string
	}{{"ktp_image", "provider-ktp", 4 << 20, imageTypes, &request.KTPObjectID}, {"nib_document", "provider-nib", 5 << 20, documentTypes, &request.NIBObjectID}, {"business_image", "provider-business", 4 << 20, imageTypes, &request.BusinessObjectID}} {
		objectID, ok := h.upload(c, upload.field, upload.purpose, upload.max, upload.allowed, "private")
		if !ok {
			return
		}
		if objectID != "" {
			*upload.target = objectID
		}
	}
	for _, objectID := range []*string{&request.KTPObjectID, &request.NIBObjectID, &request.BusinessObjectID} {
		if *objectID != "" {
			if err = h.service.ReferenceMedia(c.Request.Context(), *objectID); err != nil {
				respond(c, nil, err)
				return
			}
		}
	}
	if request.KTPObjectID == "" && profile.KTPObjectID == nil || request.NIBObjectID == "" && profile.NIBObjectID == nil || request.BusinessObjectID == "" && profile.BusinessObjectID == nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "Upload Foto KTP, dokumen NIB, dan Foto Usaha terlebih dahulu."})
		return
	}
	values := map[string]any{"nib_number": request.NIBNumber, "ktp_object_id": request.KTPObjectID, "nib_object_id": request.NIBObjectID, "business_object_id": request.BusinessObjectID}
	updated, err := h.service.Repository().UpdateDocuments(c.Request.Context(), profile.ID, values)
	respond(c, updated, err)
}
func (h *Handler) document(c *gin.Context) {
	if actor(c).BranchID > 0 {
		respond(c, nil, provider.ErrForbidden)
		return
	}
	profile, err := h.service.ResolveProfile(c.Request.Context(), actor(c))
	if err != nil {
		respond(c, nil, err)
		return
	}
	url, err := h.service.DocumentURL(c.Request.Context(), profile, c.Param("document"))
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.Redirect(http.StatusTemporaryRedirect, url)
}

func (h *Handler) listBranches(c *gin.Context) {
	requestActor := actor(c)
	profile, err := h.service.ResolveProfile(c.Request.Context(), requestActor)
	if err != nil {
		respond(c, nil, err)
		return
	}
	if requestActor.BranchID > 0 {
		item, branchErr := h.service.ScopedBranch(c.Request.Context(), requestActor, requestActor.BranchID)
		if branchErr != nil {
			respond(c, nil, branchErr)
			return
		}
		respond(c, []provider.Branch{item}, nil)
		return
	}
	items, err := h.service.Repository().ListBranches(c.Request.Context(), profile.ID)
	respond(c, items, err)
}
func (h *Handler) createBranch(c *gin.Context) {
	if !strings.HasPrefix(c.ContentType(), "multipart/form-data") {
		invalidUpload(c, "image")
		return
	}
	var input provider.BranchInput
	if !bind(c, &input) {
		return
	}
	if objectID, ok := h.upload(c, "image", "branch-image", 2<<20, imageTypes, "public"); !ok {
		return
	} else if objectID == "" {
		invalidUpload(c, "image")
		return
	} else {
		input.ImageObjectID = &objectID
	}
	if err := h.referenceImage(c, input.ImageObjectID); err != nil {
		respond(c, nil, err)
		return
	}
	item, err := h.service.CreateBranch(c.Request.Context(), actor(c), input)
	created(c, item, err)
}
func (h *Handler) showBranch(c *gin.Context) {
	id, ok := idParam(c, "branch")
	if !ok {
		return
	}
	item, err := h.service.ScopedBranch(c.Request.Context(), actor(c), id)
	respond(c, item, err)
}
func (h *Handler) updateBranch(c *gin.Context) {
	id, ok := idParam(c, "branch")
	if !ok {
		return
	}
	item, err := h.service.ScopedBranch(c.Request.Context(), actor(c), id)
	if err != nil {
		respond(c, nil, err)
		return
	}
	var input provider.BranchInput
	if !bind(c, &input) {
		return
	}
	if objectID, uploaded := h.upload(c, "image", "branch-image", 2<<20, imageTypes, "public"); !uploaded {
		return
	} else if objectID != "" {
		input.ImageObjectID = &objectID
	}
	if err = h.referenceImage(c, input.ImageObjectID); err != nil {
		respond(c, nil, err)
		return
	}
	if err = input.Validate(); err != nil {
		respond(c, nil, err)
		return
	}
	item, err = h.service.Repository().UpdateBranch(c.Request.Context(), item.ProviderID, id, input)
	respond(c, item, err)
}
func (h *Handler) deleteBranch(c *gin.Context) {
	id, ok := idParam(c, "branch")
	if !ok {
		return
	}
	requestActor := actor(c)
	if requestActor.BranchID > 0 {
		respond(c, nil, provider.ErrForbidden)
		return
	}
	item, err := h.service.ScopedBranch(c.Request.Context(), requestActor, id)
	if err == nil {
		err = h.service.Repository().DeleteBranch(c.Request.Context(), item.ProviderID, id)
	}
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.Status(http.StatusNoContent)
}
func (h *Handler) assignStaff(c *gin.Context) {
	id, ok := idParam(c, "branch")
	if !ok {
		return
	}
	item, err := h.service.ScopedBranch(c.Request.Context(), actor(c), id)
	if err != nil {
		respond(c, nil, err)
		return
	}
	var request struct {
		StaffIDs []int64 `json:"staff_ids"`
	}
	if !bind(c, &request) {
		return
	}
	err = h.service.Repository().AssignBranchStaff(c.Request.Context(), item.ProviderID, id, request.StaffIDs)
	respond(c, gin.H{"message": "Branch staff updated."}, err)
}

func (h *Handler) listStaff(c *gin.Context) {
	requestActor, ok := h.authorizedProviderAction(c, "staffs")
	if !ok {
		return
	}
	profile, err := h.service.ResolveProfile(c.Request.Context(), requestActor)
	if err != nil {
		respond(c, nil, err)
		return
	}
	var branchID *int64
	if requestActor.BranchID > 0 {
		branchID = &requestActor.BranchID
	}
	items, err := h.service.Repository().ListStaff(c.Request.Context(), profile.ID, branchID)
	respond(c, items, err)
}
func (h *Handler) createStaff(c *gin.Context) {
	requestActor, ok := h.authorizedProviderAction(c, "staffs")
	if !ok {
		return
	}
	profile, err := h.service.ResolveProfile(c.Request.Context(), requestActor)
	if err != nil {
		respond(c, nil, err)
		return
	}
	var input provider.StaffInput
	if !bind(c, &input) {
		return
	}
	if objectID, uploaded := h.upload(c, "image", "provider-staff", 4<<20, imageTypes, "public"); !uploaded {
		return
	} else if objectID != "" {
		input.ImageObjectID = &objectID
	}
	if err = h.referenceImage(c, input.ImageObjectID); err != nil {
		respond(c, nil, err)
		return
	}
	if err = input.Validate(); err != nil {
		respond(c, nil, err)
		return
	}
	if err = provider.CheckScope(requestActor, profile.ID, input.BranchID); err != nil {
		respond(c, nil, err)
		return
	}
	item, err := h.service.Repository().CreateStaff(c.Request.Context(), profile.ID, input)
	created(c, item, err)
}
func (h *Handler) showStaff(c *gin.Context) {
	requestActor, authorized := h.authorizedProviderAction(c, "staffs")
	if !authorized {
		return
	}
	id, ok := idParam(c, "staff")
	if !ok {
		return
	}
	item, err := h.service.ScopedStaff(c.Request.Context(), requestActor, id)
	respond(c, item, err)
}
func (h *Handler) updateStaff(c *gin.Context) {
	requestActor, authorized := h.authorizedProviderAction(c, "staffs")
	if !authorized {
		return
	}
	id, ok := idParam(c, "staff")
	if !ok {
		return
	}
	item, err := h.service.ScopedStaff(c.Request.Context(), requestActor, id)
	if err != nil {
		respond(c, nil, err)
		return
	}
	var input provider.StaffInput
	if !bind(c, &input) {
		return
	}
	if objectID, uploaded := h.upload(c, "image", "provider-staff", 4<<20, imageTypes, "public"); !uploaded {
		return
	} else if objectID != "" {
		input.ImageObjectID = &objectID
	}
	if err = h.referenceImage(c, input.ImageObjectID); err != nil {
		respond(c, nil, err)
		return
	}
	if err = input.Validate(); err != nil {
		respond(c, nil, err)
		return
	}
	if err = provider.CheckScope(requestActor, item.ProviderID, input.BranchID); err != nil {
		respond(c, nil, err)
		return
	}
	item, err = h.service.Repository().UpdateStaff(c.Request.Context(), item.ProviderID, id, input)
	respond(c, item, err)
}
func (h *Handler) deleteStaff(c *gin.Context) {
	requestActor, authorized := h.authorizedProviderAction(c, "staffs")
	if !authorized {
		return
	}
	id, ok := idParam(c, "staff")
	if !ok {
		return
	}
	item, err := h.service.ScopedStaff(c.Request.Context(), requestActor, id)
	if err == nil {
		err = h.service.Repository().DeleteStaff(c.Request.Context(), item.ProviderID, id)
	}
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) staffSkills(c *gin.Context) {
	staffID, ok := h.authorizedStaffResource(c, "staff_skills")
	if !ok {
		return
	}
	items, err := h.service.Repository().StaffSkills(c.Request.Context(), staffID)
	respond(c, gin.H{"service_ids": items}, err)
}

func (h *Handler) replaceStaffSkills(c *gin.Context) {
	staffID, ok := h.authorizedStaffResource(c, "staff_skills")
	if !ok {
		return
	}
	var request struct {
		ServiceIDs []int64 `json:"service_ids" binding:"required"`
	}
	if !bind(c, &request) {
		return
	}
	items, err := h.service.ReplaceStaffSkills(c.Request.Context(), actor(c), staffID, request.ServiceIDs)
	respond(c, gin.H{"service_ids": items}, err)
}

func (h *Handler) staffSchedules(c *gin.Context) {
	staffID, ok := h.authorizedStaffResource(c, "staff_schedules")
	if !ok {
		return
	}
	items, err := h.service.Repository().StaffSchedules(c.Request.Context(), staffID)
	respond(c, items, err)
}

func (h *Handler) replaceStaffSchedules(c *gin.Context) {
	staffID, ok := h.authorizedStaffResource(c, "staff_schedules")
	if !ok {
		return
	}
	var request struct {
		Schedules []provider.ScheduleInput `json:"schedules" binding:"required"`
	}
	if !bind(c, &request) {
		return
	}
	items, err := h.service.ReplaceStaffSchedules(c.Request.Context(), actor(c), staffID, request.Schedules)
	respond(c, items, err)
}

func (h *Handler) authorizedStaffResource(c *gin.Context, permission string) (int64, bool) {
	requestActor, authorized := h.authorizedProviderAction(c, permission)
	if !authorized {
		return 0, false
	}
	staffID, ok := idParam(c, "staff")
	if !ok {
		return 0, false
	}
	if _, err := h.service.ScopedStaff(c.Request.Context(), requestActor, staffID); err != nil {
		respond(c, nil, err)
		return 0, false
	}
	return staffID, true
}

func (h *Handler) authorizedProviderAction(c *gin.Context, permission string) (provider.Actor, bool) {
	requestActor := actor(c)
	if requestActor.Role != "provider" || requestActor.BranchID > 0 && !provider.HasPermission(requestActor, permission) {
		respond(c, nil, provider.ErrForbidden)
		return provider.Actor{}, false
	}
	return requestActor, true
}

func (h *Handler) listRoles(c *gin.Context) {
	items, err := h.service.ListRoles(c.Request.Context(), actor(c))
	respond(c, items, err)
}

func (h *Handler) createRole(c *gin.Context) {
	var input provider.RoleInput
	if !bind(c, &input) {
		return
	}
	item, err := h.service.CreateRole(c.Request.Context(), actor(c), input)
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Branch account and permissions have been created.", "data": item})
}

func (h *Handler) updateRole(c *gin.Context) {
	id, ok := idParam(c, "role")
	if !ok {
		return
	}
	var input provider.RoleInput
	if !bind(c, &input) {
		return
	}
	item, err := h.service.UpdateRole(c.Request.Context(), actor(c), id, input)
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Branch account and permissions have been updated.", "data": item})
}

func (h *Handler) toggleRole(c *gin.Context) {
	id, ok := idParam(c, "role")
	if !ok {
		return
	}
	item, err := h.service.ToggleRole(c.Request.Context(), actor(c), id)
	respond(c, item, err)
}

func (h *Handler) deactivateRole(c *gin.Context) {
	id, ok := idParam(c, "role")
	if !ok {
		return
	}
	requestActor := actor(c)
	if requestActor.Role != "provider" || requestActor.BranchID > 0 {
		respond(c, nil, provider.ErrForbidden)
		return
	}
	item, err := h.service.Repository().Role(c.Request.Context(), id)
	if err != nil {
		respond(c, nil, err)
		return
	}
	if item.ProviderID != requestActor.ProviderID {
		respond(c, nil, provider.ErrForbidden)
		return
	}
	if item.Status == "active" {
		item, err = h.service.ToggleRole(c.Request.Context(), requestActor, id)
	}
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Role has been deactivated because its branch account is retained.", "data": item})
}

func (h *Handler) listProviders(c *gin.Context) {
	items, err := h.service.Repository().ListProviders(c.Request.Context())
	respond(c, items, err)
}
func (h *Handler) showProvider(c *gin.Context) {
	id, ok := idParam(c, "provider")
	if !ok {
		return
	}
	item, err := h.service.Repository().ProfileByID(c.Request.Context(), id)
	respond(c, item, err)
}
func (h *Handler) deleteProvider(c *gin.Context) {
	id, ok := idParam(c, "provider")
	if !ok {
		return
	}
	err := h.service.Repository().DeleteProvider(c.Request.Context(), id)
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.Status(http.StatusNoContent)
}
func (h *Handler) adminDocument(c *gin.Context) {
	id, ok := idParam(c, "provider")
	if !ok {
		return
	}
	profile, err := h.service.Repository().ProfileByID(c.Request.Context(), id)
	if err != nil {
		respond(c, nil, err)
		return
	}
	url, err := h.service.DocumentURL(c.Request.Context(), profile, c.Param("document"))
	if err != nil {
		respond(c, nil, err)
		return
	}
	c.Redirect(http.StatusTemporaryRedirect, url)
}
func (h *Handler) toggleProvider(c *gin.Context) {
	id, ok := idParam(c, "provider")
	if !ok {
		return
	}
	item, err := h.service.Repository().ToggleProviderStatus(c.Request.Context(), id)
	respond(c, item, err)
}
func (h *Handler) documentStatus(c *gin.Context) {
	id, ok := idParam(c, "provider")
	if !ok {
		return
	}
	var request struct {
		Status string `json:"status" binding:"required,oneof=pending verified rejected"`
		Note   string `json:"note"`
	}
	if !bind(c, &request) {
		return
	}
	item, err := h.service.Repository().SetDocumentStatus(c.Request.Context(), id, request.Status, request.Note)
	respond(c, item, err)
}

func actor(c *gin.Context) provider.Actor {
	value, _ := authcontext.ActorFrom(c.Request.Context())
	return provider.Actor{UserID: parse(value.UserID), ProviderID: parse(value.ProviderID), BranchID: parse(value.BranchID), Role: value.Role, Permissions: value.Permissions}
}
func parse(value string) int64 { parsed, _ := strconv.ParseInt(value, 10, 64); return parsed }
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

var imageTypes = map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true}
var documentTypes = map[string]bool{"application/pdf": true, "image/jpeg": true, "image/png": true, "image/webp": true}
var validNIB = regexp.MustCompile(`^[0-9.\-\s]{1,50}$`)

func (h *Handler) upload(c *gin.Context, field, purpose string, maxBytes int64, allowed map[string]bool, visibility string) (string, bool) {
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
	if !allowed[contentType] {
		invalidUpload(c, field)
		return "", false
	}
	objectID, err := h.service.StoreMedia(c.Request.Context(), purpose, header.Filename, contentType, content, visibility)
	if err != nil {
		respond(c, nil, err)
		return "", false
	}
	return objectID, true
}

func (h *Handler) referenceImage(c *gin.Context, objectID *string) error {
	if objectID == nil || strings.TrimSpace(*objectID) == "" {
		return nil
	}
	return h.service.ReferenceMedia(c.Request.Context(), *objectID)
}

func invalidField(c *gin.Context, field string) {
	c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid.", "errors": gin.H{field: []string{"The field is invalid."}}})
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
func respond(c *gin.Context, value any, err error) {
	if err == nil {
		c.JSON(http.StatusOK, gin.H{"data": value})
		return
	}
	switch {
	case errors.Is(err, provider.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden."})
	case errors.Is(err, provider.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"message": "Not found."})
	case errors.Is(err, provider.ErrConflict):
		c.JSON(http.StatusConflict, gin.H{"message": "Resource conflict."})
	case errors.Is(err, provider.ErrValidation):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid."})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"message": "An internal error occurred."})
	}
}
