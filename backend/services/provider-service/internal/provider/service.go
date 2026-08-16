package provider

import (
	"context"
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"
)

type Service struct {
	repository Repository
	billing    BillingClient
	identity   IdentityClient
	media      MediaClient
	catalog    CatalogClient
}

func NewService(repository Repository) *Service { return &Service{repository: repository} }

func (s *Service) ConfigureBilling(client BillingClient)   { s.billing = client }
func (s *Service) ConfigureIdentity(client IdentityClient) { s.identity = client }
func (s *Service) ConfigureMedia(client MediaClient)       { s.media = client }
func (s *Service) ConfigureCatalog(client CatalogClient)   { s.catalog = client }

func (s *Service) Identity(ctx context.Context, userID int64) (Identity, error) {
	if s.identity == nil {
		return Identity{}, errors.New("identity service is unavailable")
	}
	return s.identity.Get(ctx, userID)
}

func (s *Service) UpdateProfile(ctx context.Context, actor Actor, profile Profile, input ProfileInput) (Profile, Identity, error) {
	if actor.BranchID > 0 || actor.Role != "provider" || actor.ProviderID != profile.ID {
		return Profile{}, Identity{}, ErrForbidden
	}
	if err := input.Validate(); err != nil {
		return Profile{}, Identity{}, err
	}
	if s.identity == nil {
		return Profile{}, Identity{}, errors.New("identity service is unavailable")
	}
	identityValue, err := s.identity.UpdateProfile(ctx, profile.UserID, input.Name, input.Email, input.Username, input.Username == "")
	if err != nil {
		return Profile{}, Identity{}, err
	}
	if input.ImageObjectID != "" {
		if s.media == nil {
			return Profile{}, Identity{}, errors.New("media service is unavailable")
		}
		if err = s.media.Reference(ctx, input.ImageObjectID); err != nil {
			return Profile{}, Identity{}, err
		}
	}
	updated, err := s.repository.UpdateProfile(ctx, profile.ID, map[string]any{"name": input.Name, "phone_number": input.PhoneNumber, "image_object_id": input.ImageObjectID})
	return updated, identityValue, err
}

func (s *Service) StoreMedia(ctx context.Context, purpose, fileName, contentType string, content []byte, visibility string) (string, error) {
	if s.media == nil {
		return "", errors.New("media service is unavailable")
	}
	return s.media.Store(ctx, purpose, fileName, contentType, content, visibility)
}

func (s *Service) ReferenceMedia(ctx context.Context, objectID string) error {
	if s.media == nil {
		return errors.New("media service is unavailable")
	}
	return s.media.Reference(ctx, objectID)
}

func (s *Service) DocumentURL(ctx context.Context, profile Profile, document string) (string, error) {
	if s.media == nil {
		return "", errors.New("media service is unavailable")
	}
	var objectID *string
	switch document {
	case "ktp", "ktp_image":
		objectID = profile.KTPObjectID
	case "nib", "nib_document":
		objectID = profile.NIBObjectID
	case "business", "business_image":
		objectID = profile.BusinessObjectID
	default:
		return "", ErrNotFound
	}
	if objectID == nil || *objectID == "" {
		return "", ErrNotFound
	}
	return s.media.Download(ctx, *objectID)
}

func (s *Service) ResolveProfile(ctx context.Context, actor Actor) (Profile, error) {
	if actor.Role == "provider" && actor.ProviderID > 0 {
		return s.repository.ProfileByID(ctx, actor.ProviderID)
	}
	return s.repository.ProfileByUser(ctx, actor.UserID)
}

func CheckScope(actor Actor, providerID int64, branchID *int64) error {
	if actor.Role == "admin" {
		return nil
	}
	if actor.Role != "provider" || actor.ProviderID != providerID {
		return ErrForbidden
	}
	if actor.BranchID > 0 && branchID != nil && *branchID != actor.BranchID {
		return ErrForbidden
	}
	return nil
}

func HasPermission(actor Actor, permission string) bool {
	return actor.Role == "admin" || slices.Contains(actor.Permissions, permission)
}

func ValidOnboardingTransition(from, to string) bool {
	allowed := map[string][]string{
		"not_started": {"in_progress", "skipped"},
		"in_progress": {"completed", "skipped"},
		"skipped":     {"in_progress", "completed"},
		"completed":   {},
	}
	return slices.Contains(allowed[from], to)
}

