package main

import (
	"context"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

const testPassword = "Takein-E2E-Password-2026!"

type session struct {
	userID     int64
	providerID int64
	email      string
	password   string
	token      string
	refresh    string
}

type runner struct {
	ctx         context.Context
	api         apiClient
	fixtures    *fixtures
	suffix      string
	serverKey   string
	admin       session
	customer    session
	provider    session
	other       session
	branchID    int64
	serviceID   int64
	staffID     int64
	bookingID   int64
	bookingCode string
	planID      int64
}

var tinyPNG = []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0, 0, 0, 0}

func main() {
	ctx, cancel := contextWithTimeout(context.Background())
	defer cancel()
	fixtureStore, err := openFixtures(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer fixtureStore.close()
	value := &runner{
		ctx:       ctx,
		api:       apiClient{baseURL: strings.TrimRight(env("E2E_BASE_URL", "http://127.0.0.1:8088"), "/"), http: &http.Client{Timeout: 10 * time.Second}},
		fixtures:  fixtureStore,
		suffix:    strconv.FormatInt(time.Now().UnixNano(), 36),
		serverKey: env("E2E_MIDTRANS_SERVER_KEY", "local_midtrans_server_key"),
	}
	steps := []struct {
		name string
		run  func() error
	}{
		{"register/login and projections", value.identities},
		{"provider readiness and public catalog", value.catalog},
		{"provider branch-account role permissions", value.providerRolePermissions},
		{"provider staff configuration and walk-in operations", value.providerOperations},
		{"booking hold and payment webhook transition", value.bookingPayment},
		{"booking cancellation and reschedule", value.bookingMutations},
		{"review eligibility", value.review},
		{"subscription and trial entitlement", value.billing},
		{"chat authorization and WebSocket", value.chat},
		{"media signed upload", value.media},
		{"logout", value.logout},
	}
	for _, step := range steps {
		log.Printf("e2e: %s", step.name)
		if err = step.run(); err != nil {
			log.Fatalf("e2e FAIL (%s): %v", step.name, err)
		}
	}
	log.Println("e2e: PASS (all critical PRD flows through Traefik/API edge)")
}

func (r *runner) providerRolePermissions() error {
	email := fmt.Sprintf("e2e-branch-account-%s@takein.invalid", r.suffix)
	payload := map[string]any{
		"role_name": "Front Desk " + r.suffix, "branch_id": r.branchID, "description": "E2E permission boundary",
		"status": "active", "menu_keys": []string{"bookings"}, "account_name": "E2E Front Desk",
		"account_email": email, "account_password": testPassword,
	}
	owner := r.api.withToken(r.provider.token)
	response, err := owner.do(r.ctx, http.MethodPost, "/api/provider/roles-permissions", payload, nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusCreated); err != nil {
		return fmt.Errorf("create provider role: %w", err)
	}
	roleID := number(nestedMap(response.body, "data")["id"])
	if roleID <= 0 {
		return errors.New("provider role response did not contain an identifier")
	}
	branchAccount, err := r.login(email, testPassword, "provider")
	if err != nil {
		return fmt.Errorf("branch account login: %w", err)
	}
	branchClient := r.api.withToken(branchAccount.token)
	response, err = branchClient.do(r.ctx, http.MethodGet, "/api/provider/bookings", nil, nil)
	if err != nil || response.status != http.StatusOK {
		return responseFailure("granted bookings permission was rejected", response, err)
	}
	response, err = branchClient.do(r.ctx, http.MethodGet, "/api/provider/payments", nil, nil)
	if err != nil || response.status != http.StatusForbidden {
		return responseFailure("missing payments permission was not rejected", response, err)
	}
	payload["role_name"] = "Front Desk and Cashier " + r.suffix
	payload["menu_keys"] = []string{"bookings", "payments"}
	payload["account_password"] = ""
	response, err = owner.do(r.ctx, http.MethodPut, fmt.Sprintf("/api/provider/roles-permissions/%d", roleID), payload, nil)
	if err != nil || response.status != http.StatusOK {
		return responseFailure("update provider role", response, err)
	}
	branchAccount, err = r.login(email, testPassword, "provider")
	if err != nil {
		return fmt.Errorf("branch account re-login: %w", err)
	}
	response, err = r.api.withToken(branchAccount.token).do(r.ctx, http.MethodGet, "/api/provider/payments", nil, nil)
	if err != nil || response.status != http.StatusOK {
		return responseFailure("updated payments permission was rejected", response, err)
	}
	response, err = owner.do(r.ctx, http.MethodDelete, fmt.Sprintf("/api/provider/roles-permissions/%d", roleID), nil, nil)
	if err != nil || response.status != http.StatusOK {
		return responseFailure("deactivate provider role", response, err)
	}
	response, err = r.api.do(r.ctx, http.MethodPost, "/api/auth/login", map[string]any{"email": email, "password": testPassword, "role": "provider"}, nil)
	if err != nil || response.status != http.StatusForbidden {
		return responseFailure("inactive branch account could still login", response, err)
	}
	return nil
}

func (r *runner) identities() error {
	var err error
	r.customer, err = r.registerCustomer("customer")
	if err != nil {
		return err
	}
	r.admin, err = r.registerCustomer("admin")
	if err != nil {
		return err
	}
	if err = r.fixtures.promoteAdmin(r.ctx, r.admin.userID); err != nil {
		return err
	}
	r.admin, err = r.login(r.admin.email, r.admin.password, "admin")
	if err != nil {
		return err
	}
	r.provider, err = r.registerProvider("provider-a")
	if err != nil {
		return err
	}
	r.other, err = r.registerProvider("provider-b")
	if err != nil {
		return err
	}
	for _, current := range []*session{&r.provider, &r.other} {
		if err = r.waitProviderProfile(current); err != nil {
			return err
		}
		if err = r.attachProviderClaim(current); err != nil {
			return err
		}
	}
	r.planID, err = r.fixtures.trialAndPlan(r.ctx, r.provider.providerID, r.suffix)
	if err != nil {
		return err
	}
	response, err := r.api.withToken(r.customer.token).do(r.ctx, http.MethodGet, "/api/auth/me", nil, nil)
	if err != nil {
		return err
	}
	return response.expect(http.StatusOK)
}

func (r *runner) registerCustomer(label string) (session, error) {
	email := fmt.Sprintf("e2e-%s-%s@takein.invalid", label, r.suffix)
	payload := map[string]any{"name": "E2E " + label, "email": email, "password": testPassword, "password_confirmation": testPassword, "phone_number": "081234567890"}
	response, err := r.api.do(r.ctx, http.MethodPost, "/api/auth/register/customer", payload, nil)
	if err != nil {
		return session{}, err
	}
	if err = response.expect(http.StatusCreated); err != nil {
		return session{}, err
	}
	user := nestedMap(response.body, "user")
	return session{userID: number(user["id"]), email: email, password: testPassword, token: stringValue(response.body["access_token"]), refresh: stringValue(response.body["refresh_token"])}, nil
}

func (r *runner) registerProvider(label string) (session, error) {
	email := fmt.Sprintf("e2e-%s-%s@takein.invalid", label, r.suffix)
	payload := map[string]any{"first_name": "E2E", "last_name": label, "username": label + "-" + r.suffix, "email": email, "country_code": "+62", "phone_number": "81234567890", "password": testPassword, "password_confirmation": testPassword, "service_category": "salon"}
	response, err := r.api.do(r.ctx, http.MethodPost, "/api/auth/register/provider", payload, nil)
	if err != nil {
		return session{}, err
	}
	if err = response.expect(http.StatusCreated); err != nil {
		return session{}, err
	}
	user := nestedMap(response.body, "user")
	return session{userID: number(user["id"]), email: email, password: testPassword, token: stringValue(response.body["access_token"]), refresh: stringValue(response.body["refresh_token"])}, nil
}

func (r *runner) login(email, password, role string) (session, error) {
	response, err := r.api.do(r.ctx, http.MethodPost, "/api/auth/login", map[string]any{"email": email, "password": password, "role": role}, nil)
	if err != nil {
		return session{}, err
	}
	if err = response.expect(http.StatusOK); err != nil {
		return session{}, err
	}
	user := nestedMap(response.body, "user")
	return session{userID: number(user["id"]), providerID: number(user["provider_id"]), email: email, password: password, token: stringValue(response.body["access_token"]), refresh: stringValue(response.body["refresh_token"])}, nil
}

func (r *runner) waitProviderProfile(current *session) error {
	waitCtx, cancel := context.WithTimeout(r.ctx, 35*time.Second)
	defer cancel()
	return waitFor(waitCtx, "provider profile projection", func() (bool, error) {
		response, err := r.api.withToken(current.token).do(waitCtx, http.MethodGet, "/api/provider/profile", nil, nil)
		if err != nil || response.status != http.StatusOK {
			return false, err
		}
		return number(nestedMap(response.body, "data")["id"]) > 0, nil
	})
}

func (r *runner) attachProviderClaim(current *session) error {
	waitCtx, cancel := context.WithTimeout(r.ctx, 35*time.Second)
	defer cancel()
	return waitFor(waitCtx, "identity provider claim", func() (bool, error) {
		logged, err := r.login(current.email, current.password, "provider")
		if err != nil || logged.providerID <= 0 {
			return false, err
		}
		*current = logged
		return true, nil
	})
}

func (r *runner) catalog() error {
	profileResponse, err := r.api.withToken(r.provider.token).do(r.ctx, http.MethodGet, "/api/provider/profile", nil, nil)
	if err != nil {
		return err
	}
	if err = profileResponse.expect(http.StatusOK); err != nil {
		return err
	}
	providerID := number(nestedMap(profileResponse.body, "data")["id"])
	if providerID != r.provider.providerID {
		return fmt.Errorf("provider projection/identity claim mismatch: %d != %d", providerID, r.provider.providerID)
	}
	admin := r.api.withToken(r.admin.token)
	response, err := admin.do(r.ctx, http.MethodPatch, fmt.Sprintf("/api/admin/providers/%d/toggle-status", providerID), map[string]any{}, nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusOK); err != nil {
		return err
	}
	response, err = admin.do(r.ctx, http.MethodPatch, fmt.Sprintf("/api/admin/providers/%d/document-status", providerID), map[string]any{"status": "verified", "note": "E2E verified"}, nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusOK); err != nil {
		return err
	}
	branchFields := map[string][]string{"branch_name": {"E2E Branch " + r.suffix}, "email": {"branch-" + r.suffix + "@takein.invalid"}, "phone_code": {"+62"}, "phone_number": {"81234567890"}, "address": {"E2E Address"}, "country_id": {"ID"}, "state_id": {"JK"}, "city_id": {"JKT"}, "zip_code": {"10000"}, "working_start_hour": {"09:00"}, "working_end_hour": {"18:00"}, "working_days": {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}, "status": {"active"}}
	response, err = r.api.withToken(r.provider.token).doMultipart(r.ctx, http.MethodPost, "/api/provider/branches", branchFields, []multipartFile{{field: "image", name: "branch.png", contentType: "image/png", content: tinyPNG}})
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusCreated); err != nil {
		return err
	}
	r.branchID = number(nestedMap(response.body, "data")["id"])
	response, err = r.api.withToken(r.other.token).do(r.ctx, http.MethodGet, fmt.Sprintf("/api/provider/branches/%d", r.branchID), nil, nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusForbidden); err != nil {
		return fmt.Errorf("cross-provider branch authorization: %w", err)
	}
	servicePayload := map[string]any{"title": "E2E Haircut " + r.suffix, "category": "Hair", "price": 150000, "estimated_duration": 30, "maximum_duration": 30, "is_queue_enabled": true, "is_scheduled_enabled": true, "branch_ids": []int64{r.branchID}, "status": "active"}
	response, err = r.api.withToken(r.provider.token).do(r.ctx, http.MethodPost, "/api/provider/services", servicePayload, nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusCreated); err != nil {
		return err
	}
	r.serviceID = number(nestedMap(response.body, "data")["id"])
	staffFields := map[string][]string{"branch_id": {strconv.FormatInt(r.branchID, 10)}, "category_id": {"1"}, "first_name": {"E2E"}, "last_name": {"Stylist"}, "email": {"staff-" + r.suffix + "@takein.invalid"}, "status": {"active"}}
	response, err = r.api.withToken(r.provider.token).doMultipart(r.ctx, http.MethodPost, "/api/provider/staff", staffFields, nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusCreated); err != nil {
		return err
	}
	r.staffID = number(nestedMap(response.body, "data")["id"])
	if r.staffID <= 0 {
		return errors.New("provider staff fixture did not return an identifier")
	}
	providerClient := r.api.withToken(r.provider.token)
	response, err = providerClient.do(r.ctx, http.MethodPut, fmt.Sprintf("/api/provider/staff/%d/skills", r.staffID), map[string]any{"service_ids": []int64{r.serviceID}}, nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusOK); err != nil {
		return fmt.Errorf("configure staff skills: %w", err)
	}
	schedules := []map[string]any{}
	for _, day := range []string{"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"} {
		schedules = append(schedules, map[string]any{"day_of_week": day, "start_time": "09:00", "end_time": "18:00", "is_available": true})
	}
	response, err = providerClient.do(r.ctx, http.MethodPut, fmt.Sprintf("/api/provider/staff/%d/schedules", r.staffID), map[string]any{"schedules": schedules}, nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusOK); err != nil {
		return fmt.Errorf("configure staff schedules: %w", err)
	}
	waitCtx, cancel := context.WithTimeout(r.ctx, 35*time.Second)
	defer cancel()
	return waitFor(waitCtx, "public provider/branch/service readiness", func() (bool, error) {
		providers, e := r.api.do(waitCtx, http.MethodGet, "/api/providers", nil, nil)
		if e != nil || providers.status != http.StatusOK || !containsID(providers.body["data"], "provider_id", providerID) {
			return false, e
		}
		branch, e := r.api.do(waitCtx, http.MethodGet, fmt.Sprintf("/api/branches/%d", r.branchID), nil, nil)
		if e != nil || branch.status != http.StatusOK {
			return false, e
		}
		service, e := r.api.do(waitCtx, http.MethodGet, fmt.Sprintf("/api/services/%d", r.serviceID), nil, nil)
		return e == nil && service.status == http.StatusOK, e
	})
}

