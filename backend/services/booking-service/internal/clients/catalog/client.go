package catalogclient

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"

	catalogv1 "github.com/nihfery/takein/gen/go/takein/catalog/v1"
	commonv1 "github.com/nihfery/takein/gen/go/takein/common/v1"
	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/correlation"
	"github.com/nihfery/takein/services/booking-service/internal/booking"
	"google.golang.org/grpc"
)

type Client struct {
	client catalogv1.CatalogServiceClient
}

func (c *Client) BookingPage(ctx context.Context, branchID int64) (map[string]any, error) {
	response, err := c.client.GetBranchBookingPage(ctx, &catalogv1.GetBranchBookingPageRequest{BranchId: strconv.FormatInt(branchID, 10), Metadata: requestMetadata(ctx)})
	if err != nil {
		return nil, err
	}
	result := map[string]any{}
	if response.GetJsonPayload() == "" {
		return nil, errors.New("catalog booking page payload is empty")
	}
	if err = json.Unmarshal([]byte(response.GetJsonPayload()), &result); err != nil {
		return nil, err
	}
	return result, nil
}

func New(connection grpc.ClientConnInterface) *Client {
	return &Client{client: catalogv1.NewCatalogServiceClient(connection)}
}

func (c *Client) Snapshots(ctx context.Context, branchID int64, serviceIDs []int64) ([]booking.ServiceSnapshot, error) {
	rawIDs := make([]string, 0, len(serviceIDs))
	for _, id := range serviceIDs {
		rawIDs = append(rawIDs, strconv.FormatInt(id, 10))
	}
	response, err := c.client.GetServicesSnapshot(ctx, &catalogv1.GetServicesSnapshotRequest{BranchId: strconv.FormatInt(branchID, 10), ServiceIds: rawIDs, Metadata: requestMetadata(ctx)})
	if err != nil {
		return nil, err
	}
	items := make([]booking.ServiceSnapshot, 0, len(response.GetServices()))
	for _, item := range response.GetServices() {
		serviceID, _ := strconv.ParseInt(item.GetServiceId(), 10, 64)
		providerID, _ := strconv.ParseInt(item.GetProviderId(), 10, 64)
		items = append(items, booking.ServiceSnapshot{ServiceID: serviceID, ProviderID: providerID, Title: item.GetTitle(), PriceMinor: item.GetPrice().GetMinorUnits(), DPAmountMinor: item.GetDpAmount().GetMinorUnits(), Currency: item.GetPrice().GetCurrency(), Duration: item.GetDurationMinutes(), QueueEnabled: item.GetQueueEnabled(), ScheduledEnabled: item.GetScheduledEnabled(), RequiresDP: item.GetRequiresDp()})
	}
	return items, nil
}

func (c *Client) PriceSummary(ctx context.Context, code string, serviceIDs []int64, subtotal int64, currency, redemptionKey string) (booking.PriceSummary, error) {
	rawIDs := make([]string, 0, len(serviceIDs))
	for _, id := range serviceIDs {
		rawIDs = append(rawIDs, strconv.FormatInt(id, 10))
	}
	response, err := c.client.ValidateCoupon(ctx, &catalogv1.ValidateCouponRequest{Code: code, ServiceIds: rawIDs, Subtotal: &commonv1.Money{MinorUnits: subtotal, Currency: currency}, Metadata: requestMetadata(ctx), RedemptionKey: redemptionKey, Redeem: redemptionKey != ""})
	if err != nil {
		return booking.PriceSummary{}, err
	}
	if !response.GetValid() {
		return booking.PriceSummary{}, booking.ErrInvalidTransition
	}
	return booking.PriceSummary{SubtotalMinor: response.GetSubtotal().GetMinorUnits(), DiscountMinor: response.GetDiscount().GetMinorUnits(), TaxMinor: response.GetTax().GetMinorUnits(), PayableMinor: response.GetPayable().GetMinorUnits()}, nil
}

func (c *Client) ReleaseCoupon(ctx context.Context, redemptionKey string) error {
	_, err := c.client.ReleaseCoupon(ctx, &catalogv1.ReleaseCouponRequest{RedemptionKey: redemptionKey, Metadata: requestMetadata(ctx)})
	return err
}

func requestMetadata(ctx context.Context) *commonv1.RequestMetadata {
	requestID, correlationID := correlation.From(ctx)
	value := &commonv1.RequestMetadata{RequestId: requestID, CorrelationId: correlationID}
	if actor, ok := authcontext.ActorFrom(ctx); ok {
		value.ActorId, value.ActorRole, value.ProviderId, value.BranchId, value.Permissions = actor.UserID, actor.Role, actor.ProviderID, actor.BranchID, actor.Permissions
	}
	return value
}
