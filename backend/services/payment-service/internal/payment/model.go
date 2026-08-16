package payment

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/nihfery/takein/libs/go/domainmetrics"
)

var (
	ErrNotFound          = errors.New("payment not found")
	ErrForbidden         = errors.New("payment is outside actor scope")
	ErrConflict          = errors.New("payment conflict")
	ErrInvalidSignature  = errors.New("invalid Midtrans signature")
	ErrInvalidTransition = errors.New("invalid payment state transition")
	ErrManualDisabled    = errors.New("manual payment confirmation is disabled")
	ErrPayAtSalon        = errors.New("pay-at-salon payment cannot be manually confirmed")
	ErrAlreadyPaid       = errors.New("payment is already paid")
)

type Payment struct {
	ID             int64      `json:"id"`
	BookingID      int64      `json:"booking_id"`
	SubscriptionID *int64     `json:"subscription_id,omitempty"`
	ProviderID     *int64     `json:"provider_id,omitempty"`
	BranchID       *int64     `json:"branch_id,omitempty"`
	CustomerID     *int64     `json:"customer_id"`
	PaymentType    string     `json:"payment_type"`
	AmountMinor    int64      `json:"amount_minor"`
	Currency       string     `json:"currency"`
	Status         string     `json:"status"`
	PaymentMethod  string     `json:"payment_method"`
	PaymentChannel string     `json:"payment_channel,omitempty"`
	IdempotencyKey *string    `json:"idempotency_key"`
	PaidAt         *time.Time `json:"paid_at"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}
type ChargeInput struct {
	BookingID      int64  `json:"-"`
	CustomerID     int64  `json:"-"`
	PaymentType    string `json:"payment_type"`
	AmountMinor    int64  `json:"amount_minor"`
	Currency       string `json:"currency"`
	PaymentMethod  string `json:"payment_method"`
	PaymentChannel string `json:"payment_channel"`
	BookingCode    string `json:"-"`
	IdempotencyKey string `json:"-"`
	SubscriptionID int64  `json:"-"`
	ProviderID     int64  `json:"-"`
	BranchID       int64  `json:"-"`
}
type Charge struct {
	Payment        Payment    `json:"payment"`
	OrderID        string     `json:"order_id"`
	RedirectURL    string     `json:"redirect_url,omitempty"`
	Token          string     `json:"token,omitempty"`
	ExpiresAt      *time.Time `json:"expires_at,omitempty"`
	PaymentChannel string     `json:"payment_channel,omitempty"`
}
type Notification struct {
	OrderID           string `json:"order_id"`
	StatusCode        string `json:"status_code"`
	GrossAmount       string `json:"gross_amount"`
	SignatureKey      string `json:"signature_key"`
	TransactionID     string `json:"transaction_id"`
	TransactionStatus string `json:"transaction_status"`
	FraudStatus       string `json:"fraud_status"`
	PaymentType       string `json:"payment_type"`
}
type GatewayResponse struct {
	OrderID       string
	TransactionID string
	Status        string
	RedirectURL   string
	Token         string
	ExpiresAt     *time.Time
	Raw           []byte
}
type Gateway interface {
	Charge(context.Context, ChargeInput, string) (GatewayResponse, error)
}
type BookingPaymentContext struct {
	BookingID, CustomerID, ProviderID, BranchID int64
	BookingCode, Status, Currency               string
	PaymentType, PaymentChannel                 string
	AmountMinor                                 int64
}
type BookingClient interface {
	PaymentContext(context.Context, int64, string, int64) (BookingPaymentContext, error)
	ApplyPaymentState(context.Context, string, Payment) (string, error)
}
type Repository interface {
	CreateCharge(context.Context, ChargeInput, GatewayResponse) (Charge, error)
	ChargeByIdempotency(context.Context, ChargeInput) (Charge, error)
	LockCharge(context.Context, string) (func(), error)
	ByBooking(context.Context, int64) (Payment, error)
	ByID(context.Context, int64) (Payment, error)
	ProcessNotification(context.Context, Notification, []byte) (Payment, bool, error)
	ManualConfirm(context.Context, int64, int64) (Payment, error)
	ListProvider(context.Context, ProviderFilter) ([]Payment, error)
}

type ProviderFilter struct {
	ProviderID  int64
	BranchID    *int64
	Status      string
	PaymentType string
}

func CanTransition(from, to string) bool {
	if from == to {
		return true
	}
	allowed := map[string]map[string]bool{"unpaid": {"pending": true, "paid": true, "failed": true, "cancelled": true}, "pending": {"paid": true, "failed": true, "expired": true, "cancelled": true}, "paid": {"refunded": true}}
	return allowed[from][to]
}
func StatusFromNotification(transaction, fraud string) (string, error) {
	switch transaction {
	case "capture":
		if fraud == "challenge" {
			return "pending", nil
		}
		if fraud == "accept" || fraud == "" {
			return "paid", nil
		}
		return "failed", nil
	case "settlement":
		return "paid", nil
	case "pending":
		return "pending", nil
	case "deny", "failure":
		return "failed", nil
	case "cancel":
		return "cancelled", nil
	case "expire":
		return "expired", nil
	case "refund", "partial_refund":
		return "refunded", nil
	default:
		return "", ErrInvalidTransition
	}
}

type Service struct {
	repository         Repository
	gateway            Gateway
	serverKey          string
	booking            BookingClient
	manualConfirmation bool
}

func NewService(repository Repository, gateway Gateway, serverKey string) *Service {
	return &Service{repository: repository, gateway: gateway, serverKey: serverKey}
}
func (s *Service) Repository() Repository { return s.repository }
func (s *Service) ConfigureBooking(client BookingClient, manualConfirmation bool) {
	s.booking = client
	s.manualConfirmation = manualConfirmation
}
func (s *Service) Charge(ctx context.Context, input ChargeInput) (Charge, error) {
	if s.booking == nil {
		return Charge{}, ErrConflict
	}
	bookingContext, err := s.booking.PaymentContext(ctx, input.BookingID, "", input.CustomerID)
	if err != nil {
		return Charge{}, err
	}
	if bookingContext.Status != "pending_payment" && bookingContext.Status != "pending_hold" {
		return Charge{}, ErrInvalidTransition
	}
	input.BookingID = bookingContext.BookingID
	input.CustomerID = bookingContext.CustomerID
	input.AmountMinor = bookingContext.AmountMinor
	input.Currency = bookingContext.Currency
	input.BookingCode = bookingContext.BookingCode
	input.PaymentType = bookingContext.PaymentType
	input.ProviderID = bookingContext.ProviderID
	input.BranchID = bookingContext.BranchID
	if input.PaymentType == "" {
		input.PaymentType = "full_payment"
	}
	if input.PaymentType == "pay_at_salon" {
		return Charge{}, ErrPayAtSalon
	}
	if input.PaymentChannel == "" {
		input.PaymentChannel = bookingContext.PaymentChannel
	}
	if input.PaymentChannel == "" {
		input.PaymentChannel = "qris"
	}
	if !validPaymentChannel(input.PaymentChannel) || input.AmountMinor <= 0 || input.IdempotencyKey == "" {
		return Charge{}, ErrConflict
	}
	input.PaymentMethod = "midtrans"
	scope := fmt.Sprintf("booking:%d:%s", input.CustomerID, input.IdempotencyKey)
	unlock, err := s.repository.LockCharge(ctx, scope)
	if err != nil {
		return Charge{}, err
	}
	defer unlock()
	existing, err := s.repository.ChargeByIdempotency(ctx, input)
	if err == nil {
		if existing.Payment.BookingID != input.BookingID || existing.Payment.PaymentType != input.PaymentType || existing.Payment.AmountMinor != input.AmountMinor || existing.Payment.PaymentChannel != input.PaymentChannel {
			return Charge{}, ErrConflict
		}
		if existing.Payment.Status != "pending" && existing.Payment.Status != "paid" {
			return Charge{}, ErrInvalidTransition
		}
		return existing, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return Charge{}, err
	}
	hash := sha256.Sum256([]byte(input.IdempotencyKey))
	orderID := fmt.Sprintf("TAKEIN-%d-%x", input.BookingID, hash[:8])
	response, err := s.gateway.Charge(ctx, input, orderID)
	if err != nil {
		return Charge{}, err
	}
	return s.repository.CreateCharge(ctx, input, response)
}

func (s *Service) CreateSubscriptionCharge(ctx context.Context, subscriptionID, providerID, amountMinor int64, currency, paymentChannel string) (Charge, error) {
	if paymentChannel == "" {
		paymentChannel = "qris"
	}
	if subscriptionID <= 0 || providerID <= 0 || amountMinor <= 0 || !validPaymentChannel(paymentChannel) {
		return Charge{}, ErrConflict
	}
	input := ChargeInput{SubscriptionID: subscriptionID, ProviderID: providerID, PaymentType: "subscription", AmountMinor: amountMinor, Currency: currency, PaymentMethod: "midtrans", PaymentChannel: paymentChannel, IdempotencyKey: "subscription-" + strconv.FormatInt(subscriptionID, 10)}
	unlock, err := s.repository.LockCharge(ctx, fmt.Sprintf("subscription:%d:%d", providerID, subscriptionID))
	if err != nil {
		return Charge{}, err
	}
	defer unlock()
	existing, err := s.repository.ChargeByIdempotency(ctx, input)
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return Charge{}, err
	}
	orderID := "SUB-" + strconv.FormatInt(providerID, 10) + "-" + strconv.FormatInt(subscriptionID, 10)
	response, err := s.gateway.Charge(ctx, input, orderID)
	if err != nil {
		return Charge{}, err
	}
	return s.repository.CreateCharge(ctx, input, response)
}

func validPaymentChannel(value string) bool {
	switch value {
	case "qris", "bca_va", "bni_va", "bri_va", "permata_va", "cimb_va", "mandiri_bill":
		return true
	default:
		return false
	}
}

func (s *Service) ManualConfirm(ctx context.Context, bookingCode string, customerID int64) (Payment, string, error) {
	if !s.manualConfirmation {
		return Payment{}, "", ErrManualDisabled
	}
	if s.booking == nil {
		return Payment{}, "", ErrConflict
	}
	bookingContext, err := s.booking.PaymentContext(ctx, 0, bookingCode, customerID)
	if err != nil {
		return Payment{}, "", err
	}
	if bookingContext.PaymentType == "pay_at_salon" {
		return Payment{}, "", ErrPayAtSalon
	}
	value, err := s.repository.ManualConfirm(ctx, bookingContext.BookingID, customerID)
	if err != nil {
		return Payment{}, "", err
	}
	bookingStatus, err := s.booking.ApplyPaymentState(ctx, uuid.NewString(), value)
	if err != nil {
		return Payment{}, "", err
	}
	return value, bookingStatus, nil
}
func (s *Service) Status(ctx context.Context, bookingID, customerID int64) (Payment, error) {
	value, err := s.repository.ByBooking(ctx, bookingID)
	if errors.Is(err, ErrNotFound) && s.booking != nil {
		bookingContext, contextErr := s.booking.PaymentContext(ctx, bookingID, "", customerID)
		if contextErr != nil {
			return Payment{}, contextErr
		}
		status, method := "pending", "midtrans"
		if bookingContext.PaymentType == "pay_at_salon" {
			status, method = "unpaid", "pay_at_salon"
		}
		owner := bookingContext.CustomerID
		return Payment{BookingID: bookingContext.BookingID, ProviderID: &bookingContext.ProviderID, CustomerID: &owner, PaymentType: bookingContext.PaymentType, AmountMinor: bookingContext.AmountMinor, Currency: bookingContext.Currency, Status: status, PaymentMethod: method, PaymentChannel: bookingContext.PaymentChannel}, nil
	}
	if err == nil && (value.CustomerID == nil || *value.CustomerID != customerID) {
		return Payment{}, ErrForbidden
	}
	return value, err
}
func (s *Service) Webhook(ctx context.Context, notification Notification, raw []byte) (Payment, bool, error) {
	domainmetrics.PaymentWebhook()
	if !VerifySignature(notification, s.serverKey) {
		domainmetrics.PaymentInvalidSignature()
		return Payment{}, false, ErrInvalidSignature
	}
	value, replay, err := s.repository.ProcessNotification(ctx, notification, raw)
	if err == nil && !replay {
		domainmetrics.PaymentTransition(value.Status)
	}
	return value, replay, err
}
