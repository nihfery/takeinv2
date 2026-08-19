package httptransport

import (
	"errors"
	"net"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/jwtauth"
	"github.com/nihfery/takein/services/identity-service/internal/identity"
	"github.com/nihfery/takein/services/identity-service/internal/security"
)

type Handler struct {
	service   *identity.Service
	tokens    *security.TokenIssuer
	validator *jwtauth.Validator
}

func New(service *identity.Service, tokens *security.TokenIssuer, validator *jwtauth.Validator) *Handler {
	return &Handler{service: service, tokens: tokens, validator: validator}
}

func (h *Handler) RegisterRoutes(engine *gin.Engine) {
	api := engine.Group("/api")
	api.POST("/auth/register/customer", h.registerCustomer)
	api.POST("/auth/register/provider", h.registerProvider)
	api.POST("/auth/login", h.login)
	api.GET("/auth/me", h.validator.Middleware(), h.me)
	api.GET("/auth/customer/me", h.validator.Middleware("customer"), h.me)
	api.GET("/auth/provider/me", h.validator.Middleware("provider"), h.me)
	api.GET("/auth/admin/me", h.validator.Middleware("admin"), h.me)
	api.POST("/auth/logout", h.validator.Middleware(), h.logout)
	api.PUT("/provider/profile/password", h.validator.Middleware("provider"), h.changePassword)
	engine.POST("/internal/v1/auth/refresh", h.refresh)
	engine.GET("/.well-known/jwks.json", func(c *gin.Context) { c.JSON(http.StatusOK, h.tokens.JWKS()) })
}

type customerRegistrationRequest struct {
	Name                 string  `json:"name" binding:"required,max=255"`
	Username             *string `json:"username" binding:"omitempty,max=100"`
	Email                string  `json:"email" binding:"required,email,max=255"`
	Password             string  `json:"password" binding:"required,min=8"`
	PasswordConfirmation string  `json:"password_confirmation" binding:"required"`
	PhoneNumber          string  `json:"phone_number" binding:"omitempty,max=255"`
	Gender               string  `json:"gender" binding:"omitempty,oneof=male female other"`
	DateOfBirth          string  `json:"date_of_birth"`
	Religion             string  `json:"religion" binding:"omitempty,max=100"`
	Allergies            string  `json:"allergies" binding:"omitempty,max=2000"`
}

func (h *Handler) registerCustomer(c *gin.Context) {
	var request customerRegistrationRequest
	if !bind(c, &request) || request.Password != request.PasswordConfirmation {
		if request.Password != request.PasswordConfirmation {
			validation(c, "password", "The password confirmation does not match.")
		}
		return
	}
	registration := identity.Registration{Name: request.Name, Username: request.Username, Email: request.Email, Password: request.Password,
		Role: "customer", PhoneNumber: request.PhoneNumber, Gender: request.Gender, DateOfBirth: request.DateOfBirth,
		Religion: request.Religion, Allergies: request.Allergies}
	user, err := h.service.Register(c.Request.Context(), registration, c.GetHeader("X-Correlation-ID"))
	if err != nil {
		handleError(c, err)
		return
	}
	_, pair, err := h.service.Login(c.Request.Context(), request.Email, request.Password, "customer", sessionMetadata(c))
	if err != nil {
		handleError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Customer registration successful.", "user": user, "token": pair.AccessToken,
		"access_token": pair.AccessToken, "refresh_token": pair.RefreshToken, "expires_in": pair.ExpiresIn})
}

type providerRegistrationRequest struct {
	FirstName            string `json:"first_name" binding:"required,max=100"`
	LastName             string `json:"last_name" binding:"required,max=100"`
	Username             string `json:"username" binding:"required,max=100"`
	Email                string `json:"email" binding:"required,email,max=255"`
	CountryCode          string `json:"country_code" binding:"required,max=15"`
	PhoneNumber          string `json:"phone_number" binding:"required,max=30"`
	Password             string `json:"password" binding:"required,min=8"`
	PasswordConfirmation string `json:"password_confirmation" binding:"required"`
	ServiceCategory      string `json:"service_category" binding:"omitempty,max=255"`
}

