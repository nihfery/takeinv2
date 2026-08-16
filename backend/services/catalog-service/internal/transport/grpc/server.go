package grpctransport

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"

	catalogv1 "github.com/nihfery/takein/gen/go/takein/catalog/v1"
	commonv1 "github.com/nihfery/takein/gen/go/takein/common/v1"
	"github.com/nihfery/takein/services/catalog-service/internal/catalog"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Server struct {
	catalogv1.UnimplementedCatalogServiceServer
	service *catalog.Service
}

func New(service *catalog.Service) *Server { return &Server{service: service} }

func (s *Server) GetServicesSnapshot(ctx context.Context, request *catalogv1.GetServicesSnapshotRequest) (*catalogv1.GetServicesSnapshotResponse, error) {
	var providerID int64
	var err error
	if request.GetProviderId() != "" {
		providerID, err = parseID(request.GetProviderId())
		if err != nil {
			return nil, err
		}
	}
	branchID, err := parseID(request.GetBranchId())
	if err != nil {
		return nil, err
	}
	serviceIDs := make([]int64, 0, len(request.GetServiceIds()))
	for _, raw := range request.GetServiceIds() {
		id, parseErr := parseID(raw)
		if parseErr != nil {
			return nil, parseErr
		}
		serviceIDs = append(serviceIDs, id)
	}
	items, err := s.service.Repository().ServiceSnapshots(ctx, providerID, branchID, serviceIDs)
	if err != nil {
		return nil, mapError(err)
	}
	if len(items) != len(serviceIDs) {
		return nil, status.Error(codes.FailedPrecondition, "one or more services are inactive or outside branch scope")
	}
	response := &catalogv1.GetServicesSnapshotResponse{}
	for _, item := range items {
		response.Services = append(response.Services, &catalogv1.ServiceSnapshot{ServiceId: strconv.FormatInt(item.ID, 10), ProviderId: strconv.FormatInt(item.ProviderID, 10), Title: item.Title, Price: &commonv1.Money{MinorUnits: item.PriceMinor, Currency: item.Currency}, DurationMinutes: item.Duration, QueueEnabled: item.QueueEnabled, ScheduledEnabled: item.ScheduledEnabled, RequiresDp: item.RequiresDP, DpAmount: &commonv1.Money{MinorUnits: item.DPAmountMinor, Currency: item.Currency}})
	}
	return response, nil
}

func (s *Server) GetBranchBookingPage(ctx context.Context, request *catalogv1.GetBranchBookingPageRequest) (*catalogv1.GetBranchBookingPageResponse, error) {
	branchID, err := parseID(request.GetBranchId())
	if err != nil {
		return nil, err
	}
	branch, err := s.service.Repository().PublicBranch(ctx, branchID)
	if err != nil {
		return nil, mapError(err)
	}
	services, err := s.service.Repository().ListBranchServices(ctx, branchID)
	if err != nil {
		return nil, mapError(err)
	}
	staff, err := s.service.Repository().PublicStaff(ctx, &branchID, nil)
	if err != nil {
		return nil, mapError(err)
	}
	groupsByName := map[string][]map[string]any{}
	groupOrder := []string{}
	for _, item := range services {
		name := fmt.Sprint(item["category_text"])
		if name == "" || name == "<nil>" {
			name = "Lainnya"
		}
		if _, exists := groupsByName[name]; !exists {
			groupOrder = append(groupOrder, name)
		}
		groupsByName[name] = append(groupsByName[name], item)
	}
	groups := make([]map[string]any, 0, len(groupOrder))
	for _, name := range groupOrder {
		groups = append(groups, map[string]any{"category": name, "services": groupsByName[name]})
	}
	branch["services"] = services
	branch["staff"] = staff
	branch["service_groups"] = groups
	payload, err := json.Marshal(map[string]any{"branch": branch, "booking_preview": nil})
	if err != nil {
		return nil, status.Error(codes.Internal, "encode booking page failed")
	}
	return &catalogv1.GetBranchBookingPageResponse{JsonPayload: string(payload)}, nil
}

func (s *Server) ValidateCoupon(ctx context.Context, request *catalogv1.ValidateCouponRequest) (*catalogv1.ValidateCouponResponse, error) {
	if request.GetSubtotal() == nil || request.GetSubtotal().GetMinorUnits() < 0 || len(request.GetServiceIds()) == 0 || request.GetRedeem() && request.GetRedemptionKey() == "" {
		return nil, status.Error(codes.InvalidArgument, "subtotal, service_ids, and redemption key are required")
	}
	serviceIDs := make([]int64, 0, len(request.GetServiceIds()))
	for _, raw := range request.GetServiceIds() {
		id, parseErr := parseID(raw)
		if parseErr != nil {
			return nil, parseErr
		}
		serviceIDs = append(serviceIDs, id)
	}
	redemptionKey := ""
	if request.GetRedeem() {
		redemptionKey = request.GetRedemptionKey()
	}
	value, err := s.service.Repository().PriceSummary(ctx, request.GetCode(), serviceIDs, redemptionKey)
	if err != nil {
		if errors.Is(err, catalog.ErrNotFound) || errors.Is(err, catalog.ErrInvalidCoupon) || errors.Is(err, catalog.ErrConflict) {
			return &catalogv1.ValidateCouponResponse{Valid: false, Reason: "coupon is not applicable", Discount: &commonv1.Money{Currency: request.GetSubtotal().GetCurrency()}}, nil
		}
		return nil, mapError(err)
	}
	if request.GetSubtotal().GetMinorUnits() != value.SubtotalMinor {
		if redemptionKey != "" {
			_, _ = s.service.Repository().ReleaseCoupon(ctx, redemptionKey)
		}
		return &catalogv1.ValidateCouponResponse{Valid: false, Reason: "service subtotal changed", Discount: &commonv1.Money{Currency: request.GetSubtotal().GetCurrency()}}, nil
	}
	couponJSON, _ := json.Marshal(value.Coupon)
	currency := request.GetSubtotal().GetCurrency()
	return &catalogv1.ValidateCouponResponse{Valid: true, Discount: money(value.DiscountMinor, currency), Subtotal: money(value.SubtotalMinor, currency), EligibleSubtotal: money(value.EligibleSubtotalMinor, currency), Tax: money(value.TaxMinor, currency), Payable: money(value.PayableMinor, currency), CouponJson: string(couponJSON)}, nil
}

func (s *Server) ReleaseCoupon(ctx context.Context, request *catalogv1.ReleaseCouponRequest) (*catalogv1.ReleaseCouponResponse, error) {
	if request.GetRedemptionKey() == "" {
		return nil, status.Error(codes.InvalidArgument, "redemption_key is required")
	}
	released, err := s.service.Repository().ReleaseCoupon(ctx, request.GetRedemptionKey())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.ReleaseCouponResponse{Released: released}, nil
}

func money(value int64, currency string) *commonv1.Money {
	return &commonv1.Money{MinorUnits: value, Currency: currency}
}

func parseID(raw string) (int64, error) {
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value <= 0 {
		return 0, status.Error(codes.InvalidArgument, "identifier must be numeric")
	}
	return value, nil
}

func mapError(err error) error {
	if errors.Is(err, catalog.ErrNotFound) {
		return status.Error(codes.NotFound, "catalog resource not found")
	}
	if errors.Is(err, catalog.ErrValidation) || errors.Is(err, catalog.ErrInvalidCoupon) {
		return status.Error(codes.InvalidArgument, "catalog input is invalid")
	}
	return status.Error(codes.Internal, "catalog operation failed")
}
