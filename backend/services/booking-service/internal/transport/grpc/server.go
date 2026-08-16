package grpctransport

import (
	"context"
	"errors"
	"strconv"
	"strings"

	bookingv1 "github.com/nihfery/takein/gen/go/takein/booking/v1"
	commonv1 "github.com/nihfery/takein/gen/go/takein/common/v1"
	"github.com/nihfery/takein/services/booking-service/internal/booking"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Server struct {
	bookingv1.UnimplementedBookingServiceServer
	service *booking.Service
}

func New(service *booking.Service) *Server { return &Server{service: service} }

func (s *Server) GetBookingPaymentContext(ctx context.Context, request *bookingv1.GetBookingPaymentContextRequest) (*bookingv1.GetBookingPaymentContextResponse, error) {
	value, err := s.resolve(ctx, request.GetBookingId(), request.GetBookingCode())
	if err != nil {
		return nil, mapError(err)
	}
	if !ownedBy(value, request.GetCustomerId()) {
		return nil, status.Error(codes.PermissionDenied, "booking is outside customer scope")
	}
	response := &bookingv1.GetBookingPaymentContextResponse{BookingId: strconv.FormatInt(value.ID, 10), BookingCode: value.BookingCode, Status: value.Status, ProviderId: strconv.FormatInt(value.ProviderID, 10), AmountDue: &commonv1.Money{MinorUnits: value.PaymentAmount, Currency: value.Currency}, PaymentType: value.PaymentType, PaymentChannel: value.PaymentChannel}
	if value.CustomerID != nil {
		response.CustomerId = strconv.FormatInt(*value.CustomerID, 10)
	}
	if value.BranchID != nil {
		response.BranchId = strconv.FormatInt(*value.BranchID, 10)
	}
	return response, nil
}

func (s *Server) CheckReviewEligibility(ctx context.Context, request *bookingv1.CheckReviewEligibilityRequest) (*bookingv1.CheckReviewEligibilityResponse, error) {
	value, err := s.resolve(ctx, request.GetBookingId(), request.GetBookingCode())
	if err != nil {
		return nil, mapError(err)
	}
	response := &bookingv1.CheckReviewEligibilityResponse{BookingId: strconv.FormatInt(value.ID, 10)}
	if !ownedBy(value, request.GetCustomerId()) {
		response.Reason = "booking is outside customer scope"
		return response, nil
	}
	if value.Status != "completed" && value.Status != "order_completed" {
		response.Reason = "reviews require a completed booking"
		return response, nil
	}
	if value.BranchID == nil {
		response.Reason = "booking has no branch"
		return response, nil
	}
	staffIDs, err := s.service.Repository().EligibleReviewStaff(ctx, value.ID)
	if err != nil {
		return nil, mapError(err)
	}
	response.Eligible = true
	response.BranchId = strconv.FormatInt(*value.BranchID, 10)
	for _, staffID := range staffIDs {
		response.StaffIds = append(response.StaffIds, strconv.FormatInt(staffID, 10))
	}
	return response, nil
}

func (s *Server) ApplyPaymentState(ctx context.Context, request *bookingv1.ApplyPaymentStateRequest) (*bookingv1.ApplyPaymentStateResponse, error) {
	paymentID, paymentErr := strconv.ParseInt(request.GetPaymentId(), 10, 64)
	bookingID, bookingErr := strconv.ParseInt(request.GetBookingId(), 10, 64)
	if paymentErr != nil || bookingErr != nil {
		return nil, status.Error(codes.InvalidArgument, "payment_id and booking_id must be numeric")
	}
	value, applied, err := s.service.Repository().ApplyPaymentState(ctx, booking.PaymentStateInput{EventID: request.GetEventId(), PaymentID: paymentID, BookingID: bookingID, Status: request.GetPaymentStatus(), AmountMinor: request.GetAmountMinorUnits(), Currency: request.GetCurrency()})
	if err != nil {
		return nil, mapError(err)
	}
	return &bookingv1.ApplyPaymentStateResponse{Applied: applied, BookingStatus: value.Status}, nil
}

func (s *Server) resolve(ctx context.Context, id, code string) (booking.Booking, error) {
	if strings.TrimSpace(code) != "" {
		return s.service.Repository().ByCode(ctx, code)
	}
	parsed, err := strconv.ParseInt(id, 10, 64)
	if err != nil || parsed <= 0 {
		return booking.Booking{}, booking.ErrNotFound
	}
	return s.service.Repository().ByID(ctx, parsed)
}

func ownedBy(value booking.Booking, customerID string) bool {
	parsed, err := strconv.ParseInt(customerID, 10, 64)
	return err == nil && value.CustomerID != nil && *value.CustomerID == parsed
}

func mapError(err error) error {
	switch {
	case errors.Is(err, booking.ErrNotFound):
		return status.Error(codes.NotFound, "booking not found")
	case errors.Is(err, booking.ErrForbidden):
		return status.Error(codes.PermissionDenied, "booking is outside actor scope")
	case errors.Is(err, booking.ErrPaymentMismatch), errors.Is(err, booking.ErrInvalidTransition):
		return status.Error(codes.FailedPrecondition, err.Error())
	default:
		return status.Error(codes.Internal, "booking operation failed")
	}
}
