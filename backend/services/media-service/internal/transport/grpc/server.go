package grpctransport

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	mediav1 "github.com/nihfery/takein/gen/go/takein/media/v1"
	"github.com/nihfery/takein/services/media-service/internal/media"
	"github.com/nihfery/takein/services/media-service/internal/storage"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Server struct {
	mediav1.UnimplementedMediaServiceServer
	repository *media.Repository
	signer     *storage.Signer
	bucket     string
}

func New(repository *media.Repository, signer *storage.Signer, bucket string) *Server {
	return &Server{repository: repository, signer: signer, bucket: bucket}
}

var validPurpose = regexp.MustCompile(`^[a-z0-9_-]{1,64}$`)

func (s *Server) StoreObject(ctx context.Context, request *mediav1.StoreObjectRequest) (*mediav1.StoreObjectResponse, error) {
	metadata := request.GetMetadata()
	if metadata == nil || metadata.GetActorId() == "" || metadata.GetActorRole() == "" {
		return nil, status.Error(codes.PermissionDenied, "actor metadata is required")
	}
	if !validPurpose.MatchString(request.GetPurpose()) || request.GetFileName() == "" || len(request.GetFileName()) > 255 || len(request.GetContent()) == 0 || len(request.GetContent()) > 5<<20 {
		return nil, status.Error(codes.InvalidArgument, "media upload is invalid")
	}
	visibility := request.GetVisibility()
	if visibility == "" {
		visibility = "private"
	}
	if visibility != "private" && visibility != "public" {
		return nil, status.Error(codes.InvalidArgument, "media visibility is invalid")
	}
	extension := strings.ToLower(filepath.Ext(filepath.Base(request.GetFileName())))
	if len(extension) > 10 {
		extension = ""
	}
	id := uuid.New()
	key := metadata.GetActorRole() + "/" + metadata.GetActorId() + "/" + request.GetPurpose() + "/" + id.String() + extension
	value, err := s.repository.Create(ctx, metadata.GetActorRole(), metadata.GetActorId(), request.GetPurpose(), s.bucket, key, request.GetContentType(), visibility)
	if err != nil {
		return nil, status.Error(codes.Internal, "create media object failed")
	}
	if err = s.signer.Put(ctx, value.Bucket, value.ObjectKey, request.GetContentType(), request.GetContent()); err != nil {
		_ = s.repository.Delete(ctx, value.ID)
		return nil, status.Error(codes.Unavailable, "store media object failed")
	}
	checksum := sha256.Sum256(request.GetContent())
	if _, err = s.repository.Complete(ctx, value.ID, int64(len(request.GetContent())), hex.EncodeToString(checksum[:])); err != nil {
		return nil, status.Error(codes.Internal, "complete media object failed")
	}
	return &mediav1.StoreObjectResponse{ObjectId: value.ID.String()}, nil
}

func (s *Server) AuthorizeObject(ctx context.Context, request *mediav1.AuthorizeObjectRequest) (*mediav1.AuthorizeObjectResponse, error) {
	id, err := uuid.Parse(request.GetObjectId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "object_id must be a UUID")
	}
	value, err := s.repository.ByID(ctx, id)
	if err != nil {
		if errors.Is(err, media.ErrNotFound) {
			return nil, status.Error(codes.NotFound, "media object not found")
		}
		return nil, status.Error(codes.Internal, "media lookup failed")
	}
	metadata := request.GetMetadata()
	if metadata == nil || !media.Authorized(metadata.GetActorRole(), metadata.GetActorId(), value) {
		return &mediav1.AuthorizeObjectResponse{Allowed: false}, nil
	}
	response := &mediav1.AuthorizeObjectResponse{Allowed: true}
	if request.GetAction() == "download" {
		if value.Status != "ready" {
			return &mediav1.AuthorizeObjectResponse{Allowed: false}, nil
		}
		expiresAt := time.Now().UTC().Add(5 * time.Minute)
		response.SignedUrl, err = s.signer.Presign(http.MethodGet, value.Bucket, value.ObjectKey, 5*time.Minute)
		if err != nil {
			return nil, status.Error(codes.Internal, "sign media download failed")
		}
		response.ExpiresAt = expiresAt.Format(time.RFC3339Nano)
	} else if request.GetAction() != "reference" {
		return nil, status.Error(codes.InvalidArgument, "unsupported media action")
	}
	return response, nil
}
