package bookingclient

import (
	"context"
	"strconv"

	bookingv1 "github.com/nihfery/takein/gen/go/takein/booking/v1"
	commonv1 "github.com/nihfery/takein/gen/go/takein/common/v1"
	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/correlation"
	"github.com/nihfery/takein/services/payment-service/internal/payment"
	"google.golang.org/grpc"
)

type Client struct {
	client bookingv1.BookingServiceClient
}

func New(connection grpc.ClientConnInterface) *Client {
	return &Client{client: bookingv1.NewBookingServiceClient(connection)}
}

func (c *Client) PaymentContext(ctx context.Context, bookingID int64, bookingCode string, customerID int64) (payment.BookingPaymentContext, error) {
	request := &bookingv1.GetBookingPaymentContextRequest{CustomerId: strconv.FormatInt(customerID, 10), BookingCode: bookingCode, Metadata: metadata(ctx)}
	if bookingID > 0 {
		request.BookingId = strconv.FormatInt(bookingID, 10)
	}
	response, err := c.client.GetBookingPaymentContext(ctx, request)
	if err != nil {
		return payment.BookingPaymentContext{}, err
	}
	result := payment.BookingPaymentContext{BookingCode: response.GetBookingCode(), Status: response.GetStatus(), Currency: response.GetAmountDue().GetCurrency(), AmountMinor: response.GetAmountDue().GetMinorUnits(), PaymentType: response.GetPaymentType(), PaymentChannel: response.GetPaymentChannel()}
	result.BookingID, _ = strconv.ParseInt(response.GetBookingId(), 10, 64)
	result.CustomerID, _ = strconv.ParseInt(response.GetCustomerId(), 10, 64)
	result.ProviderID, _ = strconv.ParseInt(response.GetProviderId(), 10, 64)
	result.BranchID, _ = strconv.ParseInt(response.GetBranchId(), 10, 64)
	return result, nil
}

func (c *Client) ApplyPaymentState(ctx context.Context, eventID string, value payment.Payment) (string, error) {
	response, err := c.client.ApplyPaymentState(ctx, &bookingv1.ApplyPaymentStateRequest{EventId: eventID, BookingId: strconv.FormatInt(value.BookingID, 10), PaymentId: strconv.FormatInt(value.ID, 10), PaymentStatus: value.Status, AmountMinorUnits: value.AmountMinor, Currency: value.Currency, Metadata: metadata(ctx)})
	if err != nil {
		return "", err
	}
	return response.GetBookingStatus(), nil
}

func metadata(ctx context.Context) *commonv1.RequestMetadata {
	requestID, correlationID := correlation.From(ctx)
	value := &commonv1.RequestMetadata{RequestId: requestID, CorrelationId: correlationID}
	if actor, ok := authcontext.ActorFrom(ctx); ok {
		value.ActorId = actor.UserID
		value.ActorRole = actor.Role
		value.ProviderId = actor.ProviderID
		value.BranchId = actor.BranchID
	}
	return value
}
