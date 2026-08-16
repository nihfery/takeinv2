package billing

import (
	"context"
	"errors"
	"time"
)

var (
	ErrNotFound  = errors.New("billing resource not found")
	ErrForbidden = errors.New("billing resource outside actor scope")
	ErrConflict  = errors.New("billing resource conflict")
)

type Plan struct {
	ID           int64   `json:"id"`
	Name         string  `json:"name"`
	Description  *string `json:"description"`
	PriceMinor   int64   `json:"price_minor"`
	DurationDays int32   `json:"duration_days"`
	MaxBranches  int32   `json:"max_branches"`
	Active       bool    `json:"is_active"`
}
type Trial struct {
	ProviderID       int64
	StartsAt, EndsAt *time.Time
}
type Subscription struct {
	ID            int64      `json:"id"`
	ProviderID    int64      `json:"provider_id"`
	PlanID        *int64     `json:"plan_id"`
	PlanName      string     `json:"plan_name"`
	PriceMinor    int64      `json:"price_minor"`
	DurationDays  int32      `json:"duration_days"`
	MaxBranches   int32      `json:"max_branches"`
	PaymentStatus string     `json:"payment_status"`
	Status        string     `json:"subscription_status"`
	StartsAt      *time.Time `json:"starts_at"`
	EndsAt        *time.Time `json:"ends_at"`
	OrderID       *string    `json:"midtrans_order_id"`
}
type Entitlement struct {
	Source           string `json:"source"`
	Active           bool   `json:"active"`
	MaxBranches      int32  `json:"max_branches"`
	StartsAt, EndsAt *time.Time
}
type PaymentCharge struct {
	PaymentID      string `json:"payment_id"`
	OrderID        string `json:"order_id"`
	Status         string `json:"status"`
	RedirectURL    string `json:"redirect_url,omitempty"`
	Token          string `json:"token,omitempty"`
	ExpiresAt      string `json:"expires_at,omitempty"`
	PaymentChannel string `json:"payment_channel"`
}
type PaymentClient interface {
	CreateSubscriptionCharge(context.Context, int64, int64, int64, string, string) (PaymentCharge, error)
}
type PaymentStateInput struct {
	EventID, EventType, Status, Currency, Topic string
	PaymentID, SubscriptionID, ProviderID       int64
	AmountMinor                                 int64
	Partition                                   int32
	Offset                                      int64
}
type Repository interface {
	Plans(context.Context) ([]Plan, error)
	Plan(context.Context, int64) (Plan, error)
	Trial(context.Context, int64) (Trial, error)
	CurrentSubscription(context.Context, int64) (Subscription, error)
	CreatePurchase(context.Context, int64, Plan) (Subscription, error)
	AttachCharge(context.Context, int64, PaymentCharge) (Subscription, error)
	ApplyPaymentState(context.Context, PaymentStateInput) (Subscription, bool, error)
}

func ResolveEntitlement(trial Trial, subscription Subscription, now time.Time) Entitlement {
	if subscription.PaymentStatus == "paid" && subscription.Status == "active" && inWindow(subscription.StartsAt, subscription.EndsAt, now) {
		return Entitlement{Source: "subscription", Active: true, MaxBranches: subscription.MaxBranches, StartsAt: subscription.StartsAt, EndsAt: subscription.EndsAt}
	}
	if inWindow(trial.StartsAt, trial.EndsAt, now) {
		return Entitlement{Source: "trial", Active: true, MaxBranches: 1, StartsAt: trial.StartsAt, EndsAt: trial.EndsAt}
	}
	return Entitlement{Source: "none", Active: false}
}
func inWindow(starts, ends *time.Time, now time.Time) bool {
	return starts != nil && ends != nil && !now.Before(*starts) && now.Before(*ends)
}

type Service struct {
	repository Repository
	now        func() time.Time
	payment    PaymentClient
}

func (s *Service) ConfigurePayment(client PaymentClient) { s.payment = client }

func NewService(repository Repository) *Service {
	return &Service{repository: repository, now: time.Now}
}
func (s *Service) Overview(ctx context.Context, providerID int64) ([]Plan, Entitlement, error) {
	plans, err := s.repository.Plans(ctx)
	if err != nil {
		return nil, Entitlement{}, err
	}
	trial, _ := s.repository.Trial(ctx, providerID)
	subscription, _ := s.repository.CurrentSubscription(ctx, providerID)
	return plans, ResolveEntitlement(trial, subscription, s.now().UTC()), nil
}
func (s *Service) Entitlement(ctx context.Context, providerID int64) (Entitlement, error) {
	trial, trialErr := s.repository.Trial(ctx, providerID)
	if trialErr != nil && !errors.Is(trialErr, ErrNotFound) {
		return Entitlement{}, trialErr
	}
	subscription, subscriptionErr := s.repository.CurrentSubscription(ctx, providerID)
	if subscriptionErr != nil && !errors.Is(subscriptionErr, ErrNotFound) {
		return Entitlement{}, subscriptionErr
	}
	return ResolveEntitlement(trial, subscription, s.now().UTC()), nil
}
func (s *Service) Purchase(ctx context.Context, providerID, planID int64, paymentChannel string) (Subscription, PaymentCharge, error) {
	if paymentChannel == "" {
		paymentChannel = "qris"
	}
	if !ValidPaymentChannel(paymentChannel) {
		return Subscription{}, PaymentCharge{}, ErrForbidden
	}
	plan, err := s.repository.Plan(ctx, planID)
	if err != nil {
		return Subscription{}, PaymentCharge{}, err
	}
	if s.payment == nil {
		return Subscription{}, PaymentCharge{}, errors.New("payment service is unavailable")
	}
	subscription, err := s.repository.CreatePurchase(ctx, providerID, plan)
	if err != nil {
		return Subscription{}, PaymentCharge{}, err
	}
	charge, err := s.payment.CreateSubscriptionCharge(ctx, subscription.ID, providerID, plan.PriceMinor, "IDR", paymentChannel)
	if err != nil {
		return subscription, PaymentCharge{}, err
	}
	subscription, err = s.repository.AttachCharge(ctx, subscription.ID, charge)
	if err != nil {
		return Subscription{}, PaymentCharge{}, err
	}
	return subscription, charge, nil
}

func ValidPaymentChannel(value string) bool {
	switch value {
	case "qris", "bca_va", "bni_va", "bri_va", "permata_va", "cimb_va", "mandiri_bill":
		return true
	default:
		return false
	}
}
