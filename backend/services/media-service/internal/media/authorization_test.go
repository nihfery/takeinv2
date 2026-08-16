package media

import "testing"

func TestPrivateObjectOwnership(t *testing.T) {
	value := Object{OwnerID: "7", Visibility: "private"}
	if !Authorized("customer", "7", value) || Authorized("customer", "8", value) || !Authorized("admin", "99", value) {
		t.Fatal("media authorization failed")
	}
}
