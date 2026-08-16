package mediaclient

import (
	"context"

	commonv1 "github.com/nihfery/takein/gen/go/takein/common/v1"
	mediav1 "github.com/nihfery/takein/gen/go/takein/media/v1"
	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/correlation"
	"github.com/nihfery/takein/services/catalog-service/internal/catalog"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Client struct{ client mediav1.MediaServiceClient }

func New(connection grpc.ClientConnInterface) *Client {
	return &Client{client: mediav1.NewMediaServiceClient(connection)}
}
func (c *Client) Store(ctx context.Context, purpose, fileName, contentType string, content []byte, visibility string) (string, error) {
	response, err := c.client.StoreObject(ctx, &mediav1.StoreObjectRequest{Purpose: purpose, FileName: fileName, ContentType: contentType, Content: content, Visibility: visibility, Metadata: metadata(ctx)})
	if err != nil {
		return "", mapError(err)
	}
	return response.GetObjectId(), nil
}
func (c *Client) Reference(ctx context.Context, objectID string) error {
	response, err := c.client.AuthorizeObject(ctx, &mediav1.AuthorizeObjectRequest{ObjectId: objectID, Action: "reference", Metadata: metadata(ctx)})
	if err != nil {
		return mapError(err)
	}
	if !response.GetAllowed() {
		return catalog.ErrForbidden
	}
	return nil
}
func mapError(err error) error {
	switch status.Code(err) {
	case codes.InvalidArgument:
		return catalog.ErrConflict
	case codes.NotFound:
		return catalog.ErrNotFound
	case codes.PermissionDenied:
		return catalog.ErrForbidden
	default:
		return err
	}
}
func metadata(ctx context.Context) *commonv1.RequestMetadata {
	requestID, correlationID := correlation.From(ctx)
	value := &commonv1.RequestMetadata{RequestId: requestID, CorrelationId: correlationID}
	if actor, ok := authcontext.ActorFrom(ctx); ok {
		value.ActorId, value.ActorRole, value.ProviderId, value.BranchId, value.Permissions = actor.UserID, actor.Role, actor.ProviderID, actor.BranchID, actor.Permissions
	}
	return value
}
