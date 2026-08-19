package httptransport

import (
	stdctx "context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/nihfery/takein/libs/go/authcontext"
)

func contextWithActor(actor authcontext.Actor) (*gin.Context, *httptest.ResponseRecorder) {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	request := httptest.NewRequestWithContext(stdctx.Background(), http.MethodGet, "/api/provider/services", nil)
	context.Request = request.WithContext(authcontext.WithActor(request.Context(), actor))
	return context, recorder
}

func TestProviderScopeForHeadOffice(t *testing.T) {
	context, _ := contextWithActor(authcontext.Actor{Role: "provider", ProviderID: "103"})
	providerID, branchID, ok := providerScope(context, "services")
	if !ok || providerID != 103 || branchID != nil {
		t.Fatalf("unexpected head-office scope: provider=%d branch=%v ok=%v", providerID, branchID, ok)
	}
}

func TestProviderScopeForPermittedBranch(t *testing.T) {
	context, _ := contextWithActor(authcontext.Actor{
		Role: "provider", ProviderID: "103", BranchID: "84", Permissions: []string{"bookings", "services"},
	})
	providerID, branchID, ok := providerScope(context, "services")
	if !ok || providerID != 103 || branchID == nil || *branchID != 84 {
		t.Fatalf("unexpected branch scope: provider=%d branch=%v ok=%v", providerID, branchID, ok)
	}
}

func TestProviderScopeRejectsBranchWithoutPermission(t *testing.T) {
	context, recorder := contextWithActor(authcontext.Actor{
		Role: "provider", ProviderID: "103", BranchID: "84", Permissions: []string{"bookings"},
	})
	_, _, ok := providerScope(context, "services")
	if ok || recorder.Code != http.StatusForbidden {
		t.Fatalf("expected forbidden branch scope, got status=%d ok=%v", recorder.Code, ok)
	}
}
