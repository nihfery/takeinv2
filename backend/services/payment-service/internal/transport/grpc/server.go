package grpctransport

import (
	"context"
	"errors"
	"strconv"
	"time"

	commonv1 "github.com/nihfery/takein/gen/go/takein/common/v1"
	paymentv1 "github.com/nihfery/takein/gen/go/takein/payment/v1"
	"github.com/nihfery/takein/services/payment-service/internal/payment"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Server struct {
	paymentv1.UnimplementedPaymentServiceServer
	service *payment.Service
}

func New(service *payment.Service) *Server { return &Server{service: service} }

func (s *Server) GetPayment(ctx context.Context, request *paymentv1.GetPaymentRequest) (*paymentv1.GetPaymentResponse, error) {
	id, err := strconv.ParseInt(request.GetPaymentId(), 10, 64)
	if err != nil || id <= 0 {
		return nil, status.Error(codes.InvalidArgument, "payment_id must be numeric")
	}
	value, err := s.service.Repository().ByID(ctx, id)
	if err != nil {
		return nil, mapError(err)
	}
	return &paymentv1.GetPaymentResponse{PaymentId: strconv.FormatInt(value.ID, 10), BookingId: nullableID(value.BookingID), Status: value.Status, Amount: &commonv1.Money{MinorUnits: value.AmountMinor, Currency: value.Currency}}, nil
}

func (s *Server) CreateSubscriptionCharge(ctx context.Context, request *paymentv1.CreateSubscriptionChargeRequest) (*paymentv1.CreateSubscriptionChargeResponse, error) {
	subscriptionID, subscriptionErr := strconv.ParseInt(request.GetSubscriptionId(), 10, 64)
	providerID, providerErr := strconv.ParseInt(request.GetProviderId(), 10, 64)
	if subscriptionErr != nil || providerErr != nil || request.GetAmount() == nil {
		return nil, status.Error(codes.InvalidArgument, "subscription charge identifiers and amount are required")
	}
	charge, err := s.service.CreateSubscriptionCharge(ctx, subscriptionID, providerID, request.GetAmount().GetMinorUnits(), request.GetAmount().GetCurrency(), request.GetPaymentChannel())
	if err != nil {
		return nil, mapError(err)
	}
	response := &paymentv1.CreateSubscriptionChargeResponse{PaymentId: strconv.FormatInt(charge.Payment.ID, 10), GatewayOrderId: charge.OrderID, Status: charge.Payment.Status, RedirectUrl: charge.RedirectURL, Token: charge.Token, PaymentChannel: charge.PaymentChannel}
	if charge.ExpiresAt != nil {
		response.ExpiresAt = charge.ExpiresAt.UTC().Format(time.RFC3339Nano)
	}
	return response, nil
}

func nullableID(value int64) string {
	if value <= 0 {
		return ""
	}
	return strconv.FormatInt(value, 10)
}

func mapError(err error) error {
	switch {
	case errors.Is(err, payment.ErrNotFound):
		return status.Error(codes.NotFound, "payment not found")
	case errors.Is(err, payment.ErrForbidden):
		return status.Error(codes.PermissionDenied, "payment is outside actor scope")
	case errors.Is(err, payment.ErrConflict), errors.Is(err, payment.ErrInvalidTransition):
		return status.Error(codes.FailedPrecondition, err.Error())
	default:
		return status.Error(codes.Unavailable, "payment operation failed")
	}
}