func (r *runner) providerOperations() error {
	providerClient := r.api.withToken(r.provider.token)
	date := time.Now().In(mustLocation()).AddDate(0, 0, 7).Format("2006-01-02")
	payload := map[string]any{
		"customer_name": "Offline Customer", "customer_phone": "081200001234", "branch_id": r.branchID,
		"service_ids": []int64{r.serviceID}, "booking_date": date, "start_time": "13:00", "staff_id": r.staffID,
		"notes": "E2E provider walk-in", "payment_type": "pay_at_salon",
	}
	response, err := providerClient.do(r.ctx, http.MethodPost, "/api/provider/bookings/walk-in", payload, map[string]string{"Idempotency-Key": "walk-in-" + r.suffix})
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusCreated); err != nil {
		return err
	}
	created := nestedMap(response.body, "data")
	bookingID := number(created["id"])
	if bookingID <= 0 || stringValue(created["booking_type"]) != "walk_in" || stringValue(created["booking_date"]) != date {
		return fmt.Errorf("invalid provider walk-in response: %#v", created)
	}
	response, err = providerClient.do(r.ctx, http.MethodGet, "/api/provider/bookings/calendar?from="+date+"&to="+date, nil, nil)
	if err != nil || response.status != http.StatusOK || !containsID(response.body["data"], "id", bookingID) {
		return responseFailure("provider calendar did not contain walk-in booking", response, err)
	}
	response, err = providerClient.do(r.ctx, http.MethodGet, "/api/provider/bookings?date="+date, nil, nil)
	if err != nil || response.status != http.StatusOK || !containsID(response.body["data"], "id", bookingID) {
		return responseFailure("provider booking list did not contain walk-in booking", response, err)
	}
	for _, action := range []struct {
		name, status string
	}{{"check-in", "checked_in"}, {"start", "in_progress"}, {"complete", "completed"}} {
		response, err = providerClient.do(r.ctx, http.MethodPost, fmt.Sprintf("/api/provider/bookings/%d/%s", bookingID, action.name), map[string]any{}, nil)
		if err != nil {
			return err
		}
		if err = response.expect(http.StatusOK); err != nil || stringValue(nestedMap(response.body, "data")["status"]) != action.status {
			return fmt.Errorf("provider booking %s failed: %w", action.name, err)
		}
		if action.name == "check-in" {
			response, err = providerClient.do(r.ctx, http.MethodGet, "/api/provider/bookings/queue?date="+date, nil, nil)
			if err != nil || response.status != http.StatusOK || !containsID(response.body["data"], "id", bookingID) {
				return responseFailure("provider queue did not contain checked-in walk-in", response, err)
			}
		}
	}
	waitCtx, cancel := context.WithTimeout(r.ctx, 35*time.Second)
	defer cancel()
	if err = waitFor(waitCtx, "pay-at-salon projection and staff release", func() (bool, error) {
		payments, requestErr := providerClient.do(waitCtx, http.MethodGet, "/api/provider/payments?payment_type=pay_at_salon&status=paid", nil, nil)
		if requestErr != nil || payments.status != http.StatusOK || !containsID(payments.body["data"], "booking_id", bookingID) {
			return false, requestErr
		}
		staff, requestErr := providerClient.do(waitCtx, http.MethodGet, fmt.Sprintf("/api/provider/staff/%d", r.staffID), nil, nil)
		return requestErr == nil && staff.status == http.StatusOK && stringValue(nestedMap(staff.body, "data")["current_status"]) == "available", requestErr
	}); err != nil {
		return err
	}
	otherPayments, err := r.api.withToken(r.other.token).do(r.ctx, http.MethodGet, fmt.Sprintf("/api/provider/payments?branch_id=%d", r.branchID), nil, nil)
	if err != nil || otherPayments.status != http.StatusOK || containsID(otherPayments.body["data"], "booking_id", bookingID) {
		return errors.New("cross-provider payment isolation failed")
	}
	return nil
}

