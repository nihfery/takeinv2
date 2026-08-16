package provider

import (
	"context"
	"errors"
	"net/mail"
	"strings"
	"time"
)

var (
	ErrNotFound   = errors.New("provider resource not found")
	ErrForbidden  = errors.New("provider resource is outside actor scope")
	ErrConflict   = errors.New("provider resource conflict")
	ErrValidation = errors.New("provider input is invalid")
)

type Actor struct {
	UserID      int64
	ProviderID  int64
	BranchID    int64
	Role        string
	Permissions []string
}

type Profile struct {
	ID               int64      `json:"id"`
	UserID           int64      `json:"user_id"`
	DisplayName      string     `json:"display_name"`
	ImageObjectID    *string    `json:"image_object_id,omitempty"`
	PhoneNumber      *string    `json:"phone_number"`
	Category         *string    `json:"category"`
	Status           string     `json:"status"`
	OnboardingStatus string     `json:"onboarding_status"`
	DocumentStatus   string     `json:"document_status"`
	DocumentNote     *string    `json:"document_note"`
	KTPObjectID      *string    `json:"ktp_object_id,omitempty"`
	NIBNumber        *string    `json:"nib_number,omitempty"`
	NIBObjectID      *string    `json:"nib_object_id,omitempty"`
	BusinessObjectID *string    `json:"business_object_id,omitempty"`
	TrialStartsAt    *time.Time `json:"trial_starts_at"`
	TrialEndsAt      *time.Time `json:"trial_ends_at"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type Branch struct {
	ID               int64     `json:"id"`
	ProviderID       int64     `json:"provider_id"`
	Name             string    `json:"branch_name"`
	Email            *string   `json:"email"`
	PhoneCode        string    `json:"phone_code"`
	PhoneNumber      *string   `json:"phone_number"`
	Address          *string   `json:"address"`
	CountryID        *string   `json:"country_id"`
	StateID          *string   `json:"state_id"`
	CityID           *string   `json:"city_id"`
	Latitude         *float64  `json:"latitude"`
	Longitude        *float64  `json:"longitude"`
	ZipCode          *string   `json:"zip_code"`
	WorkingStartHour string    `json:"working_start_hour"`
	WorkingEndHour   string    `json:"working_end_hour"`
	WorkingDays      []string  `json:"working_days"`
	Holidays         []string  `json:"holidays"`
	ImageObjectID    *string   `json:"image_object_id,omitempty"`
	ImageObjectIDs   []string  `json:"image_object_ids"`
	Status           string    `json:"status"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type Staff struct {
	ID            int64     `json:"id"`
	ProviderID    int64     `json:"provider_id"`
	BranchID      *int64    `json:"branch_id"`
	ImageObjectID *string   `json:"image_object_id,omitempty"`
	FirstName     string    `json:"first_name"`
	LastName      string    `json:"last_name"`
	Email         string    `json:"email"`
	Username      *string   `json:"username"`
	CountryCode   *string   `json:"country_code"`
	PhoneNumber   *string   `json:"phone_number"`
	Gender        *string   `json:"gender"`
	DateOfBirth   *string   `json:"date_of_birth"`
	Address       *string   `json:"address"`
	CountryID     *string   `json:"country_id"`
	StateID       *string   `json:"state_id"`
	CityID        *string   `json:"city_id"`
	PostalCode    *string   `json:"postal_code"`
	Bio           *string   `json:"bio"`
	CategoryID    *int64    `json:"category_id"`
	Role          string    `json:"role"`
	CurrentStatus string    `json:"current_status"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}
type EligibleStaff struct {
	Staff      Staff
	ServiceIDs []int64
}

type StaffSchedule struct {
	ID          int64  `json:"id"`
	StaffID     int64  `json:"staff_id"`
	DayOfWeek   string `json:"day_of_week"`
	StartTime   string `json:"start_time"`
	EndTime     string `json:"end_time"`
	IsAvailable bool   `json:"is_available"`
}

type ScheduleInput struct {
	DayOfWeek   string `json:"day_of_week"`
	StartTime   string `json:"start_time"`
	EndTime     string `json:"end_time"`
	IsAvailable *bool  `json:"is_available"`
}

type Entitlement struct {
	Active      bool
	Source      string
	Status      string
	ExpiresAt   string
	MaxBranches int32
}

type BillingClient interface {
	Get(context.Context, int64) (Entitlement, error)
}
type Identity struct {
	UserID, Name, Username, Email, Status string
	Permissions                           []string
}
type IdentityClient interface {
	Get(context.Context, int64) (Identity, error)
	UpdateProfile(context.Context, int64, string, string, string, bool) (Identity, error)
	UpsertBranchAccount(context.Context, BranchAccountInput) (Identity, error)
	SetStatus(context.Context, int64, string) (Identity, error)
}

type Role struct {
	ID             int64     `json:"id"`
	ProviderID     int64     `json:"provider_id"`
	BranchID       int64     `json:"branch_id"`
	IdentityUserID *int64    `json:"identity_user_id"`
	RoleName       string    `json:"role_name"`
	Slug           string    `json:"slug"`
	Description    *string   `json:"description"`
	Status         string    `json:"status"`
	MenuKeys       []string  `json:"menu_keys"`
	AccountName    string    `json:"account_name"`
	AccountEmail   string    `json:"account_email"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type RoleInput struct {
	RoleName        string   `json:"role_name"`
	BranchID        int64    `json:"branch_id"`
	Description     string   `json:"description"`
	Status          string   `json:"status"`
	MenuKeys        []string `json:"menu_keys"`
	AccountName     string   `json:"account_name"`
	AccountEmail    string   `json:"account_email"`
	AccountPassword string   `json:"account_password"`
}

type BranchAccountInput struct {
	ProviderID, BranchID, ProviderRoleID int64
	Name, Email, Password, Status        string
	Permissions                          []string
}

func (input RoleInput) Validate(requirePassword bool) error {
	input.RoleName = strings.TrimSpace(input.RoleName)
	input.AccountName = strings.TrimSpace(input.AccountName)
	input.AccountEmail = strings.ToLower(strings.TrimSpace(input.AccountEmail))
	if input.RoleName == "" || len(input.RoleName) > 120 || input.BranchID <= 0 || input.AccountName == "" || len(input.AccountName) > 255 || input.AccountEmail == "" || len(input.AccountEmail) > 255 || len(input.Description) > 1000 {
		return ErrValidation
	}
	address, err := mail.ParseAddress(input.AccountEmail)
	if err != nil || !strings.EqualFold(address.Address, input.AccountEmail) || requirePassword && len(input.AccountPassword) < 8 || input.AccountPassword != "" && len(input.AccountPassword) < 8 {
		return ErrValidation
	}
	if input.Status != "active" && input.Status != "inactive" {
		return ErrValidation
	}
	allowed := map[string]struct{}{
		"dashboard": {}, "bookings": {}, "calendar": {}, "queue": {}, "walk_in": {},
		"services": {}, "branch": {}, "staffs": {}, "staff_skills": {}, "staff_schedules": {},
		"customers": {}, "reviews": {}, "payments": {}, "chat": {}, "notifications": {},
		"tickets": {}, "profile": {},
	}
	for _, key := range input.MenuKeys {
		if _, ok := allowed[key]; !ok {
			return ErrValidation
		}
	}
	return nil
}

type MediaClient interface {
	Store(context.Context, string, string, string, []byte, string) (string, error)
	Reference(context.Context, string) error
	Download(context.Context, string) (string, error)
}
type CatalogClient interface {
	ValidateServices(context.Context, int64, int64, []int64) error
}
type ProfileInput struct {
	Name          string `json:"name" form:"name"`
	Username      string `json:"username" form:"username"`
	Email         string `json:"email" form:"email"`
	PhoneNumber   string `json:"phone_number" form:"phone_number"`
	ImageObjectID string `json:"image_object_id" form:"image_object_id"`
}

func (input ProfileInput) Validate() error {
	if strings.TrimSpace(input.Name) == "" || len(input.Name) > 255 || strings.TrimSpace(input.Email) == "" || len(input.Email) > 255 || len(input.Username) > 255 || len(input.PhoneNumber) > 255 {
		return ErrValidation
	}
	address, err := mail.ParseAddress(input.Email)
	if err != nil || !strings.EqualFold(address.Address, strings.TrimSpace(input.Email)) {
		return ErrValidation
	}
	return nil
}

type BranchInput struct {
	Name             string   `json:"branch_name" form:"branch_name"`
	Email            string   `json:"email" form:"email"`
	PhoneCode        string   `json:"phone_code" form:"phone_code"`
	PhoneNumber      string   `json:"phone_number" form:"phone_number"`
	Address          string   `json:"address" form:"address"`
	CountryID        string   `json:"country_id" form:"country_id"`
	StateID          string   `json:"state_id" form:"state_id"`
	CityID           string   `json:"city_id" form:"city_id"`
	Latitude         *float64 `json:"latitude" form:"latitude"`
	Longitude        *float64 `json:"longitude" form:"longitude"`
	ZipCode          string   `json:"zip_code" form:"zip_code"`
	WorkingStartHour string   `json:"working_start_hour" form:"working_start_hour"`
	WorkingEndHour   string   `json:"working_end_hour" form:"working_end_hour"`
	WorkingDays      []string `json:"working_days" form:"working_days"`
	Holidays         []string `json:"holidays" form:"holidays"`
	ImageObjectID    *string  `json:"image_object_id" form:"image_object_id"`
	ImageObjectIDs   []string `json:"image_object_ids" form:"image_object_ids"`
	Status           string   `json:"status" form:"status"`
}
type StaffInput struct {
	BranchID      *int64  `json:"branch_id" form:"branch_id"`
	ImageObjectID *string `json:"image_object_id" form:"image_object_id"`
	FirstName     string  `json:"first_name" form:"first_name"`
	LastName      string  `json:"last_name" form:"last_name"`
	Email         string  `json:"email" form:"email"`
	Username      string  `json:"username" form:"username"`
	CountryCode   string  `json:"country_code" form:"country_code"`
	PhoneNumber   string  `json:"phone_number" form:"phone_number"`
	Gender        string  `json:"gender" form:"gender"`
	DateOfBirth   string  `json:"date_of_birth" form:"date_of_birth"`
	Address       string  `json:"address" form:"address"`
	CountryID     string  `json:"country_id" form:"country_id"`
	StateID       string  `json:"state_id" form:"state_id"`
	CityID        string  `json:"city_id" form:"city_id"`
	PostalCode    string  `json:"postal_code" form:"postal_code"`
	Bio           string  `json:"bio" form:"bio"`
	CategoryID    *int64  `json:"category_id" form:"category_id"`
	Role          string  `json:"role" form:"role"`
	Status        string  `json:"status" form:"status"`
}

func (input BranchInput) Validate() error {
	if strings.TrimSpace(input.Name) == "" || strings.TrimSpace(input.Email) == "" || strings.TrimSpace(input.PhoneCode) == "" || strings.TrimSpace(input.PhoneNumber) == "" || strings.TrimSpace(input.Address) == "" || strings.TrimSpace(input.CountryID) == "" || strings.TrimSpace(input.StateID) == "" || strings.TrimSpace(input.CityID) == "" || strings.TrimSpace(input.ZipCode) == "" || len(input.WorkingDays) == 0 {
		return ErrValidation
	}
	if _, err := mail.ParseAddress(input.Email); err != nil {
		return ErrValidation
	}
	start, startErr := time.Parse("15:04", input.WorkingStartHour)
	end, endErr := time.Parse("15:04", input.WorkingEndHour)
	if startErr != nil || endErr != nil || !end.After(start) {
		return ErrValidation
	}
	if input.Latitude != nil && (*input.Latitude < -90 || *input.Latitude > 90) || input.Longitude != nil && (*input.Longitude < -180 || *input.Longitude > 180) {
		return ErrValidation
	}
	if input.Status != "" && input.Status != "active" && input.Status != "inactive" {
		return ErrValidation
	}
	for _, holiday := range input.Holidays {
		if holiday != "" {
			if _, err := time.Parse("2006-01-02", holiday); err != nil {
				return ErrValidation
			}
		}
	}
	return nil
}

func (input StaffInput) Validate() error {
	if input.BranchID == nil || *input.BranchID <= 0 || input.CategoryID == nil || *input.CategoryID <= 0 || strings.TrimSpace(input.FirstName) == "" || strings.TrimSpace(input.LastName) == "" || strings.TrimSpace(input.Email) == "" {
		return ErrValidation
	}
	if _, err := mail.ParseAddress(input.Email); err != nil {
		return ErrValidation
	}
	if input.Gender != "" && input.Gender != "male" && input.Gender != "female" && input.Gender != "other" {
		return ErrValidation
	}
	if input.DateOfBirth != "" {
		if _, err := time.Parse("2006-01-02", input.DateOfBirth); err != nil {
			return ErrValidation
		}
	}
	if input.Status != "" && input.Status != "active" && input.Status != "inactive" {
		return ErrValidation
	}
	return nil
}

type Repository interface {
	ProfileByUser(context.Context, int64) (Profile, error)
	ProfileByID(context.Context, int64) (Profile, error)
	UpdateProfile(context.Context, int64, map[string]any) (Profile, error)
	UpdateDocuments(context.Context, int64, map[string]any) (Profile, error)
	ListBranches(context.Context, int64) ([]Branch, error)
	Branch(context.Context, int64) (Branch, error)
	CreateBranch(context.Context, int64, BranchInput) (Branch, error)
	CreateBranchWithLimit(context.Context, int64, BranchInput, int32) (Branch, error)
	UpdateBranch(context.Context, int64, int64, BranchInput) (Branch, error)
	DeleteBranch(context.Context, int64, int64) error
	AssignBranchStaff(context.Context, int64, int64, []int64) error
	ListStaff(context.Context, int64) ([]Staff, error)
	Staff(context.Context, int64) (Staff, error)
	CreateStaff(context.Context, int64, StaffInput) (Staff, error)
	UpdateStaff(context.Context, int64, int64, StaffInput) (Staff, error)
	DeleteStaff(context.Context, int64, int64) error
	StaffSkills(context.Context, int64) ([]int64, error)
	ReplaceStaffSkills(context.Context, int64, int64, []int64) ([]int64, error)
	StaffSchedules(context.Context, int64) ([]StaffSchedule, error)
	ReplaceStaffSchedules(context.Context, int64, int64, []ScheduleInput) ([]StaffSchedule, error)
	ListRoles(context.Context, int64) ([]Role, error)
	Role(context.Context, int64) (Role, error)
	CreateRole(context.Context, int64, RoleInput) (Role, error)
	UpdateRole(context.Context, int64, int64, RoleInput) (Role, error)
	AttachRoleIdentity(context.Context, int64, int64, int64) (Role, error)
	SetRoleStatus(context.Context, int64, int64, string) (Role, error)
	ListProviders(context.Context) ([]Profile, error)
	SetDocumentStatus(context.Context, int64, string, string) (Profile, error)
	ToggleProviderStatus(context.Context, int64) (Profile, error)
	DeleteProvider(context.Context, int64) error
	ResolveEligibleStaff(context.Context, int64, int64, []int64, time.Time, time.Time) ([]EligibleStaff, error)
}
