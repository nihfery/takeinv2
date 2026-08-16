package providerclient

import (
	"context"
	"strconv"
	"time"

	commonv1 "github.com/nihfery/takein/gen/go/takein/common/v1"
	providerv1 "github.com/nihfery/takein/gen/go/takein/provider/v1"
	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/correlation"
	"github.com/nihfery/takein/services/booking-service/internal/booking"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type Client struct {
	client providerv1.ProviderServiceClient
}

func New(connection grpc.ClientConnInterface) *Client {
	return &Client{client: providerv1.NewProviderServiceClient(connection)}
}

func (c *Client) EligibleStaff(ctx context.Context, providerID, branchID int64, serviceIDs []int64, startsAt, endsAt time.Time) ([]booking.EligibleStaff, error) {
	rawIDs := make([]string, 0, len(serviceIDs))
	for _, id := range serviceIDs {
		rawIDs = append(rawIDs, strconv.FormatInt(id, 10))
	}
	response, err := c.client.ResolveEligibleStaff(ctx, &providerv1.ResolveEligibleStaffRequest{ProviderId: strconv.FormatInt(providerID, 10), BranchId: strconv.FormatInt(branchID, 10), ServiceIds: rawIDs, Slot: &commonv1.TimeRange{StartsAt: timestamppb.New(startsAt), EndsAt: timestamppb.New(endsAt)}, Metadata: requestMetadata(ctx)})
	if err != nil {
		return nil, err
	}
	items := make([]booking.EligibleStaff, 0, len(response.GetStaff()))
	for _, item := range response.GetStaff() {
		staffID, _ := strconv.ParseInt(item.GetStaffId(), 10, 64)
		resolvedBranchID, _ := strconv.ParseInt(item.GetBranchId(), 10, 64)
		resolvedServices := make([]int64, 0, len(item.GetServiceIds()))
		for _, raw := range item.GetServiceIds() {
			if id, parseErr := strconv.ParseInt(raw, 10, 64); parseErr == nil {
				resolvedServices = append(resolvedServices, id)
			}
		}
		items = append(items, booking.EligibleStaff{ID: staffID, BranchID: resolvedBranchID, ServiceIDs: resolvedServices, Status: item.GetStatus()})
	}
	return items, nil
}

func requestMetadata(ctx context.Context) *commonv1.RequestMetadata {
	requestID, correlationID := correlation.From(ctx)
	value := &commonv1.RequestMetadata{RequestId: requestID, CorrelationId: correlationID}
	if actor, ok := authcontext.ActorFrom(ctx); ok {
		value.ActorId, value.ActorRole, value.ProviderId, value.BranchId, value.Permissions = actor.UserID, actor.Role, actor.ProviderID, actor.BranchID, actor.Permissions
	}
	return value
}
