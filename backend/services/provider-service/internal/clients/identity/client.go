package identityclient

import (
	"context"
	"strconv"

	commonv1 "github.com/nihfery/takein/gen/go/takein/common/v1"
	identityv1 "github.com/nihfery/takein/gen/go/takein/identity/v1"
	"github.com/nihfery/takein/libs/go/authcontext"
	"github.com/nihfery/takein/libs/go/correlation"
	"github.com/nihfery/takein/services/provider-service/internal/provider"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Client struct {
	client identityv1.IdentityServiceClient
}

func New(connection grpc.ClientConnInterface) *Client {
	return &Client{client: identityv1.NewIdentityServiceClient(connection)}
}

func (c *Client) Get(ctx context.Context, userID int64) (provider.Identity, error) {
	response, err := c.client.GetIdentity(ctx, &identityv1.GetIdentityRequest{UserId: strconv.FormatInt(userID, 10), Metadata: metadata(ctx)})
	if err != nil {
		return provider.Identity{}, mapError(err)
	}
	return mapIdentity(response.GetIdentity()), nil
}
func (c *Client) UpdateProfile(ctx context.Context, userID int64, name, email, username string, clearUsername bool) (provider.Identity, error) {
	response, err := c.client.UpdateIdentityProfile(ctx, &identityv1.UpdateIdentityProfileRequest{UserId: strconv.FormatInt(userID, 10), Name: name, Email: email, Username: username, ClearUsername: clearUsername, Metadata: metadata(ctx)})
	if err != nil {
		return provider.Identity{}, mapError(err)
	}
	return mapIdentity(response.GetIdentity()), nil
}
func (c *Client) UpsertBranchAccount(ctx context.Context, input provider.BranchAccountInput) (provider.Identity, error) {
	response, err := c.client.UpsertProviderBranchAccount(ctx, &identityv1.UpsertProviderBranchAccountRequest{
		ProviderId: strconv.FormatInt(input.ProviderID, 10), BranchId: strconv.FormatInt(input.BranchID, 10),
		ProviderRoleId: strconv.FormatInt(input.ProviderRoleID, 10), Name: input.Name, Email: input.Email,
		Password: input.Password, Status: input.Status, Permissions: input.Permissions, Metadata: metadata(ctx),
	})
	if err != nil {
		return provider.Identity{}, mapError(err)
	}
	return mapIdentity(response.GetIdentity()), nil
}
func (c *Client) SetStatus(ctx context.Context, userID int64, accountStatus string) (provider.Identity, error) {
	response, err := c.client.SetAccountStatus(ctx, &identityv1.SetAccountStatusRequest{UserId: strconv.FormatInt(userID, 10), Status: accountStatus, Metadata: metadata(ctx)})
	if err != nil {
		return provider.Identity{}, mapError(err)
	}
	return mapIdentity(response.GetIdentity()), nil
}
func mapIdentity(value *identityv1.Identity) provider.Identity {
	if value == nil {
		return provider.Identity{}
	}
	return provider.Identity{UserID: value.GetUserId(), Name: value.GetName(), Username: value.GetUsername(), Email: value.GetEmail(), Status: value.GetStatus(), Permissions: value.GetPermissions()}
}
func mapError(err error) error {
	switch status.Code(err) {
	case codes.AlreadyExists:
		return provider.ErrConflict
	case codes.InvalidArgument:
		return provider.ErrValidation
	case codes.NotFound:
		return provider.ErrNotFound
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
