package customer

import (
	"context"
	"errors"
	"net/mail"
	"strings"
	"time"
)

var (
	ErrNotFound         = errors.New("customer not found")
	ErrConflict         = errors.New("customer conflict")
	ErrForbidden        = errors.New("customer outside actor scope")
	ErrReviewIneligible = errors.New("review is not eligible")
	ErrValidation       = errors.New("customer profile is invalid")
)

type ReviewEligibility struct {
	Eligible            bool
	Reason              string
	BookingID, BranchID int64
	StaffIDs            []int64
}
type BookingClient interface {
	ReviewEligibility(context.Context, string, int64) (ReviewEligibility, error)
}
type Identity struct {
	UserID, Name, Username, Email string
}
type IdentityClient interface {
	Get(context.Context, int64) (Identity, error)
	UpdateProfile(context.Context, int64, string, string, string, bool) (Identity, error)
}
type MediaClient interface {
	Store(context.Context, string, string, string, []byte, string) (string, error)
	Reference(context.Context, string) error
}
type ProfileInput struct {
	Name, Email, PhoneNumber, Gender, DateOfBirth, Religion, Allergies string
	AddressLine1, AddressLine2, City, State, Country                   string
}

func (input ProfileInput) Validate() error {
	input.Name, input.Email = strings.TrimSpace(input.Name), strings.ToLower(strings.TrimSpace(input.Email))
	address, err := mail.ParseAddress(input.Email)
	if input.Name == "" || len(input.Name) > 255 || err != nil || !strings.EqualFold(address.Address, input.Email) || len(input.Email) > 255 {
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
	return nil
}

type ReviewInput struct {
	Rating         int32
	Comment        string
	StaffID        *int64
	StaffRating    *int32
	StaffComment   string
	ImageObjectIDs []string
}

type Repository interface {
	ProfileByUser(context.Context, int64) (map[string]any, error)
	UpdateProfile(context.Context, int64, map[string]any) (map[string]any, error)
	Activity(context.Context, int64, int32, int32) ([]map[string]any, error)
	ActivitySummary(context.Context, int64) (map[string]any, error)
	Favorites(context.Context, int64) ([]int64, error)
	AddFavorite(context.Context, int64, int64) error
	RemoveFavorite(context.Context, int64, int64) error
	CreateReview(context.Context, int64, int64, int64, ReviewInput) (map[string]any, error)
	HasReview(context.Context, int64, int64) (bool, error)
	List(context.Context) ([]map[string]any, error)
	ByID(context.Context, int64) (map[string]any, error)
	Delete(context.Context, int64) error
	Toggle(context.Context, int64) (map[string]any, error)
	ListProviderCustomers(context.Context, int64, *int64, string) (map[string]any, error)
	ListProviderReviews(context.Context, int64, *int64, *int32) (map[string]any, error)
}
type Service struct {
	repository Repository
	booking    BookingClient
	identity   IdentityClient
	media      MediaClient
}

func NewService(repository Repository) *Service            { return &Service{repository: repository} }
func (s *Service) Repository() Repository                  { return s.repository }
func ValidRating(value int32) bool                         { return value >= 1 && value <= 5 }
func (s *Service) ConfigureBooking(client BookingClient)   { s.booking = client }
func (s *Service) ConfigureIdentity(client IdentityClient) { s.identity = client }
func (s *Service) ConfigureMedia(client MediaClient)       { s.media = client }

func (s *Service) StoreReviewMedia(ctx context.Context, fileName, contentType string, content []byte) (string, error) {
	if s.media == nil {
		return "", errors.New("media service is unavailable")
	}
	return s.media.Store(ctx, "customer-review", fileName, contentType, content, "public")
}

func (s *Service) ValidateReviewMedia(ctx context.Context, objectIDs []string) error {
	if len(objectIDs) == 0 {
		return nil
	}
	if len(objectIDs) > 5 || s.media == nil {
		return ErrValidation
	}
	for _, objectID := range objectIDs {
		if strings.TrimSpace(objectID) == "" {
			return ErrValidation
		}
		if err := s.media.Reference(ctx, objectID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) Profile(ctx context.Context, userID int64) (map[string]any, error) {
	profile, err := s.repository.ProfileByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	if s.identity == nil {
		return nil, errors.New("identity service is unavailable")
	}
	value, err := s.identity.Get(ctx, userID)
	if err != nil {
		return nil, err
	}
	profile["user_id"], profile["name"], profile["username"], profile["email"] = value.UserID, value.Name, value.Username, value.Email
	return profile, nil
}

func (s *Service) UpdateProfile(ctx context.Context, userID int64, input ProfileInput) (map[string]any, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}
	if s.identity == nil {
		return nil, errors.New("identity service is unavailable")
	}
	identityValue, err := s.identity.UpdateProfile(ctx, userID, input.Name, input.Email, "", false)
	if err != nil {
		return nil, err
	}
	values := map[string]any{"phone_number": input.PhoneNumber, "gender": input.Gender, "date_of_birth": input.DateOfBirth, "religion": input.Religion, "allergies": input.Allergies, "address_line_1": input.AddressLine1, "address_line_2": input.AddressLine2, "city": input.City, "state": input.State, "country": input.Country}
	profile, err := s.repository.UpdateProfile(ctx, userID, values)
	if err != nil {
		return nil, err
	}
	profile["user_id"], profile["name"], profile["username"], profile["email"] = identityValue.UserID, identityValue.Name, identityValue.Username, identityValue.Email
	return profile, nil
}

func (s *Service) CreateReview(ctx context.Context, userID int64, bookingCode string, input ReviewInput) (map[string]any, error) {
	if !ValidRating(input.Rating) || input.StaffRating != nil && !ValidRating(*input.StaffRating) {
		return nil, ErrReviewIneligible
	}
	if input.StaffID == nil && input.StaffRating != nil || input.StaffID != nil && input.StaffRating == nil {
		return nil, ErrValidation
	}
	if err := s.ValidateReviewMedia(ctx, input.ImageObjectIDs); err != nil {
		return nil, err
	}
	if s.booking == nil {
		return nil, errors.New("booking service is unavailable")
	}
	eligibility, err := s.booking.ReviewEligibility(ctx, bookingCode, userID)
	if err != nil {
		return nil, err
	}
	if !eligibility.Eligible {
		return nil, errors.New(ErrReviewIneligible.Error() + ": " + eligibility.Reason)
	}
	if input.StaffID != nil {
		allowed := false
		for _, id := range eligibility.StaffIDs {
			if id == *input.StaffID {
				allowed = true
				break
			}
		}
		if !allowed {
			return nil, errors.New(ErrReviewIneligible.Error() + ": selected professional was not part of this booking")
		}
	}
	return s.repository.CreateReview(ctx, userID, eligibility.BookingID, eligibility.BranchID, input)
}
