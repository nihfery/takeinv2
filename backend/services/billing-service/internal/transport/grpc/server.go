package grpctransport

import (
	"context"
	"errors"
	"strconv"
	"time"

	billingv1 "github.com/nihfery/takein/gen/go/takein/billing/v1"
	"github.com/nihfery/takein/services/billing-service/internal/billing"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Server struct {
	billingv1.UnimplementedBillingServiceServer
	service *billing.Service
}

func New(service *billing.Service) *Server { return &Server{service: service} }

func (s *Server) GetEntitlement(ctx context.Context, request *billingv1.GetEntitlementRequest) (*billingv1.GetEntitlementResponse, error) {
	providerID, err := strconv.ParseInt(request.GetProviderId(), 10, 64)
	if err != nil || providerID <= 0 {
		return nil, status.Error(codes.InvalidArgument, "provider_id must be numeric")
	}
	value, err := s.service.Entitlement(ctx, providerID)
	if err != nil {
		if errors.Is(err, billing.ErrNotFound) {
			return nil, status.Error(codes.NotFound, "provider entitlement not found")
		}
		return nil, status.Error(codes.Internal, "entitlement lookup failed")
	}
	response := &billingv1.GetEntitlementResponse{Entitled: value.Active, Source: value.Source, Status: statusText(value), MaxBranches: value.MaxBranches}
	if value.EndsAt != nil {
		response.ExpiresAt = value.EndsAt.UTC().Format(time.RFC3339Nano)
	}
	return response, nil
}

func statusText(value billing.Entitlement) string {
	if value.Active {
		return "active"
	}
	return "inactive"
}
