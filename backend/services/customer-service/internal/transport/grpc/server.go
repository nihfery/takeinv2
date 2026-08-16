package grpctransport

import (
	"context"
	"errors"
	"fmt"
	"strconv"

	customerv1 "github.com/nihfery/takein/gen/go/takein/customer/v1"
	"github.com/nihfery/takein/services/customer-service/internal/customer"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Server struct {
	customerv1.UnimplementedCustomerServiceServer
	service *customer.Service
}

func New(service *customer.Service) *Server { return &Server{service: service} }

func (s *Server) GetCustomer(ctx context.Context, request *customerv1.GetCustomerRequest) (*customerv1.GetCustomerResponse, error) {
	id, err := strconv.ParseInt(request.GetCustomerId(), 10, 64)
	if err != nil || id <= 0 {
		return nil, status.Error(codes.InvalidArgument, "customer_id must be numeric")
	}
	value, err := s.service.Repository().ByID(ctx, id)
	if err != nil {
		return nil, mapError(err)
	}
	return &customerv1.GetCustomerResponse{CustomerId: fmt.Sprint(value["id"]), UserId: fmt.Sprint(value["user_id"]), Status: fmt.Sprint(value["status"])}, nil
}

func (s *Server) CheckReviewEligibility(ctx context.Context, request *customerv1.CheckReviewEligibilityRequest) (*customerv1.CheckReviewEligibilityResponse, error) {
	userID, userErr := strconv.ParseInt(request.GetCustomerId(), 10, 64)
	bookingID, bookingErr := strconv.ParseInt(request.GetBookingId(), 10, 64)
	if userErr != nil || bookingErr != nil {
		return nil, status.Error(codes.InvalidArgument, "customer_id and booking_id must be numeric")
	}
	exists, err := s.service.Repository().HasReview(ctx, userID, bookingID)
	if err != nil {
		return nil, mapError(err)
	}
	if exists {
		return &customerv1.CheckReviewEligibilityResponse{Eligible: false, Reason: "a venue review has already been submitted for this booking"}, nil
	}
	return &customerv1.CheckReviewEligibilityResponse{Eligible: true}, nil
}

func mapError(err error) error {
	if errors.Is(err, customer.ErrNotFound) {
		return status.Error(codes.NotFound, "customer not found")
	}
	return status.Error(codes.Internal, "customer operation failed")
}
