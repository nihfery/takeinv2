package paymentclient

import (
	"context"
	"strconv"

	commonv1 "github.com/nihfery/takein/gen/go/takein/common/v1"
	paymentv1 "github.com/nihfery/takein/gen/go/takein/payment/v1"
	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/correlation"
	"github.com/nihfery/takein/services/billing-service/internal/billing"
	"google.golang.org/grpc"
)

type Client struct {
	client paymentv1.PaymentServiceClient
}

func New(connection grpc.ClientConnInterface) *Client {
	return &Client{client: paymentv1.NewPaymentServiceClient(connection)}
}

func (c *Client) CreateSubscriptionCharge(ctx context.Context, subscriptionID, providerID, amountMinor int64, currency, paymentChannel string) (billing.PaymentCharge, error) {
	response, err := c.client.CreateSubscriptionCharge(ctx, &paymentv1.CreateSubscriptionChargeRequest{SubscriptionId: strconv.FormatInt(subscriptionID, 10), ProviderId: strconv.FormatInt(providerID, 10), Amount: &commonv1.Money{MinorUnits: amountMinor, Currency: currency}, Metadata: requestMetadata(ctx), PaymentChannel: paymentChannel})
	if err != nil {
		return billing.PaymentCharge{}, err
	}
	return billing.PaymentCharge{PaymentID: response.GetPaymentId(), OrderID: response.GetGatewayOrderId(), Status: response.GetStatus(), RedirectURL: response.GetRedirectUrl(), Token: response.GetToken(), ExpiresAt: response.GetExpiresAt(), PaymentChannel: response.GetPaymentChannel()}, nil
}

func requestMetadata(ctx context.Context) *commonv1.RequestMetadata {
	requestID, correlationID := correlation.From(ctx)
	value := &commonv1.RequestMetadata{RequestId: requestID, CorrelationId: correlationID}
	if actor, ok := authcontext.ActorFrom(ctx); ok {
		value.ActorId, value.ActorRole, value.ProviderId, value.BranchId = actor.UserID, actor.Role, actor.ProviderID, actor.BranchID
	}
	return value
}