func (r *runner) createBooking(label string, dayOffset int) (map[string]any, error) {
	date := time.Now().In(mustLocation()).AddDate(0, 0, dayOffset).Format("2006-01-02")
	payload := map[string]any{"branch_id": r.branchID, "service_ids": []int64{r.serviceID}, "booking_type": "scheduled", "booking_date": date, "start_time": "10:00", "payment_type": "full_payment", "payment_channel": "qris", "hold_only": true, "participant_count": 1}
	response, err := r.api.withToken(r.customer.token).do(r.ctx, http.MethodPost, "/api/customer/bookings", payload, map[string]string{"Idempotency-Key": "e2e-" + label + "-" + r.suffix})
	if err != nil {
		return nil, err
	}
	if err = response.expect(http.StatusCreated); err != nil {
		return nil, err
	}
	return nestedMap(response.body, "data"), nil
}

func (r *runner) bookingPayment() error {
	booking, err := r.createBooking("payment", 2)
	if err != nil {
		return err
	}
	r.bookingID, r.bookingCode = number(booking["id"]), stringValue(booking["booking_code"])
	response, err := r.api.withToken(r.customer.token).do(r.ctx, http.MethodPost, fmt.Sprintf("/api/customer/bookings/%d/finalize", r.bookingID), map[string]any{"payment_type": "full_payment", "payment_channel": "qris"}, nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusOK); err != nil {
		return err
	}
	response, err = r.api.withToken(r.customer.token).do(r.ctx, http.MethodPost, fmt.Sprintf("/api/customer/bookings/%d/payment/charge", r.bookingID), map[string]any{"payment_channel": "qris"}, map[string]string{"Idempotency-Key": "pay-" + r.suffix})
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusOK); err != nil {
		return err
	}
	charge := nestedMap(response.body, "data")
	orderID := stringValue(charge["order_id"])
	payment := nestedMap(charge, "payment")
	gross := fmt.Sprintf("%.2f", float64(number(payment["amount_minor"]))/100)
	notification := r.notification(orderID, gross, "settlement")
	response, err = r.api.do(r.ctx, http.MethodPost, "/api/midtrans/notification", notification, nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusOK); err != nil {
		return err
	}
	response, err = r.api.do(r.ctx, http.MethodPost, "/api/midtrans/notification", notification, nil)
	if err != nil || response.status != http.StatusOK || response.body["replay"] != true {
		return errors.New("payment webhook replay was not handled idempotently")
	}
	waitCtx, cancel := context.WithTimeout(r.ctx, 35*time.Second)
	defer cancel()
	return waitFor(waitCtx, "payment paid -> booking confirmed", func() (bool, error) {
		statusResponse, e := r.api.withToken(r.customer.token).do(waitCtx, http.MethodGet, fmt.Sprintf("/api/customer/bookings/%d/payment/status", r.bookingID), nil, nil)
		if e != nil || statusResponse.status != http.StatusOK || stringValue(nestedMap(statusResponse.body, "data")["status"]) != "paid" {
			return false, e
		}
		bookingResponse, e := r.api.withToken(r.customer.token).do(waitCtx, http.MethodGet, fmt.Sprintf("/api/customer/bookings/%d", r.bookingID), nil, nil)
		return e == nil && bookingResponse.status == http.StatusOK && stringValue(nestedMap(bookingResponse.body, "data")["status"]) == "confirmed", e
	})
}

