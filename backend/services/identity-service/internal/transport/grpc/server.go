package grpctransport

import (
	"context"
	"errors"
	"strconv"

	identityv1 "github.com/nihfery/takein/gen/go/takein/identity/v1"
	"github.com/nihfery/takein/libs/go/jwtauth"
	"github.com/nihfery/takein/services/identity-service/internal/identity"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Server struct {
	identityv1.UnimplementedIdentityServiceServer
	service   *identity.Service
	validator *jwtauth.Validator
}

func New(service *identity.Service, validator *jwtauth.Validator) *Server {
	return &Server{service: service, validator: validator}
}

func (s *Server) ValidateAccessToken(ctx context.Context, request *identityv1.ValidateAccessTokenRequest) (*identityv1.ValidateAccessTokenResponse, error) {
	claims, err := s.validator.Validate(request.GetAccessToken())
	if err != nil {
		return invalidAccessToken()
	}
	user, err := s.service.Get(ctx, claims.Subject)
	if err != nil || user.Status != "active" {
		return invalidAccessToken()
	}
	return &identityv1.ValidateAccessTokenResponse{Valid: true, Identity: mapIdentity(user)}, nil
}

func invalidAccessToken() (*identityv1.ValidateAccessTokenResponse, error) {
	// An invalid or inactive credential is a normal validation result, not a
	// transport failure for callers that use this RPC as an auth decision.
	return &identityv1.ValidateAccessTokenResponse{Valid: false}, nil
}

func (s *Server) GetIdentity(ctx context.Context, request *identityv1.GetIdentityRequest) (*identityv1.GetIdentityResponse, error) {
	user, err := s.service.Get(ctx, request.GetUserId())
	if err != nil {
		return nil, mapError(err)
	}
	return &identityv1.GetIdentityResponse{Identity: mapIdentity(user)}, nil
}

func (s *Server) UpdateIdentityProfile(ctx context.Context, request *identityv1.UpdateIdentityProfileRequest) (*identityv1.UpdateIdentityProfileResponse, error) {
	user, err := s.service.UpdateProfile(ctx, request.GetUserId(), identity.ProfileUpdate{Name: request.GetName(), Email: request.GetEmail(), Username: request.GetUsername(), ClearUsername: request.GetClearUsername()})
	if err != nil {
		if errors.Is(err, identity.ErrConflict) {
			return nil, status.Error(codes.AlreadyExists, "email or username is already used")
		}
		return nil, mapError(err)
	}
	return &identityv1.UpdateIdentityProfileResponse{Identity: mapIdentity(user)}, nil
}

func (s *Server) SetAccountStatus(ctx context.Context, request *identityv1.SetAccountStatusRequest) (*identityv1.SetAccountStatusResponse, error) {
	user, err := s.service.SetStatus(ctx, request.GetUserId(), request.GetStatus())
	if err != nil {
		return nil, mapError(err)
	}
	return &identityv1.SetAccountStatusResponse{Identity: mapIdentity(user)}, nil
}

func (s *Server) UpsertProviderBranchAccount(ctx context.Context, request *identityv1.UpsertProviderBranchAccountRequest) (*identityv1.UpsertProviderBranchAccountResponse, error) {
	providerID, providerErr := strconv.ParseInt(request.GetProviderId(), 10, 64)
	branchID, branchErr := strconv.ParseInt(request.GetBranchId(), 10, 64)
	roleID, roleErr := strconv.ParseInt(request.GetProviderRoleId(), 10, 64)
	if providerErr != nil || branchErr != nil || roleErr != nil {
		return nil, status.Error(codes.InvalidArgument, "provider branch account scope is invalid")
	}
	user, err := s.service.UpsertProviderBranchAccount(ctx, identity.ProviderBranchAccountInput{
		ProviderID: providerID, BranchID: branchID, ProviderRoleID: roleID,
		Name: request.GetName(), Email: request.GetEmail(), Password: request.GetPassword(),
		Status: request.GetStatus(), Permissions: request.GetPermissions(),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return &identityv1.UpsertProviderBranchAccountResponse{Identity: mapIdentity(user)}, nil
}

func mapIdentity(user identity.User) *identityv1.Identity {
	value := &identityv1.Identity{UserId: strconv.FormatInt(user.ID, 10), Name: user.Name, Email: user.Email, Role: user.Role, Status: user.Status, Permissions: user.Permissions}
	if user.Username != nil {
		value.Username = *user.Username
	}
	if user.ProviderID != nil {
		value.ProviderId = strconv.FormatInt(*user.ProviderID, 10)
	}
	if user.BranchID != nil {
		value.BranchId = strconv.FormatInt(*user.BranchID, 10)
	}
	return value
}

func mapError(err error) error {
	if errors.Is(err, identity.ErrValidation) {
		return status.Error(codes.InvalidArgument, "identity profile is invalid")
	}
	if errors.Is(err, identity.ErrConflict) {
		return status.Error(codes.AlreadyExists, "identity already exists")
	}
	if errors.Is(err, identity.ErrNotFound) {
		return status.Error(codes.NotFound, "identity not found")
	}
	return status.Error(codes.Internal, "identity operation failed")
}