func (s *Service) ScopedBranch(ctx context.Context, actor Actor, id int64) (Branch, error) {
	branch, err := s.repository.Branch(ctx, id)
	if err != nil {
		return Branch{}, err
	}
	if err := CheckScope(actor, branch.ProviderID, &branch.ID); err != nil {
		return Branch{}, err
	}
	return branch, nil
}

func (s *Service) CreateBranch(ctx context.Context, actor Actor, input BranchInput) (Branch, error) {
	if err := input.Validate(); err != nil {
		return Branch{}, err
	}
	if input.ImageObjectID == nil || strings.TrimSpace(*input.ImageObjectID) == "" {
		return Branch{}, ErrValidation
	}
	profile, err := s.ResolveProfile(ctx, actor)
	if err != nil {
		return Branch{}, err
	}
	if err = CheckScope(actor, profile.ID, nil); err != nil {
		return Branch{}, err
	}
	if s.billing == nil {
		return Branch{}, errors.New("billing entitlement client is unavailable")
	}
	entitlement, err := s.billing.Get(ctx, profile.ID)
	if err != nil {
		return Branch{}, err
	}
	if !entitlement.Active || entitlement.MaxBranches <= 0 {
		return Branch{}, ErrForbidden
	}
	return s.repository.CreateBranchWithLimit(ctx, profile.ID, input, entitlement.MaxBranches)
}

func (s *Service) ScopedStaff(ctx context.Context, actor Actor, id int64) (Staff, error) {
	staff, err := s.repository.Staff(ctx, id)
	if err != nil {
		return Staff{}, err
	}
	if err := CheckScope(actor, staff.ProviderID, staff.BranchID); err != nil {
		return Staff{}, err
	}
	return staff, nil
}

func (s *Service) ReplaceStaffSkills(ctx context.Context, actor Actor, staffID int64, serviceIDs []int64) ([]int64, error) {
	staff, err := s.ScopedStaff(ctx, actor, staffID)
	if err != nil {
		return nil, err
	}
	if staff.BranchID == nil || *staff.BranchID <= 0 {
		return nil, ErrValidation
	}
	unique := make([]int64, 0, len(serviceIDs))
	seen := map[int64]struct{}{}
	for _, serviceID := range serviceIDs {
		if serviceID <= 0 {
			return nil, ErrValidation
		}
		if _, exists := seen[serviceID]; exists {
			continue
		}
		seen[serviceID] = struct{}{}
		unique = append(unique, serviceID)
	}
	if len(unique) > 0 {
		if s.catalog == nil {
			return nil, errors.New("catalog service is unavailable")
		}
		if err = s.catalog.ValidateServices(ctx, staff.ProviderID, *staff.BranchID, unique); err != nil {
			return nil, ErrValidation
		}
	}
	return s.repository.ReplaceStaffSkills(ctx, staff.ProviderID, staff.ID, unique)
}

func (s *Service) ReplaceStaffSchedules(ctx context.Context, actor Actor, staffID int64, inputs []ScheduleInput) ([]StaffSchedule, error) {
	staff, err := s.ScopedStaff(ctx, actor, staffID)
	if err != nil {
		return nil, err
	}
	if len(inputs) == 0 || len(inputs) > 14 {
		return nil, ErrValidation
	}
	seen := map[string]struct{}{}
	for index := range inputs {
		inputs[index].DayOfWeek = strings.ToLower(strings.TrimSpace(inputs[index].DayOfWeek))
		if !validScheduleDay(inputs[index].DayOfWeek) {
			return nil, ErrValidation
		}
		start, startErr := time.Parse("15:04", inputs[index].StartTime)
		end, endErr := time.Parse("15:04", inputs[index].EndTime)
		if startErr != nil || endErr != nil || !end.After(start) {
			return nil, ErrValidation
		}
		key := inputs[index].DayOfWeek + ":" + inputs[index].StartTime + ":" + inputs[index].EndTime
		if _, duplicate := seen[key]; duplicate {
			return nil, ErrValidation
		}
		seen[key] = struct{}{}
	}
	return s.repository.ReplaceStaffSchedules(ctx, staff.ProviderID, staff.ID, inputs)
}

func validScheduleDay(value string) bool {
	return slices.Contains([]string{
		"0", "1", "2", "3", "4", "5", "6",
		"sun", "mon", "tue", "wed", "thu", "fri", "sat",
		"sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
		"minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu",
	}, value)
}