func (r *runner) bookingMutations() error {
	cancelled, err := r.createBooking("cancel", 3)
	if err != nil {
		return err
	}
	cancelID := number(cancelled["id"])
	response, err := r.api.withToken(r.customer.token).do(r.ctx, http.MethodPatch, fmt.Sprintf("/api/customer/bookings/%d/cancel", cancelID), map[string]any{}, nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusOK); err != nil || stringValue(nestedMap(response.body, "data")["status"]) != "customer_cancelled" {
		return fmt.Errorf("booking cancellation failed: %w", err)
	}
	rescheduled, err := r.createBooking("reschedule", 4)
	if err != nil {
		return err
	}
	rescheduleID := number(rescheduled["id"])
	date := time.Now().In(mustLocation()).AddDate(0, 0, 5).Format("2006-01-02")
	response, err = r.api.withToken(r.customer.token).do(r.ctx, http.MethodPatch, fmt.Sprintf("/api/customer/bookings/%d/reschedule", rescheduleID), map[string]any{"booking_date": date, "start_time": "11:00"}, nil)
	if err != nil {
		return err
	}
	return response.expect(http.StatusOK)
}

func (r *runner) review() error {
	admin := r.api.withToken(r.admin.token)
	for _, status := range []string{"waiting", "checked_in", "in_progress", "completed"} {
		response, err := admin.do(r.ctx, http.MethodPatch, fmt.Sprintf("/api/admin/bookings/%d/status", r.bookingID), map[string]any{"status": status}, nil)
		if err != nil {
			return err
		}
		if err = response.expect(http.StatusOK); err != nil {
			return fmt.Errorf("admin transition to %s: %w", status, err)
		}
	}
	response, err := r.api.withToken(r.customer.token).doMultipart(r.ctx, http.MethodPost, "/api/customer/bookings/code/"+r.bookingCode+"/review", map[string][]string{"rating": {"5"}, "comment": {"E2E verified review"}}, []multipartFile{{field: "images", name: "result.png", contentType: "image/png", content: tinyPNG}})
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusCreated); err != nil {
		return err
	}
	provider := r.api.withToken(r.provider.token)
	waitCtx, cancel := context.WithTimeout(r.ctx, 35*time.Second)
	defer cancel()
	return waitFor(waitCtx, "provider customer and review projections", func() (bool, error) {
		customers, requestErr := provider.do(waitCtx, http.MethodGet, "/api/provider/customers?search="+url.QueryEscape(r.customer.email), nil, nil)
		if requestErr != nil || customers.status != http.StatusOK {
			return false, requestErr
		}
		customerItems := nestedMap(customers.body, "data")["customers"]
		if !containsID(customerItems, "user_id", r.customer.userID) {
			return false, nil
		}
		reviews, requestErr := provider.do(waitCtx, http.MethodGet, "/api/provider/reviews?rating=5", nil, nil)
		if requestErr != nil || reviews.status != http.StatusOK {
			return false, requestErr
		}
		return containsID(nestedMap(reviews.body, "data")["branch_reviews"], "booking_id", r.bookingID), nil
	})
}

