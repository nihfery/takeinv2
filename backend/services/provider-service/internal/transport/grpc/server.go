package grpctransport

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	providerv1 "github.com/nihfery/takein/gen/go/takein/provider/v1"
	billingclient "github.com/nihfery/takein/services/provider-service/internal/clients/billing"
	"github.com/nihfery/takein/services/provider-service/internal/provider"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Server struct {
	providerv1.UnimplementedProviderServiceServer
	service *provider.Service
	billing *billingclient.Client
}

func New(service *provider.Service, billing *billingclient.Client) *Server {
	return &Server{service: service, billing: billing}
}

func (s *Server) GetProviderReadiness(ctx context.Context, request *providerv1.GetProviderReadinessRequest) (*providerv1.GetProviderReadinessResponse, error) {
	providerID, err := parseID(request.GetProviderId())
	if err != nil {
		return nil, err
	}
	profile, err := s.service.Repository().ProfileByID(ctx, providerID)
	if err != nil {
		return nil, mapError(err)
	}
	entitlement, err := s.billing.Get(ctx, providerID)
	if err != nil {
		return nil, status.Error(codes.Unavailable, "billing entitlement is unavailable")
	}
	// Existing product parity permits a verified free provider to stay visible
	// without a paid subscription or trial; entitlement is reported separately.
	ready := profile.Status == "active" && profile.DocumentStatus == "verified"
	return &providerv1.GetProviderReadinessResponse{Ready: ready, VerificationStatus: profile.DocumentStatus, OnboardingStatus: profile.OnboardingStatus, Entitled: entitlement.Active}, nil
}

func (s *Server) ValidateBranchScope(ctx context.Context, request *providerv1.ValidateBranchScopeRequest) (*providerv1.ValidateBranchScopeResponse, error) {
	branchID, err := parseID(request.GetBranchId())
	if err != nil {
		return nil, err
	}
	var providerID int64
	if request.GetProviderId() != "" {
		providerID, err = parseID(request.GetProviderId())
		if err != nil {
			return nil, err
		}
	} else {
		branch, branchErr := s.service.Repository().Branch(ctx, branchID)
		if branchErr != nil {
			return nil, mapError(branchErr)
		}
		providerID = branch.ProviderID
	}
	branch, err := s.service.Repository().Branch(ctx, branchID)
	if err != nil {
		return nil, mapError(err)
	}
	if branch.ProviderID != providerID {
		return &providerv1.ValidateBranchScopeResponse{Allowed: false, Reason: "branch does not belong to provider"}, nil
	}
	metadata := request.GetMetadata()
	if metadata == nil {
		return &providerv1.ValidateBranchScopeResponse{Allowed: false, Reason: "actor metadata is required"}, nil
	}
	if metadata.GetActorRole() == "admin" {
		return &providerv1.ValidateBranchScopeResponse{Allowed: true}, nil
	}
	if metadata.GetActorRole() != "provider" || metadata.GetProviderId() != request.GetProviderId() {
		return &providerv1.ValidateBranchScopeResponse{Allowed: false, Reason: "provider scope does not match"}, nil
	}
	if metadata.GetBranchId() != "" && metadata.GetBranchId() != request.GetBranchId() {
		return &providerv1.ValidateBranchScopeResponse{Allowed: false, Reason: "branch account is outside requested branch"}, nil
	}
	if request.GetPermission() != "" && !contains(metadata.GetPermissions(), request.GetPermission()) {
		profile, profileErr := s.service.Repository().ProfileByID(ctx, providerID)
		if profileErr != nil || strconv.FormatInt(profile.UserID, 10) != request.GetActorId() {
			return missingPermission()
		}
	}
	return &providerv1.ValidateBranchScopeResponse{Allowed: true}, nil
}

func missingPermission() (*providerv1.ValidateBranchScopeResponse, error) {
	return &providerv1.ValidateBranchScopeResponse{Allowed: false, Reason: "required permission is missing"}, nil
}

func (s *Server) ResolveEligibleStaff(ctx context.Context, request *providerv1.ResolveEligibleStaffRequest) (*providerv1.ResolveEligibleStaffResponse, error) {
	providerID, err := parseID(request.GetProviderId())
	if err != nil {
		return nil, err
	}
	branchID, err := parseID(request.GetBranchId())
	if err != nil {
		return nil, err
	}
	if request.GetSlot() == nil || request.GetSlot().GetStartsAt() == nil || request.GetSlot().GetEndsAt() == nil {
		return nil, status.Error(codes.InvalidArgument, "slot is required")
	}
	startsAt, endsAt := request.GetSlot().GetStartsAt().AsTime(), request.GetSlot().GetEndsAt().AsTime()
	if !endsAt.After(startsAt) || time.Until(endsAt) > 366*24*time.Hour {
		return nil, status.Error(codes.InvalidArgument, "slot range is invalid")
	}
	serviceIDs := make([]int64, 0, len(request.GetServiceIds()))
	for _, raw := range request.GetServiceIds() {
		id, parseErr := strconv.ParseInt(raw, 10, 64)
		if parseErr != nil || id <= 0 {
			return nil, status.Error(codes.InvalidArgument, "service_ids must be numeric")
		}
		serviceIDs = append(serviceIDs, id)
	}
	items, err := s.service.Repository().ResolveEligibleStaff(ctx, providerID, branchID, serviceIDs, startsAt, endsAt)
	if err != nil {
		return nil, mapError(err)
	}
	response := &providerv1.ResolveEligibleStaffResponse{}
	for _, item := range items {
		staff := &providerv1.Staff{StaffId: strconv.FormatInt(item.Staff.ID, 10), Status: item.Staff.Status}
		if item.Staff.BranchID != nil {
			staff.BranchId = strconv.FormatInt(*item.Staff.BranchID, 10)
		}
		for _, serviceID := range item.ServiceIDs {
			staff.ServiceIds = append(staff.ServiceIds, strconv.FormatInt(serviceID, 10))
		}
		response.Staff = append(response.Staff, staff)
	}
	return response, nil
}

func parseID(raw string) (int64, error) {
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value <= 0 {
		return 0, status.Error(codes.InvalidArgument, "identifier must be numeric")
	}
	return value, nil
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if strings.EqualFold(value, target) {
			return true
		}
	}
	return false
}

func mapError(err error) error {
	switch {
	case errors.Is(err, provider.ErrNotFound):
		return status.Error(codes.NotFound, "provider resource not found")
	case errors.Is(err, provider.ErrForbidden):
		return status.Error(codes.PermissionDenied, "provider resource is outside actor scope")
	default:
		return status.Error(codes.Internal, "provider operation failed")
	}
}
