package catalogclient

import (
	"context"
	"errors"
	"strconv"

	catalogv1 "github.com/nihfery/takein/gen/go/takein/catalog/v1"
	commonv1 "github.com/nihfery/takein/gen/go/takein/common/v1"
	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/correlation"
	"google.golang.org/grpc"
)

type Client struct {
	client catalogv1.CatalogServiceClient
}

func New(connection grpc.ClientConnInterface) *Client {
	return &Client{client: catalogv1.NewCatalogServiceClient(connection)}
}

func (c *Client) ValidateServices(ctx context.Context, providerID, branchID int64, serviceIDs []int64) error {
	rawIDs := make([]string, 0, len(serviceIDs))
	for _, serviceID := range serviceIDs {
		rawIDs = append(rawIDs, strconv.FormatInt(serviceID, 10))
	}
	requestID, correlationID := correlation.From(ctx)
	metadata := &commonv1.RequestMetadata{RequestId: requestID, CorrelationId: correlationID}
	if actor, ok := authcontext.ActorFrom(ctx); ok {
		metadata.ActorId = actor.UserID
		metadata.ActorRole = actor.Role
		metadata.ProviderId = actor.ProviderID
		metadata.BranchId = actor.BranchID
		metadata.Permissions = actor.Permissions
	}
	response, err := c.client.GetServicesSnapshot(ctx, &catalogv1.GetServicesSnapshotRequest{
		ProviderId: strconv.FormatInt(providerID, 10),
		BranchId:   strconv.FormatInt(branchID, 10),
		ServiceIds: rawIDs,
		Metadata:   metadata,
	})
	if err != nil {
		return err
	}
	if len(response.GetServices()) != len(rawIDs) {
		return errors.New("one or more catalog services are unavailable or outside scope")
	}
	return nil
}