func (r *runner) billing() error {
	provider := r.api.withToken(r.provider.token)
	response, err := provider.do(r.ctx, http.MethodGet, "/api/provider/subscriptions", nil, nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusOK); err != nil || stringValue(nestedMap(response.body, "data", "entitlement")["source"]) != "trial" {
		return errors.New("trial entitlement was not active")
	}
	response, err = provider.do(r.ctx, http.MethodPost, fmt.Sprintf("/api/provider/subscriptions/plans/%d/purchase", r.planID), map[string]any{}, nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusOK); err != nil {
		return err
	}
	data := nestedMap(response.body, "data")
	charge := nestedMap(data, "payment")
	subscription := nestedMap(data, "subscription")
	orderID := stringValue(charge["OrderID"])
	if orderID == "" {
		orderID = stringValue(subscription["midtrans_order_id"])
	}
	gross := fmt.Sprintf("%.2f", float64(number(subscription["price_minor"]))/100)
	response, err = r.api.do(r.ctx, http.MethodPost, "/api/midtrans/notification", r.notification(orderID, gross, "settlement"), nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusOK); err != nil {
		return err
	}
	waitCtx, cancel := context.WithTimeout(r.ctx, 35*time.Second)
	defer cancel()
	return waitFor(waitCtx, "subscription activation", func() (bool, error) {
		current, e := provider.do(waitCtx, http.MethodGet, "/api/provider/subscriptions", nil, nil)
		if e != nil || current.status != http.StatusOK {
			return false, e
		}
		entitlement := nestedMap(current.body, "data", "entitlement")
		return stringValue(entitlement["source"]) == "subscription" && entitlement["active"] == true, nil
	})
}

