package billingclient

import (
	"context"
	"strconv"

	billingv1 "github.com/nihfery/takein/gen/go/takein/billing/v1"
	commonv1 "github.com/nihfery/takein/gen/go/takein/common/v1"
	"github.com/nihfery/takein/libs/go/correlation"
	"github.com/nihfery/takein/services/provider-service/internal/provider"
	"google.golang.org/grpc"
)

type Client struct {
	client billingv1.BillingServiceClient
}

func New(connection grpc.ClientConnInterface) *Client {
	return &Client{client: billingv1.NewBillingServiceClient(connection)}
}

func (c *Client) Get(ctx context.Context, providerID int64) (provider.Entitlement, error) {
	requestID, correlationID := correlation.From(ctx)
	response, err := c.client.GetEntitlement(ctx, &billingv1.GetEntitlementRequest{ProviderId: strconv.FormatInt(providerID, 10), Metadata: &commonv1.RequestMetadata{RequestId: requestID, CorrelationId: correlationID}})
	if err != nil {
		return provider.Entitlement{}, err
	}
	return provider.Entitlement{Active: response.GetEntitled(), Source: response.GetSource(), Status: response.GetStatus(), ExpiresAt: response.GetExpiresAt(), MaxBranches: response.GetMaxBranches()}, nil
}
