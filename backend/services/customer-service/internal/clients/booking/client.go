package bookingclient

import (
	"context"
	"strconv"

	bookingv1 "github.com/nihfery/takein/gen/go/takein/booking/v1"
	commonv1 "github.com/nihfery/takein/gen/go/takein/common/v1"
	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/correlation"
	"github.com/nihfery/takein/services/customer-service/internal/customer"
	"google.golang.org/grpc"
)

type Client struct {
	client bookingv1.BookingServiceClient
}

func New(connection grpc.ClientConnInterface) *Client {
	return &Client{client: bookingv1.NewBookingServiceClient(connection)}
}

func (c *Client) ReviewEligibility(ctx context.Context, bookingCode string, customerID int64) (customer.ReviewEligibility, error) {
	response, err := c.client.CheckReviewEligibility(ctx, &bookingv1.CheckReviewEligibilityRequest{BookingCode: bookingCode, CustomerId: strconv.FormatInt(customerID, 10), Metadata: requestMetadata(ctx)})
	if err != nil {
		return customer.ReviewEligibility{}, err
	}
	value := customer.ReviewEligibility{Eligible: response.GetEligible(), Reason: response.GetReason()}
	value.BookingID, _ = strconv.ParseInt(response.GetBookingId(), 10, 64)
	value.BranchID, _ = strconv.ParseInt(response.GetBranchId(), 10, 64)
	for _, raw := range response.GetStaffIds() {
		if id, parseErr := strconv.ParseInt(raw, 10, 64); parseErr == nil && id > 0 {
			value.StaffIDs = append(value.StaffIDs, id)
		}
	}
	return value, nil
}

func requestMetadata(ctx context.Context) *commonv1.RequestMetadata {
	requestID, correlationID := correlation.From(ctx)
	value := &commonv1.RequestMetadata{RequestId: requestID, CorrelationId: correlationID}
	if actor, ok := authcontext.ActorFrom(ctx); ok {
		value.ActorId, value.ActorRole, value.ProviderId, value.BranchId = actor.UserID, actor.Role, actor.ProviderID, actor.BranchID
	}
	return value
}