func (r *runner) notification(orderID, gross, status string) map[string]any {
	statusCode := "200"
	sum := sha512.Sum512([]byte(orderID + statusCode + gross + r.serverKey))
	return map[string]any{"order_id": orderID, "status_code": statusCode, "gross_amount": gross, "signature_key": hex.EncodeToString(sum[:]), "transaction_id": "e2e-" + r.suffix, "transaction_status": status, "fraud_status": "accept", "payment_type": "qris"}
}

func (r *runner) chat() error {
	threadID, err := r.fixtures.chatThread(r.ctx, r.provider.providerID, r.provider.userID, r.customer.userID)
	if err != nil {
		return err
	}
	path := fmt.Sprintf("/api/chat/threads/%d", threadID)
	response, err := r.api.withToken(r.other.token).do(r.ctx, http.MethodGet, path, nil, nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusForbidden); err != nil {
		return fmt.Errorf("cross-provider chat authorization: %w", err)
	}
	response, err = r.api.withToken(r.customer.token).do(r.ctx, http.MethodPost, path+"/messages", map[string]any{"body": "E2E realtime message"}, nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusCreated); err != nil {
		return err
	}
	wsBase := strings.Replace(r.api.baseURL, "http://", "ws://", 1)
	wsBase = strings.Replace(wsBase, "https://", "wss://", 1)
	connection, websocketResponse, err := websocket.Dial(r.ctx, wsBase+path+"/realtime", &websocket.DialOptions{Subprotocols: []string{"takein.v1", "takein.bearer." + r.customer.token}})
	if websocketResponse != nil && websocketResponse.Body != nil {
		_ = websocketResponse.Body.Close()
	}
	if err != nil {
		if websocketResponse != nil {
			return fmt.Errorf("websocket HTTP %d: %w", websocketResponse.StatusCode, err)
		}
		return err
	}
	defer func() { _ = connection.Close(websocket.StatusNormalClosure, "E2E complete") }()
	readCtx, cancel := context.WithTimeout(r.ctx, 5*time.Second)
	defer cancel()
	message := map[string]any{}
	if err = wsjson.Read(readCtx, connection, &message); err != nil {
		return err
	}
	if stringValue(message["type"]) != "chat.message" {
		return fmt.Errorf("unexpected WebSocket payload: %#v", message)
	}
	return nil
}

