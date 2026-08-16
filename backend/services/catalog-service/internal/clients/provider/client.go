package providerclient

import (
	"context"
	"strconv"

	commonv1 "github.com/nihfery/takein/gen/go/takein/common/v1"
	providerv1 "github.com/nihfery/takein/gen/go/takein/provider/v1"
	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/correlation"
	"github.com/nihfery/takein/services/catalog-service/internal/catalog"
	"google.golang.org/grpc"
)

type Client struct {
	client providerv1.ProviderServiceClient
}

func New(connection grpc.ClientConnInterface) *Client {
	return &Client{client: providerv1.NewProviderServiceClient(connection)}
}

func (c *Client) ValidateBranches(ctx context.Context, providerID int64, branchIDs []int64) error {
	requestID, correlationID := correlation.From(ctx)
	actor, _ := authcontext.ActorFrom(ctx)
	metadata := &commonv1.RequestMetadata{RequestId: requestID, CorrelationId: correlationID, ActorId: actor.UserID, ActorRole: actor.Role, ProviderId: actor.ProviderID, BranchId: actor.BranchID, Permissions: actor.Permissions}
	for _, branchID := range branchIDs {
		response, err := c.client.ValidateBranchScope(ctx, &providerv1.ValidateBranchScopeRequest{ActorId: actor.UserID, ProviderId: strconv.FormatInt(providerID, 10), BranchId: strconv.FormatInt(branchID, 10), Permission: "services.manage", Metadata: metadata})
		if err != nil {
			return err
		}
		if !response.GetAllowed() {
			return catalog.ErrForbidden
		}
	}
	return nil
}