func (h *Handler) registerProvider(c *gin.Context) {
	var request providerRegistrationRequest
	if !bind(c, &request) || request.Password != request.PasswordConfirmation {
		if request.Password != request.PasswordConfirmation {
			validation(c, "password", "The password confirmation does not match.")
		}
		return
	}
	username := request.Username
	registration := identity.Registration{Name: strings.TrimSpace(request.FirstName + " " + request.LastName), Username: &username,
		Email: request.Email, Password: request.Password, Role: "provider", PhoneNumber: strings.TrimSpace(request.CountryCode + " " + strings.ReplaceAll(request.PhoneNumber, " ", "")), ProviderCategory: request.ServiceCategory}
	user, err := h.service.Register(c.Request.Context(), registration, c.GetHeader("X-Correlation-ID"))
	if err != nil {
		handleError(c, err)
		return
	}
	_, pair, err := h.service.Login(c.Request.Context(), request.Email, request.Password, "provider", sessionMetadata(c))
	if err != nil {
		handleError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"message": "Pendaftaran mitra berhasil. Lengkapi dokumen verifikasi untuk membuka seluruh menu.",
		"user":    user, "redirect_url": "/provider/verification", "token": pair.AccessToken,
		"access_token": pair.AccessToken, "refresh_token": pair.RefreshToken, "expires_in": pair.ExpiresIn,
	})
}

func (h *Handler) login(c *gin.Context) {
	var request struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
		Role     string `json:"role" binding:"required,oneof=admin provider customer"`
	}
	if !bind(c, &request) {
		return
	}
	user, pair, err := h.service.Login(c.Request.Context(), request.Email, request.Password, request.Role, sessionMetadata(c))
	if err != nil {
		handleError(c, err)
		return
	}
	redirect := any(nil)
	if user.Role == "provider" {
		redirect = "/provider/verification"
	}
	c.JSON(http.StatusOK, gin.H{"message": "Login successful.", "user": user, "token": pair.AccessToken,
		"access_token": pair.AccessToken, "refresh_token": pair.RefreshToken, "token_type": "Bearer",
		"expires_in": pair.ExpiresIn, "redirect_url": redirect})
}

func (h *Handler) refresh(c *gin.Context) {
	var request struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
		Role         string `json:"role" binding:"required,oneof=admin provider customer"`
	}
	if !bind(c, &request) {
		return
	}
	user, pair, err := h.service.Refresh(c.Request.Context(), request.RefreshToken, request.Role, sessionMetadata(c))
	if err != nil {
		handleError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user, "access_token": pair.AccessToken, "refresh_token": pair.RefreshToken, "token_type": "Bearer", "expires_in": pair.ExpiresIn})
}

func (h *Handler) me(c *gin.Context) {
	actor, _ := authcontext.ActorFrom(c.Request.Context())
	user, err := h.service.Get(c.Request.Context(), actor.UserID)
	if err != nil {
		handleError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user})
}

func (h *Handler) logout(c *gin.Context) {
	var request struct {
		RefreshToken string `json:"refresh_token"`
	}
	_ = c.ShouldBindJSON(&request)
	if err := h.service.Logout(c.Request.Context(), request.RefreshToken); err != nil {
		handleError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Logout successful."})
}

func (h *Handler) changePassword(c *gin.Context) {
	var request struct {
		Current              string `json:"current_password" binding:"required"`
		Password             string `json:"password" binding:"required,min=8"`
		PasswordConfirmation string `json:"password_confirmation" binding:"required"`
	}
	if !bind(c, &request) || request.Password != request.PasswordConfirmation {
		if request.Password != request.PasswordConfirmation {
			validation(c, "password", "The password confirmation does not match.")
		}
		return
	}
	actor, _ := authcontext.ActorFrom(c.Request.Context())
	if err := h.service.ChangePassword(c.Request.Context(), actor.UserID, request.Current, request.Password); err != nil {
		handleError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Password updated successfully."})
}

func bind(c *gin.Context, target any) bool {
	if err := c.ShouldBindJSON(target); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid.", "errors": gin.H{"request": []string{err.Error()}}})
		return false
	}
	return true
}

func validation(c *gin.Context, field, message string) {
	if !c.IsAborted() && !c.Writer.Written() {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid.", "errors": gin.H{field: []string{message}}})
	}
}

func handleError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, identity.ErrInvalidCredentials), errors.Is(err, identity.ErrRefreshReplay):
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Email or password is incorrect."})
	case errors.Is(err, identity.ErrInactive):
		c.JSON(http.StatusForbidden, gin.H{"message": "The account is inactive."})
	case errors.Is(err, identity.ErrConflict):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"message": "The given data was invalid.", "errors": gin.H{"email": []string{"The email has already been taken."}}})
	case errors.Is(err, identity.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"message": "Not found."})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"message": "An internal error occurred."})
	}
}

func sessionMetadata(c *gin.Context) identity.SessionMetadata {
	host, _, err := net.SplitHostPort(c.Request.RemoteAddr)
	if err != nil {
		host = c.ClientIP()
	}
	return identity.SessionMetadata{UserAgent: c.Request.UserAgent(), IPAddress: host}
}