func (r *runner) media() error {
	client := r.api.withToken(r.customer.token)
	response, err := client.do(r.ctx, http.MethodPost, "/api/media/presign-upload", map[string]any{"purpose": "review", "file_name": "e2e.jpg", "content_type": "image/jpeg", "visibility": "private"}, nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusCreated); err != nil {
		return err
	}
	data := nestedMap(response.body, "data")
	object := nestedMap(data, "object")
	objectID := stringValue(object["id"])
	uploadURL := stringValue(data["upload_url"])
	if objectID == "" || !strings.Contains(uploadURL, "X-Amz-Signature=") {
		return errors.New("signed upload URL is incomplete")
	}
	content := []byte("takein-e2e")
	target, err := url.Parse(uploadURL)
	if err != nil {
		return err
	}
	target.Scheme = "http"
	target.Host = "127.0.0.1:" + env("TAKEIN_OBJECT_STORAGE_PORT", "19000")
	if err = client.putURL(r.ctx, target.String(), "image/jpeg", content); err != nil {
		return err
	}
	checksum := sha256.Sum256(content)
	response, err = client.do(r.ctx, http.MethodPost, "/api/media/"+objectID+"/complete", map[string]any{"size_bytes": 10, "checksum_sha256": hex.EncodeToString(checksum[:])}, nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusOK); err != nil {
		return err
	}
	response, err = client.do(r.ctx, http.MethodGet, "/api/media/"+objectID+"/download", nil, nil)
	if err != nil {
		return err
	}
	if err = response.expect(http.StatusOK); err != nil {
		return err
	}
	if !strings.Contains(stringValue(nestedMap(response.body, "data")["download_url"]), "X-Amz-Signature=") {
		return errors.New("signed download URL is incomplete")
	}
	return nil
}

func (r *runner) logout() error {
	response, err := r.api.withToken(r.customer.token).do(r.ctx, http.MethodPost, "/api/auth/logout", map[string]any{"refresh_token": r.customer.refresh}, nil)
	if err != nil {
		return err
	}
	return response.expect(http.StatusOK)
}

func mustLocation() *time.Location {
	location, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		panic(err)
	}
	return location
}

func init() {
	log.SetFlags(log.Ltime | log.Lmicroseconds)
	if strings.TrimSpace(os.Getenv("E2E_BASE_URL")) == "" {
		_ = os.Setenv("E2E_BASE_URL", "http://127.0.0.1:8088")
	}
}