func providerOwner(actor Actor) bool {
	return actor.Role == "provider" && actor.ProviderID > 0 && actor.BranchID == 0
}

func (s *Service) ListRoles(ctx context.Context, actor Actor) ([]Role, error) {
	if !providerOwner(actor) {
		return nil, ErrForbidden
	}
	return s.repository.ListRoles(ctx, actor.ProviderID)
}

func (s *Service) CreateRole(ctx context.Context, actor Actor, input RoleInput) (Role, error) {
	if !providerOwner(actor) {
		return Role{}, ErrForbidden
	}
	if err := input.Validate(true); err != nil {
		return Role{}, err
	}
	branch, err := s.repository.Branch(ctx, input.BranchID)
	if err != nil || branch.ProviderID != actor.ProviderID {
		return Role{}, ErrForbidden
	}
	if s.identity == nil {
		return Role{}, errors.New("identity service is unavailable")
	}
	role, err := s.repository.CreateRole(ctx, actor.ProviderID, input)
	if err != nil {
		return Role{}, err
	}
	identityValue, err := s.identity.UpsertBranchAccount(ctx, BranchAccountInput{
		ProviderID: actor.ProviderID, BranchID: input.BranchID, ProviderRoleID: role.ID,
		Name: input.AccountName, Email: input.AccountEmail, Password: input.AccountPassword,
		Status: role.Status, Permissions: role.MenuKeys,
	})
	if err != nil {
		return Role{}, err
	}
	identityID, parseErr := strconv.ParseInt(identityValue.UserID, 10, 64)
	if parseErr != nil || identityID <= 0 {
		return Role{}, errors.New("identity service returned an invalid branch account")
	}
	return s.repository.AttachRoleIdentity(ctx, actor.ProviderID, role.ID, identityID)
}

func (s *Service) UpdateRole(ctx context.Context, actor Actor, roleID int64, input RoleInput) (Role, error) {
	if !providerOwner(actor) {
		return Role{}, ErrForbidden
	}
	if err := input.Validate(false); err != nil {
		return Role{}, err
	}
	branch, err := s.repository.Branch(ctx, input.BranchID)
	if err != nil || branch.ProviderID != actor.ProviderID {
		return Role{}, ErrForbidden
	}
	current, err := s.repository.Role(ctx, roleID)
	if err != nil {
		return Role{}, err
	}
	if current.ProviderID != actor.ProviderID {
		return Role{}, ErrForbidden
	}
	updated, err := s.repository.UpdateRole(ctx, actor.ProviderID, roleID, input)
	if err != nil {
		return Role{}, err
	}
	if s.identity == nil {
		return Role{}, errors.New("identity service is unavailable")
	}
	identityValue, err := s.identity.UpsertBranchAccount(ctx, BranchAccountInput{
		ProviderID: actor.ProviderID, BranchID: input.BranchID, ProviderRoleID: updated.ID,
		Name: input.AccountName, Email: input.AccountEmail, Password: input.AccountPassword,
		Status: updated.Status, Permissions: updated.MenuKeys,
	})
	if err != nil {
		return Role{}, err
	}
	if updated.IdentityUserID == nil {
		identityID, parseErr := strconv.ParseInt(identityValue.UserID, 10, 64)
		if parseErr != nil || identityID <= 0 {
			return Role{}, errors.New("identity service returned an invalid branch account")
		}
		return s.repository.AttachRoleIdentity(ctx, actor.ProviderID, updated.ID, identityID)
	}
	return updated, nil
}

func (s *Service) ToggleRole(ctx context.Context, actor Actor, roleID int64) (Role, error) {
	if !providerOwner(actor) {
		return Role{}, ErrForbidden
	}
	role, err := s.repository.Role(ctx, roleID)
	if err != nil {
		return Role{}, err
	}
	if role.ProviderID != actor.ProviderID {
		return Role{}, ErrForbidden
	}
	status := "active"
	if role.Status == "active" {
		status = "inactive"
	}
	updated, err := s.repository.SetRoleStatus(ctx, actor.ProviderID, role.ID, status)
	if err != nil {
		return Role{}, err
	}
	if updated.IdentityUserID != nil && s.identity != nil {
		if _, err = s.identity.SetStatus(ctx, *updated.IdentityUserID, status); err != nil {
			return Role{}, err
		}
	}
	return updated, nil
}

func (s *Service) Repository() Repository { return s.repository }
