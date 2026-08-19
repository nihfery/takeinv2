package booking

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/nihfery/takein/libs/go/domainmetrics"
)

var (
	ErrNotFound              = errors.New("booking not found")
	ErrForbidden             = errors.New("booking is outside actor scope")
	ErrSlotConflict          = errors.New("staff slot is no longer available")
	ErrIdempotencyMismatch   = errors.New("idempotency key was reused with a different request")
	ErrIdempotencyInProgress = errors.New("idempotent request is still in progress")
	ErrInvalidTransition     = errors.New("invalid booking state transition")
	ErrPaymentMismatch       = errors.New("payment amount or currency does not match booking")
)

type Booking struct {
	ID               int64      `json:"id"`
	BookingCode      string     `json:"booking_code"`
	ProviderID       int64      `json:"provider_id"`
	CustomerID       *int64     `json:"customer_id"`
	BranchID         *int64     `json:"branch_id"`
	StaffID          *int64     `json:"staff_id"`
	BookingType      string     `json:"booking_type"`
	BookingDate      string     `json:"booking_date"`
	ParticipantCount int32      `json:"participant_count"`
	Status           string     `json:"status"`
	StartsAt         *time.Time `json:"starts_at"`
	EndsAt           *time.Time `json:"ends_at"`
	ActualStartedAt  *time.Time `json:"actual_started_at"`
	ActualEndedAt    *time.Time `json:"actual_ended_at"`
	TotalDuration    int32      `json:"total_duration"`
	TotalPriceMinor  int64      `json:"total_price_minor"`
	Currency         string     `json:"currency"`
	PaymentType      string     `json:"payment_type"`
	PaymentChannel   string     `json:"payment_channel,omitempty"`
	PaymentAmount    int64      `json:"payment_amount_minor"`
	DPAmount         int64      `json:"dp_amount_minor"`
	CustomerName     *string    `json:"customer_name"`
	CustomerPhone    *string    `json:"customer_phone"`
	Notes            *string    `json:"notes"`
	QueueNumber      *int32     `json:"queue_number"`
	CheckedInAt      *time.Time `json:"checked_in_at"`
	CompletedAt      *time.Time `json:"completed_at"`
	HeldAt           *time.Time `json:"held_at"`
	HoldExpiresAt    *time.Time `json:"hold_expires_at"`
	ExpiredAt        *time.Time `json:"expired_at"`
	IdempotencyKey   *string    `json:"idempotency_key"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type CreateInput struct {
	ProviderID       int64      `json:"provider_id"`
	CustomerID       int64      `json:"-"`
	BranchID         *int64     `json:"branch_id"`
	StaffID          *int64     `json:"staff_id"`
	BookingType      string     `json:"booking_type"`
	BookingDate      string     `json:"booking_date"`
	StartsAt         *time.Time `json:"starts_at"`
	EndsAt           *time.Time `json:"ends_at"`
	TotalDuration    int32      `json:"total_duration"`
	TotalPriceMinor  int64      `json:"total_price_minor"`
	Currency         string     `json:"currency"`
	Status           string     `json:"-"`
	PaymentType      string     `json:"payment_type"`
	PaymentChannel   string     `json:"payment_channel"`
	PaymentAmount    int64      `json:"payment_amount_minor"`
	DPAmount         int64      `json:"dp_amount_minor"`
	CustomerName     string     `json:"customer_name"`
	CustomerPhone    string     `json:"customer_phone"`
	Notes            string     `json:"notes"`
	IdempotencyKey   string     `json:"-"`
	IdempotencyActor string     `json:"-"`
	IdempotencyID    int64      `json:"-"`
	RequestHash      string     `json:"-"`
	ParticipantCount int32      `json:"participant_count"`
	Services         []ServiceSnapshot
	Participants     []Participant
}

type ServiceSnapshot struct {
	ServiceID, ProviderID          int64
	Title, Currency                string
	PriceMinor, DPAmountMinor      int64
	Duration                       int32
	QueueEnabled, ScheduledEnabled bool
	RequiresDP                     bool
}
type Participant struct {
	Position                                          int32
	Primary                                           bool
	Name, Phone, Email, Gender, AgeGroup, Description string
	StaffID                                           *int64
	StartsAt, EndsAt                                  *time.Time
	Services                                          []ServiceSnapshot
}
type ParticipantRequest struct {
	Position    int32   `json:"position"`
	Primary     bool    `json:"is_primary"`
	Name        string  `json:"name"`
	Phone       string  `json:"phone"`
	Email       string  `json:"email"`
	Gender      string  `json:"gender"`
	AgeGroup    string  `json:"age_group"`
	Description string  `json:"description"`
	ServiceIDs  []int64 `json:"service_ids"`
	StaffID     *int64  `json:"staff_id"`
	BookingDate string  `json:"booking_date"`
	StartTime   string  `json:"start_time"`
}
type GuestRequest struct {
	Name        string `json:"name"`
	Phone       string `json:"phone"`
	Email       string `json:"email"`
	Gender      string `json:"gender"`
	AgeGroup    string `json:"age_group"`
	Description string `json:"description"`
}
type CreateRequest struct {
	BranchID              int64                `json:"branch_id"`
	ServiceIDs            []int64              `json:"service_ids"`
	BookingType           string               `json:"booking_type"`
	StaffID               *int64               `json:"staff_id"`
	BookingDate           string               `json:"booking_date"`
	StartTime             string               `json:"start_time"`
	PaymentType           string               `json:"payment_type"`
	PaymentChannel        string               `json:"payment_channel"`
	CouponCode            string               `json:"coupon_code"`
	Notes                 string               `json:"notes"`
	HoldOnly              bool                 `json:"hold_only"`
	IdempotencyKey        string               `json:"idempotency_key"`
	ParticipantCount      int32                `json:"participant_count"`
	Guests                []GuestRequest       `json:"guests"`
	ParticipantSelections []ParticipantRequest `json:"participant_selections"`
}
type FinalizeRequest struct {
	PaymentType      string         `json:"payment_type"`
	PaymentChannel   string         `json:"payment_channel"`
	CouponCode       string         `json:"coupon_code"`
	Notes            string         `json:"notes"`
	ParticipantCount int32          `json:"participant_count"`
	Guests           []GuestRequest `json:"guests"`
}
type FinalizeInput struct {
	PaymentType      string
	PaymentChannel   string
	Notes            string
	ParticipantCount int32
	Guests           []GuestRequest
	TotalPriceMinor  *int64
}

type ProviderCreateRequest struct {
	CustomerName   string  `json:"customer_name"`
	CustomerPhone  string  `json:"customer_phone"`
	BranchID       int64   `json:"branch_id"`
	ServiceIDs     []int64 `json:"service_ids"`
	BookingDate    string  `json:"booking_date"`
	StartTime      string  `json:"start_time"`
	StaffID        int64   `json:"staff_id"`
	Notes          string  `json:"notes"`
	PaymentType    string  `json:"payment_type"`
	PaymentChannel string  `json:"payment_channel"`
}

type ProviderUpdateRequest struct {
	CustomerName  string `json:"customer_name" binding:"max=255"`
	CustomerPhone string `json:"customer_phone" binding:"max=30"`
	Notes         string `json:"notes" binding:"max=2000"`
}

type ProviderListFilter struct {
	ProviderID  int64
	BranchID    *int64
	BookingDate string
	DateFrom    string
	DateTo      string
	BookingType string
	Status      string
	Mode        string
}
type EligibleStaff struct {
	ID, BranchID int64
	ServiceIDs   []int64
	Status       string
}
type CatalogClient interface {
	Snapshots(context.Context, int64, []int64) ([]ServiceSnapshot, error)
	BookingPage(context.Context, int64) (map[string]any, error)
	PriceSummary(context.Context, string, []int64, int64, string, string) (PriceSummary, error)
	ReleaseCoupon(context.Context, string) error
}

type PriceSummary struct {
	SubtotalMinor int64
	DiscountMinor int64
	TaxMinor      int64
	PayableMinor  int64
}
type ProviderClient interface {
	EligibleStaff(context.Context, int64, int64, []int64, time.Time, time.Time) ([]EligibleStaff, error)
}

type PaymentStateInput struct {
	EventID     string
	PaymentID   int64
	BookingID   int64
	Status      string
	AmountMinor int64
	Currency    string
	Topic       string
	Partition   int32
	Offset      int64
	EventType   string
}

type AvailabilityQuery struct {
	BranchID         int64
	ServiceIDs       []int64
	BookingDate      string
	StaffID          *int64
	HeldBookingID    *int64
	BookingType      string
	ParticipantCount int32
}

type Repository interface {
	Create(context.Context, CreateInput) (Booking, error)
	ListCustomer(context.Context, int64) ([]Booking, error)
	ListProvider(context.Context, ProviderListFilter) ([]Booking, error)
	ByID(context.Context, int64) (Booking, error)
	ByCode(context.Context, string) (Booking, error)
	Availability(context.Context, int64, time.Time, time.Time, *int64) (bool, error)
	ServiceIDs(context.Context, int64) ([]int64, error)
	PricingItems(context.Context, int64) ([]int64, int64, error)
	Reschedule(context.Context, int64, int64, int64, time.Time, time.Time) (Booking, error)
	Finalize(context.Context, int64, int64, FinalizeInput) (Booking, error)
	ExtendHold(context.Context, int64, int64, time.Duration) (Booking, error)
	Cancel(context.Context, int64, int64) (Booking, error)
	AdminList(context.Context) ([]Booking, error)
	AdminTransition(context.Context, int64, string) (Booking, error)
	ProviderTransition(context.Context, int64, int64, *int64, string, *int64) (Booking, error)
	ProviderUpdateDetails(context.Context, int64, int64, *int64, string, string, string) (Booking, error)
	EligibleReviewStaff(context.Context, int64) ([]int64, error)
	ApplyPaymentState(context.Context, PaymentStateInput) (Booking, bool, error)
}

type Service struct {
	repository Repository
	catalog    CatalogClient
	provider   ProviderClient
	location   *time.Location
}

func NewService(repository Repository) *Service {
	location, _ := time.LoadLocation("Asia/Bangkok")
	return &Service{repository: repository, location: location}
}
func (s *Service) Repository() Repository { return s.repository }
func (s *Service) ConfigureDependencies(catalog CatalogClient, provider ProviderClient) {
	s.catalog, s.provider = catalog, provider
}

func (s *Service) EligibleStaff(ctx context.Context, branchID int64, serviceIDs []int64, startsAt, endsAt time.Time) ([]EligibleStaff, error) {
	if s.catalog == nil || s.provider == nil || branchID <= 0 || len(serviceIDs) == 0 || !endsAt.After(startsAt) {
		return nil, ErrInvalidTransition
	}
	snapshots, err := s.catalog.Snapshots(ctx, branchID, serviceIDs)
	if err != nil {
		return nil, err
	}
	providerID, err := commonProvider(snapshots)
	if err != nil {
		return nil, err
	}
	return s.provider.EligibleStaff(ctx, providerID, branchID, serviceIDs, startsAt, endsAt)
}

func (s *Service) Create(ctx context.Context, customerID int64, request CreateRequest, idempotencyKey, requestHash string) (Booking, error) {
	domainmetrics.BookingCreate()
	if s.catalog == nil || s.provider == nil || customerID <= 0 || request.BranchID <= 0 || len(request.ServiceIDs) == 0 {
		return Booking{}, ErrInvalidTransition
	}
	if request.BookingType != "scheduled" && request.BookingType != "queue" {
		return Booking{}, ErrInvalidTransition
	}
	if !validPaymentPreference(request.PaymentType, request.PaymentChannel) {
		return Booking{}, ErrInvalidTransition
	}
	participantCount := request.ParticipantCount
	if participantCount == 0 {
		switch {
		case len(request.ParticipantSelections) > 0:
			participantCount = int32(len(request.ParticipantSelections))
		case len(request.Guests) > 0:
			participantCount = int32(len(request.Guests) + 1)
		default:
			participantCount = 1
		}
	}
	if participantCount < 1 || participantCount > 5 {
		return Booking{}, ErrInvalidTransition
	}
	var (
		snapshots        []ServiceSnapshot
		providerID       int64
		bookingDate      string
		startsAt         *time.Time
		endsAt           *time.Time
		totalDuration    int32
		totalPrice       int64
		dpAmount         int64
		participants     []Participant
		couponServiceIDs []int64
	)
	if len(request.ParticipantSelections) > 0 {
		if request.BookingType != "scheduled" || participantCount < 2 || len(request.ParticipantSelections) != int(participantCount) {
			return Booking{}, ErrInvalidTransition
		}
		allSnapshots := []ServiceSnapshot{}
		for index, selection := range request.ParticipantSelections {
			position := int32(index + 1)
			if selection.Position != position || len(selection.ServiceIDs) == 0 || (position > 1 && !request.HoldOnly && !validParticipantIdentity(selection.Name, selection.Phone, selection.Gender, selection.AgeGroup)) {
				return Booking{}, ErrInvalidTransition
			}
			selectionSnapshots, snapshotErr := s.catalog.Snapshots(ctx, request.BranchID, selection.ServiceIDs)
			if snapshotErr != nil {
				return Booking{}, snapshotErr
			}
			selectionProvider, providerErr := commonProvider(selectionSnapshots)
			if providerErr != nil || providerID != 0 && selectionProvider != providerID {
				return Booking{}, ErrForbidden
			}
			providerID = selectionProvider
			selectionStarts, selectionEnds, selectionDuration, selectionPrice, scheduleErr := s.schedule("scheduled", selection.BookingDate, selection.StartTime, selectionSnapshots)
			if scheduleErr != nil {
				return Booking{}, scheduleErr
			}
			eligible, eligibleErr := s.provider.EligibleStaff(ctx, providerID, request.BranchID, selection.ServiceIDs, *selectionStarts, *selectionEnds)
			if eligibleErr != nil {
				return Booking{}, eligibleErr
			}
			if len(eligible) == 0 {
				return Booking{}, ErrForbidden
			}
			staffID := eligible[0].ID
			if selection.StaffID != nil {
				if !containsStaff(eligible, *selection.StaffID) {
					return Booking{}, ErrForbidden
				}
				staffID = *selection.StaffID
			}
			for _, existing := range participants {
				if existing.StaffID != nil && *existing.StaffID == staffID && rangesOverlap(*existing.StartsAt, *existing.EndsAt, *selectionStarts, *selectionEnds) {
					return Booking{}, ErrSlotConflict
				}
			}
			participants = append(participants, Participant{Position: position, Primary: position == 1, Name: selection.Name, Phone: selection.Phone, Email: selection.Email, Gender: selection.Gender, AgeGroup: selection.AgeGroup, Description: selection.Description, StaffID: &staffID, StartsAt: selectionStarts, EndsAt: selectionEnds, Services: selectionSnapshots})
			if position == 1 {
				startsAt, endsAt, request.StaffID = selectionStarts, selectionEnds, &staffID
				bookingDate = selection.BookingDate
			}
			totalDuration += selectionDuration
			totalPrice += selectionPrice
			dpAmount += configuredDP(selectionSnapshots)
			allSnapshots = append(allSnapshots, selectionSnapshots...)
			couponServiceIDs = append(couponServiceIDs, selection.ServiceIDs...)
		}
		snapshots = uniqueSnapshots(allSnapshots)
	} else {
		normalizedDate, dateErr := s.normalizeBookingDate(request.BookingDate)
		if dateErr != nil {
			return Booking{}, dateErr
		}
		bookingDate = normalizedDate
		var err error
		snapshots, err = s.catalog.Snapshots(ctx, request.BranchID, request.ServiceIDs)
		if err != nil {
			return Booking{}, err
		}
		providerID, err = commonProvider(snapshots)
		if err != nil {
			return Booking{}, err
		}
		startsAt, endsAt, totalDuration, totalPrice, err = s.schedule(request.BookingType, bookingDate, request.StartTime, snapshots)
		if err != nil {
			return Booking{}, err
		}
		totalDuration *= participantCount
		totalPrice *= int64(participantCount)
		dpAmount = configuredDP(snapshots) * int64(participantCount)
		if startsAt != nil {
			expandedEnd := startsAt.Add(time.Duration(totalDuration) * time.Minute)
			endsAt = &expandedEnd
			eligible, eligibleErr := s.provider.EligibleStaff(ctx, providerID, request.BranchID, request.ServiceIDs, *startsAt, *endsAt)
			if eligibleErr != nil {
				return Booking{}, eligibleErr
			}
			if len(eligible) == 0 {
				return Booking{}, ErrForbidden
			}
			staffID := eligible[0].ID
			if request.StaffID != nil {
				if !containsStaff(eligible, *request.StaffID) {
					return Booking{}, ErrForbidden
				}
				staffID = *request.StaffID
			}
			request.StaffID = &staffID
		} else {
			probeStart := time.Now().In(s.location)
			if probeStart.Format("2006-01-02") != bookingDate {
				day, parseErr := time.ParseInLocation("2006-01-02", bookingDate, s.location)
				if parseErr != nil {
					return Booking{}, ErrInvalidTransition
				}
				probeStart = day.Add(12 * time.Hour)
			}
			probeEnd := probeStart.Add(time.Duration(totalDuration) * time.Minute)
			eligible, eligibleErr := s.provider.EligibleStaff(ctx, providerID, request.BranchID, request.ServiceIDs, probeStart.UTC(), probeEnd.UTC())
			if eligibleErr != nil {
				return Booking{}, eligibleErr
			}
			if len(eligible) == 0 {
				return Booking{}, ErrForbidden
			}
			staffID := eligible[0].ID
			if request.StaffID != nil {
				if !containsStaff(eligible, *request.StaffID) {
					return Booking{}, ErrForbidden
				}
				staffID = *request.StaffID
			}
			request.StaffID = &staffID
		}
		if len(request.Guests) > int(participantCount-1) || !request.HoldOnly && len(request.Guests) != int(participantCount-1) {
			return Booking{}, ErrInvalidTransition
		}
		if participantCount > 1 {
			participants = append(participants, Participant{Position: 1, Primary: true, Name: "Customer"})
			for index, guest := range request.Guests {
				if !request.HoldOnly && !validParticipantIdentity(guest.Name, guest.Phone, guest.Gender, guest.AgeGroup) {
					return Booking{}, ErrInvalidTransition
				}
				participants = append(participants, Participant{Position: int32(index + 2), Name: guest.Name, Phone: guest.Phone, Email: guest.Email, Gender: guest.Gender, AgeGroup: guest.AgeGroup, Description: guest.Description})
			}
		}
		couponServiceIDs = repeatServiceIDs(request.ServiceIDs, participantCount)
	}
	redemptionKey := ""
	if !request.HoldOnly && request.CouponCode != "" {
		redemptionKey = fmt.Sprintf("booking:create:%d:%s", customerID, idempotencyKey)
	}
	price, priceErr := s.catalog.PriceSummary(ctx, request.CouponCode, couponServiceIDs, totalPrice, "IDR", redemptionKey)
	if priceErr != nil {
		return Booking{}, priceErr
	}
	totalPrice = price.PayableMinor
	paymentType, paymentChannel := request.PaymentType, request.PaymentChannel
	status := "pending_payment"
	if request.HoldOnly {
		paymentType, paymentChannel, status = "pay_at_salon", "", "pending_hold"
	} else if paymentType == "pay_at_salon" {
		paymentChannel = ""
		if request.BookingType == "queue" {
			status = "waiting"
		} else {
			status = "confirmed"
		}
	}
	paymentAmount := amountDue(paymentType, totalPrice, dpAmount)
	branchID := request.BranchID
	input := CreateInput{ProviderID: providerID, CustomerID: customerID, BranchID: &branchID, StaffID: request.StaffID, BookingType: request.BookingType, BookingDate: bookingDate, StartsAt: startsAt, EndsAt: endsAt, TotalDuration: totalDuration, TotalPriceMinor: totalPrice, Currency: "IDR", Status: status, PaymentType: paymentType, PaymentChannel: paymentChannel, PaymentAmount: paymentAmount, DPAmount: dpAmount, Notes: request.Notes, IdempotencyKey: idempotencyKey, IdempotencyActor: "customer", IdempotencyID: customerID, RequestHash: requestHash, ParticipantCount: participantCount, Services: snapshots, Participants: participants}
	created, err := s.repository.Create(ctx, input)
	if errors.Is(err, ErrSlotConflict) {
		domainmetrics.BookingConflict()
		if redemptionKey != "" {
			_ = s.catalog.ReleaseCoupon(ctx, redemptionKey)
		}
	}
	return created, err
}

func (s *Service) CreateProviderBooking(ctx context.Context, providerID int64, branchScope *int64, request ProviderCreateRequest, idempotencyKey, requestHash string) (Booking, error) {
	if s.catalog == nil || s.provider == nil || providerID <= 0 || request.BranchID <= 0 || request.StaffID <= 0 || len(request.ServiceIDs) == 0 || request.CustomerName == "" || idempotencyKey == "" {
		return Booking{}, ErrInvalidTransition
	}
	if branchScope != nil && *branchScope != request.BranchID {
		return Booking{}, ErrForbidden
	}
	if request.PaymentType == "" {
		request.PaymentType = "pay_at_salon"
	}
	if !validPaymentPreference(request.PaymentType, request.PaymentChannel) {
		return Booking{}, ErrInvalidTransition
	}
	bookingDate, err := s.normalizeBookingDate(request.BookingDate)
	if err != nil {
		return Booking{}, err
	}
	snapshots, err := s.catalog.Snapshots(ctx, request.BranchID, request.ServiceIDs)
	if err != nil {
		return Booking{}, err
	}
	snapshotProviderID, err := commonProvider(snapshots)
	if err != nil || snapshotProviderID != providerID {
		return Booking{}, ErrForbidden
	}
	startsAt, endsAt, duration, subtotal, err := s.schedule("scheduled", bookingDate, request.StartTime, snapshots)
	if err != nil {
		return Booking{}, err
	}
	eligible, err := s.provider.EligibleStaff(ctx, providerID, request.BranchID, request.ServiceIDs, *startsAt, *endsAt)
	if err != nil {
		return Booking{}, err
	}
	if !containsStaff(eligible, request.StaffID) {
		return Booking{}, ErrForbidden
	}
	price, err := s.catalog.PriceSummary(ctx, "", request.ServiceIDs, subtotal, "IDR", "")
	if err != nil {
		return Booking{}, err
	}
	dpAmount := configuredDP(snapshots)
	paymentChannel := normalizePaymentChannel(request.PaymentType, request.PaymentChannel)
	status := "pending_payment"
	if request.PaymentType == "pay_at_salon" {
		status = "confirmed"
	}
	branchID, staffID := request.BranchID, request.StaffID
	input := CreateInput{
		ProviderID: providerID, BranchID: &branchID, StaffID: &staffID, BookingType: "walk_in", BookingDate: bookingDate,
		StartsAt: startsAt, EndsAt: endsAt, TotalDuration: duration, TotalPriceMinor: price.PayableMinor, Currency: "IDR", Status: status,
		PaymentType: request.PaymentType, PaymentChannel: paymentChannel, PaymentAmount: amountDue(request.PaymentType, price.PayableMinor, dpAmount), DPAmount: dpAmount,
		CustomerName: request.CustomerName, CustomerPhone: request.CustomerPhone, Notes: request.Notes, ParticipantCount: 1,
		IdempotencyKey: idempotencyKey, IdempotencyActor: "provider", IdempotencyID: providerID, RequestHash: requestHash, Services: snapshots,
	}
	return s.repository.Create(ctx, input)
}

func (s *Service) ProviderAvailability(ctx context.Context, providerID int64, branchScope *int64, query AvailabilityQuery) (map[string]any, error) {
	if s.catalog == nil || providerID <= 0 || query.BranchID <= 0 {
		return nil, ErrInvalidTransition
	}
	if branchScope != nil && *branchScope != query.BranchID {
		return nil, ErrForbidden
	}
	snapshots, err := s.catalog.Snapshots(ctx, query.BranchID, query.ServiceIDs)
	if err != nil {
		return nil, err
	}
	owner, err := commonProvider(snapshots)
	if err != nil || owner != providerID {
		return nil, ErrForbidden
	}
	query.BookingType = "scheduled"
	return s.LookupAvailability(ctx, query, true)
}

func (s *Service) ProviderTransition(ctx context.Context, providerID int64, branchScope *int64, bookingID int64, action string) (Booking, error) {
	if providerID <= 0 || bookingID <= 0 {
		return Booking{}, ErrForbidden
	}
	targets := map[string]string{
		"call": "checked_in", "check-in": "checked_in", "start": "in_progress", "complete": "completed", "cancel": "cancelled", "no-show": "no_show",
	}
	target, ok := targets[action]
	if !ok {
		return Booking{}, ErrInvalidTransition
	}
	current, err := s.repository.ByID(ctx, bookingID)
	if err != nil {
		return Booking{}, err
	}
	if current.ProviderID != providerID || branchScope != nil && (current.BranchID == nil || *current.BranchID != *branchScope) {
		return Booking{}, ErrForbidden
	}
	if action == "call" && current.BookingType != "queue" && current.BookingType != "walk_in" {
		return Booking{}, ErrInvalidTransition
	}
	if current.Status == target {
		return current, nil
	}
	if !CanTransition(current.Status, target) {
		return Booking{}, ErrInvalidTransition
	}
	staffID := current.StaffID
	if target == "in_progress" && staffID == nil {
		if current.BranchID == nil || s.provider == nil {
			return Booking{}, ErrInvalidTransition
		}
		serviceIDs, serviceErr := s.repository.ServiceIDs(ctx, current.ID)
		if serviceErr != nil || len(serviceIDs) == 0 {
			return Booking{}, ErrInvalidTransition
		}
		startsAt := time.Now().UTC()
		endsAt := startsAt.Add(time.Duration(current.TotalDuration) * time.Minute)
		staff, staffErr := s.provider.EligibleStaff(ctx, providerID, *current.BranchID, serviceIDs, startsAt, endsAt)
		if staffErr != nil {
			return Booking{}, staffErr
		}
		if len(staff) == 0 {
			return Booking{}, ErrForbidden
		}
		selected := staff[0].ID
		staffID = &selected
	}
	return s.repository.ProviderTransition(ctx, current.ID, providerID, branchScope, target, staffID)
}

func (s *Service) ProviderBooking(ctx context.Context, providerID int64, branchScope *int64, bookingID int64) (Booking, error) {
	if providerID <= 0 || bookingID <= 0 {
		return Booking{}, ErrForbidden
	}
	current, err := s.repository.ByID(ctx, bookingID)
	if err != nil {
		return Booking{}, err
	}
	if current.ProviderID != providerID || branchScope != nil && (current.BranchID == nil || *current.BranchID != *branchScope) {
		return Booking{}, ErrForbidden
	}
	return current, nil
}

func (s *Service) UpdateProviderBooking(ctx context.Context, providerID int64, branchScope *int64, bookingID int64, request ProviderUpdateRequest) (Booking, error) {
	if _, err := s.ProviderBooking(ctx, providerID, branchScope, bookingID); err != nil {
		return Booking{}, err
	}
	name := strings.TrimSpace(request.CustomerName)
	phone := strings.TrimSpace(request.CustomerPhone)
	notes := strings.TrimSpace(request.Notes)
	if len(name) > 255 || len(phone) > 30 || len(notes) > 2000 {
		return Booking{}, ErrInvalidTransition
	}
	return s.repository.ProviderUpdateDetails(ctx, bookingID, providerID, branchScope, name, phone, notes)
}

func (s *Service) normalizeBookingDate(value string) (string, error) {
	if value == "" {
		value = time.Now().In(s.location).Format("2006-01-02")
	}
	day, err := time.ParseInLocation("2006-01-02", value, s.location)
	today, _ := time.ParseInLocation("2006-01-02", time.Now().In(s.location).Format("2006-01-02"), s.location)
	if err != nil || day.Before(today) {
		return "", ErrInvalidTransition
	}
	return day.Format("2006-01-02"), nil
}

func repeatServiceIDs(serviceIDs []int64, participantCount int32) []int64 {
	result := make([]int64, 0, len(serviceIDs)*int(participantCount))
	for range participantCount {
		result = append(result, serviceIDs...)
	}
	return result
}

func validParticipantIdentity(name, phone, gender, ageGroup string) bool {
	if name == "" || phone == "" || (gender != "male" && gender != "female") {
		return false
	}
	switch ageGroup {
	case "child", "teen", "adult", "senior":
		return true
	default:
		return false
	}
}

func rangesOverlap(firstStart, firstEnd, secondStart, secondEnd time.Time) bool {
	return firstStart.Before(secondEnd) && firstEnd.After(secondStart)
}

func uniqueSnapshots(items []ServiceSnapshot) []ServiceSnapshot {
	seen := map[int64]struct{}{}
	result := make([]ServiceSnapshot, 0, len(items))
	for _, item := range items {
		if _, exists := seen[item.ServiceID]; exists {
			continue
		}
		seen[item.ServiceID] = struct{}{}
		result = append(result, item)
	}
	return result
}

func (s *Service) Finalize(ctx context.Context, id, customerID int64, request FinalizeRequest) (Booking, error) {
	if id <= 0 || customerID <= 0 || !validPaymentPreference(request.PaymentType, request.PaymentChannel) {
		return Booking{}, ErrInvalidTransition
	}
	current, err := s.repository.ByID(ctx, id)
	if err != nil {
		return Booking{}, err
	}
	if current.CustomerID == nil || *current.CustomerID != customerID {
		return Booking{}, ErrForbidden
	}
	if current.Status != "pending_hold" {
		if current.PaymentType == request.PaymentType && current.PaymentChannel == normalizePaymentChannel(request.PaymentType, request.PaymentChannel) {
			return current, nil
		}
		return Booking{}, ErrInvalidTransition
	}
	participantCount := request.ParticipantCount
	if participantCount == 0 {
		participantCount = current.ParticipantCount
	}
	if participantCount != current.ParticipantCount || participantCount < 1 || participantCount > 5 || len(request.Guests) != int(participantCount-1) {
		return Booking{}, ErrInvalidTransition
	}
	for _, guest := range request.Guests {
		if !validParticipantIdentity(guest.Name, guest.Phone, guest.Gender, guest.AgeGroup) {
			return Booking{}, ErrInvalidTransition
		}
	}
	serviceIDs, subtotal, serviceErr := s.repository.PricingItems(ctx, id)
	if serviceErr != nil {
		return Booking{}, serviceErr
	}
	redemptionKey := ""
	if request.CouponCode != "" {
		redemptionKey = fmt.Sprintf("booking:finalize:%d", id)
	}
	price, err := s.catalog.PriceSummary(ctx, request.CouponCode, serviceIDs, subtotal, current.Currency, redemptionKey)
	if err != nil {
		return Booking{}, err
	}
	result, err := s.repository.Finalize(ctx, id, customerID, FinalizeInput{PaymentType: request.PaymentType, PaymentChannel: request.PaymentChannel, Notes: request.Notes, ParticipantCount: participantCount, Guests: request.Guests, TotalPriceMinor: &price.PayableMinor})
	if err != nil && redemptionKey != "" {
		_ = s.catalog.ReleaseCoupon(ctx, redemptionKey)
	}
	return result, err
}

func (s *Service) Reschedule(ctx context.Context, current Booking, customerID int64, requestedStaffID *int64, bookingDate, startTime string) (Booking, error) {
	if s.catalog == nil || s.provider == nil || current.ID <= 0 || customerID <= 0 || current.CustomerID == nil || *current.CustomerID != customerID || current.BranchID == nil {
		return Booking{}, ErrForbidden
	}
	if current.Status != "pending_hold" && current.Status != "pending_payment" && current.Status != "confirmed" {
		return Booking{}, ErrInvalidTransition
	}
	startsAt, err := time.ParseInLocation("2006-01-02 15:04", bookingDate+" "+startTime, s.location)
	if err != nil || !startsAt.After(time.Now().In(s.location)) {
		return Booking{}, ErrInvalidTransition
	}
	startsUTC := startsAt.UTC()
	endsUTC := startsUTC.Add(time.Duration(current.TotalDuration) * time.Minute)
	serviceIDs, err := s.repository.ServiceIDs(ctx, current.ID)
	if err != nil || len(serviceIDs) == 0 {
		return Booking{}, ErrInvalidTransition
	}
	snapshots, err := s.catalog.Snapshots(ctx, *current.BranchID, serviceIDs)
	if err != nil {
		return Booking{}, err
	}
	providerID, err := commonProvider(snapshots)
	if err != nil || providerID != current.ProviderID {
		return Booking{}, ErrForbidden
	}
	eligible, err := s.provider.EligibleStaff(ctx, current.ProviderID, *current.BranchID, serviceIDs, startsUTC, endsUTC)
	if err != nil {
		return Booking{}, err
	}
	if len(eligible) == 0 {
		return Booking{}, ErrInvalidTransition
	}
	staffID := eligible[0].ID
	if requestedStaffID != nil {
		if !containsStaff(eligible, *requestedStaffID) {
			return Booking{}, ErrForbidden
		}
		staffID = *requestedStaffID
	}
	return s.repository.Reschedule(ctx, current.ID, customerID, staffID, startsUTC, endsUTC)
}

func validPaymentPreference(paymentType, paymentChannel string) bool {
	switch paymentType {
	case "dp", "full_payment", "pay_at_salon":
	default:
		return false
	}
	if paymentChannel == "" {
		return true
	}
	switch paymentChannel {
	case "qris", "bca_va", "bni_va", "bri_va", "permata_va", "cimb_va", "mandiri_bill":
		return true
	default:
		return false
	}
}

func normalizePaymentChannel(paymentType, paymentChannel string) string {
	if paymentType == "pay_at_salon" {
		return ""
	}
	return paymentChannel
}

func configuredDP(snapshots []ServiceSnapshot) int64 {
	var total int64
	for _, snapshot := range snapshots {
		if snapshot.DPAmountMinor > 0 {
			total += snapshot.DPAmountMinor
		}
	}
	return total
}

func amountDue(paymentType string, totalPrice, dpAmount int64) int64 {
	switch paymentType {
	case "dp":
		if dpAmount > 0 {
			return dpAmount
		}
		return (totalPrice*30 + 50) / 100
	case "full_payment":
		return totalPrice
	default:
		return 0
	}
}

func (s *Service) schedule(bookingType, date, clock string, snapshots []ServiceSnapshot) (*time.Time, *time.Time, int32, int64, error) {
	var duration int32
	var price int64
	for _, snapshot := range snapshots {
		duration += snapshot.Duration
		price += snapshot.PriceMinor
		if bookingType == "scheduled" && !snapshot.ScheduledEnabled || bookingType == "queue" && !snapshot.QueueEnabled {
			return nil, nil, 0, 0, ErrInvalidTransition
		}
	}
	if bookingType == "queue" {
		return nil, nil, duration, price, nil
	}
	startsAt, err := time.ParseInLocation("2006-01-02 15:04", date+" "+clock, s.location)
	if err != nil || !startsAt.After(time.Now().In(s.location)) {
		return nil, nil, 0, 0, ErrInvalidTransition
	}
	startsUTC := startsAt.UTC()
	endsUTC := startsUTC.Add(time.Duration(duration) * time.Minute)
	return &startsUTC, &endsUTC, duration, price, nil
}

func commonProvider(snapshots []ServiceSnapshot) (int64, error) {
	if len(snapshots) == 0 || snapshots[0].ProviderID <= 0 {
		return 0, ErrInvalidTransition
	}
	providerID := snapshots[0].ProviderID
	for _, snapshot := range snapshots {
		if snapshot.ProviderID != providerID {
			return 0, ErrForbidden
		}
	}
	return providerID, nil
}

func containsStaff(items []EligibleStaff, target int64) bool {
	for _, item := range items {
		if item.ID == target {
			return true
		}
	}
	return false
}

func CanTransition(from, to string) bool {
	allowed := map[string]map[string]bool{
		"pending_hold":    {"pending_payment": true, "confirmed": true, "expired_hold": true, "customer_cancelled": true, "cancelled": true},
		"pending_payment": {"confirmed": true, "payment_expired": true, "customer_cancelled": true, "cancelled": true},
		"confirmed":       {"waiting": true, "checked_in": true, "in_progress": true, "provider_cancelled": true, "customer_cancelled": true, "cancelled": true, "no_show": true, "rescheduled": true},
		"waiting":         {"checked_in": true, "in_progress": true, "provider_cancelled": true, "cancelled": true, "no_show": true},
		"checked_in":      {"in_progress": true, "provider_cancelled": true, "cancelled": true, "no_show": true},
		"in_progress":     {"completed": true, "provider_cancelled": true, "cancelled": true},
		"completed":       {"order_completed": true, "refund_completed": true},
	}
	return allowed[from][to]
}
