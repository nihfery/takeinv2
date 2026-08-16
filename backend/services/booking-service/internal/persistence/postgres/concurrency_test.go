package postgres

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nihfery/takein/services/booking-service/internal/booking"
)

func testRepository(t *testing.T) (*Repository, *pgxpool.Pool) {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is required for PostgreSQL concurrency tests")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := pool.Ping(context.Background()); err != nil {
		pool.Close()
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return New(pool), pool
}

func uniqueBase() int64 { return time.Now().UnixNano() % 1_000_000_000 }

func createInput(customer, staff, seed int64, starts time.Time, idem string) booking.CreateInput {
	ends := starts.Add(30 * time.Minute)
	branch := seed + 200
	return booking.CreateInput{ProviderID: seed + 100, CustomerID: customer, BranchID: &branch, StaffID: &staff, BookingType: "scheduled", StartsAt: &starts, EndsAt: &ends, TotalDuration: 30, TotalPriceMinor: 125_000, Currency: "IDR", IdempotencyKey: idem, RequestHash: "hash-" + idem}
}

func TestSameSlotRaceAllowsExactlyOneBooking(t *testing.T) {
	repository, _ := testRepository(t)
	base := uniqueBase()
	starts := time.Now().UTC().Add(72 * time.Hour).Truncate(time.Second)
	const contenders = 100
	var successes, conflicts atomic.Int32
	var unexpected atomic.Value
	barrier := make(chan struct{})
	var wait sync.WaitGroup
	for index := range contenders {
		input := createInput(base+int64(index)+1, base+500, base, starts, fmt.Sprintf("slot-%d-%d", base, index))
		wait.Add(1)
		go func(value booking.CreateInput) {
			defer wait.Done()
			<-barrier
			_, err := repository.Create(context.Background(), value)
			switch {
			case err == nil:
				successes.Add(1)
			case errors.Is(err, booking.ErrSlotConflict):
				conflicts.Add(1)
			default:
				unexpected.Store(err)
			}
		}(input)
	}
	close(barrier)
	wait.Wait()
	if value := unexpected.Load(); value != nil {
		t.Fatalf("unexpected create error: %v", value)
	}
	if successes.Load() != 1 || conflicts.Load() != contenders-1 {
		t.Fatalf("success=%d conflict=%d", successes.Load(), conflicts.Load())
	}
}

func TestIndependentParticipantSlotRaceAllowsExactlyOneBooking(t *testing.T) {
	repository, _ := testRepository(t)
	base := uniqueBase()
	starts := time.Now().UTC().Add(78 * time.Hour).Truncate(time.Second)
	ends := starts.Add(45 * time.Minute)
	secondaryStaff := base + 900
	const contenders = 100
	var successes, conflicts atomic.Int32
	var unexpected atomic.Value
	barrier := make(chan struct{})
	var wait sync.WaitGroup
	for index := range contenders {
		input := createInput(base+int64(index)+1000, base+int64(index)+2000, base+3000, starts.Add(-2*time.Hour), fmt.Sprintf("participant-slot-%d-%d", base, index))
		input.ParticipantCount = 2
		input.Participants = []booking.Participant{{Position: 1, Primary: true, Name: "Customer"}, {Position: 2, Name: "Guest", StaffID: &secondaryStaff, StartsAt: &starts, EndsAt: &ends}}
		wait.Add(1)
		go func(value booking.CreateInput) {
			defer wait.Done()
			<-barrier
			_, err := repository.Create(context.Background(), value)
			switch {
			case err == nil:
				successes.Add(1)
			case errors.Is(err, booking.ErrSlotConflict):
				conflicts.Add(1)
			default:
				unexpected.Store(err)
			}
		}(input)
	}
	close(barrier)
	wait.Wait()
	if value := unexpected.Load(); value != nil {
		t.Fatalf("unexpected participant create error: %v", value)
	}
	if successes.Load() != 1 || conflicts.Load() != contenders-1 {
		t.Fatalf("success=%d conflict=%d", successes.Load(), conflicts.Load())
	}
}

func TestSameIdempotencyKeyReturnsSameBooking(t *testing.T) {
	repository, _ := testRepository(t)
	base := uniqueBase()
	input := createInput(base+10, base+510, base, time.Now().UTC().Add(96*time.Hour).Truncate(time.Second), fmt.Sprintf("idem-%d", base))
	const contenders = 100
	results := make(chan booking.Booking, contenders)
	errorsFound := make(chan error, contenders)
	barrier := make(chan struct{})
	var wait sync.WaitGroup
	for range contenders {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-barrier
			value, err := repository.Create(context.Background(), input)
			results <- value
			errorsFound <- err
		}()
	}
	close(barrier)
	wait.Wait()
	close(results)
	close(errorsFound)
	for err := range errorsFound {
		if err != nil {
			t.Fatalf("idempotent create failed: %v", err)
		}
	}
	var id int64
	for value := range results {
		if id == 0 {
			id = value.ID
		}
		if value.ID != id {
			t.Fatalf("different resources returned: %d and %d", id, value.ID)
		}
	}
}

func TestRescheduleRaceKeepsExclusionInvariant(t *testing.T) {
	repository, _ := testRepository(t)
	base := uniqueBase()
	staff := base + 520
	first, err := repository.Create(context.Background(), createInput(base+20, staff, base, time.Now().UTC().Add(120*time.Hour).Truncate(time.Second), fmt.Sprintf("res-a-%d", base)))
	if err != nil {
		t.Fatal(err)
	}
	second, err := repository.Create(context.Background(), createInput(base+21, staff, base, time.Now().UTC().Add(122*time.Hour).Truncate(time.Second), fmt.Sprintf("res-b-%d", base)))
	if err != nil {
		t.Fatal(err)
	}
	target := time.Now().UTC().Add(130 * time.Hour).Truncate(time.Second)
	var successes, conflicts atomic.Int32
	barrier := make(chan struct{})
	var wait sync.WaitGroup
	for _, item := range []booking.Booking{first, second} {
		wait.Add(1)
		go func(value booking.Booking) {
			defer wait.Done()
			<-barrier
			_, raceErr := repository.Reschedule(context.Background(), value.ID, *value.CustomerID, *value.StaffID, target, target.Add(30*time.Minute))
			if raceErr == nil {
				successes.Add(1)
			} else if errors.Is(raceErr, booking.ErrSlotConflict) {
				conflicts.Add(1)
			} else {
				t.Errorf("unexpected reschedule error: %v", raceErr)
			}
		}(item)
	}
	close(barrier)
	wait.Wait()
	if successes.Load() != 1 || conflicts.Load() != 1 {
		t.Fatalf("success=%d conflict=%d", successes.Load(), conflicts.Load())
	}
}

func TestHoldExpiryFinalizeRaceEndsInOneConsistentState(t *testing.T) {
	repository, pool := testRepository(t)
	base := uniqueBase()
	value, err := repository.Create(context.Background(), createInput(base+30, base+530, base, time.Now().UTC().Add(150*time.Hour), fmt.Sprintf("hold-%d", base)))
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(context.Background(), `UPDATE bookings SET hold_expires_at=now()+interval '1 second' WHERE id=$1`, value.ID)
	if err != nil {
		t.Fatal(err)
	}
	barrier := make(chan struct{})
	finalizeResult := make(chan error, 1)
	expireResult := make(chan error, 1)
	var wait sync.WaitGroup
	wait.Add(2)
	go func() {
		defer wait.Done()
		<-barrier
		_, finalizeErr := repository.Finalize(context.Background(), value.ID, *value.CustomerID, booking.FinalizeInput{PaymentType: "full_payment", PaymentChannel: "qris", ParticipantCount: 1})
		finalizeResult <- finalizeErr
	}()
	go func() {
		defer wait.Done()
		<-barrier
		_, expireErr := repository.ExpireHolds(context.Background(), time.Now().UTC().Add(2*time.Second))
		expireResult <- expireErr
	}()
	close(barrier)
	wait.Wait()
	if finalizeErr := <-finalizeResult; finalizeErr != nil && !errors.Is(finalizeErr, booking.ErrInvalidTransition) {
		t.Fatalf("unexpected finalize error: %v", finalizeErr)
	}
	if expireErr := <-expireResult; expireErr != nil {
		t.Fatalf("unexpected expiry error: %v", expireErr)
	}
	final, err := repository.ByID(context.Background(), value.ID)
	if err != nil {
		t.Fatal(err)
	}
	if final.Status != "pending_payment" && final.Status != "expired_hold" {
		t.Fatalf("unexpected final state %s", final.Status)
	}
}

func TestFinalizeUsesRepeatedSnapshotPricingAndPayableOverride(t *testing.T) {
	repository, _ := testRepository(t)
	base := uniqueBase()
	input := createInput(base+40, base+540, base, time.Now().UTC().Add(180*time.Hour), fmt.Sprintf("pricing-%d", base))
	input.ParticipantCount = 2
	input.TotalDuration = 60
	input.TotalPriceMinor = 100_000
	input.Services = []booking.ServiceSnapshot{{ServiceID: base + 700, ProviderID: input.ProviderID, Title: "Snapshot service", PriceMinor: 50_000, Currency: "IDR", Duration: 30}}
	value, err := repository.Create(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	serviceIDs, subtotal, err := repository.PricingItems(context.Background(), value.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(serviceIDs) != 2 || serviceIDs[0] != input.Services[0].ServiceID || serviceIDs[1] != input.Services[0].ServiceID || subtotal != 100_000 {
		t.Fatalf("unexpected pricing items: ids=%v subtotal=%d", serviceIDs, subtotal)
	}
	payable := int64(94_500)
	finalized, err := repository.Finalize(context.Background(), value.ID, *value.CustomerID, booking.FinalizeInput{PaymentType: "full_payment", PaymentChannel: "qris", ParticipantCount: 2, Guests: []booking.GuestRequest{{Name: "Guest"}}, TotalPriceMinor: &payable})
	if err != nil {
		t.Fatal(err)
	}
	if finalized.TotalPriceMinor != payable || finalized.PaymentAmount != payable || finalized.Status != "pending_payment" {
		t.Fatalf("unexpected finalized booking: %+v", finalized)
	}
}

func TestDailyQueueNumberAndProviderOperationalTimestamps(t *testing.T) {
	repository, _ := testRepository(t)
	base := uniqueBase()
	branchID := base + 8000
	bookingDate := time.Now().UTC().Add(24 * time.Hour).Format("2006-01-02")
	createQueue := func(offset int64) booking.Booking {
		input := booking.CreateInput{
			ProviderID: base + 7000, CustomerID: base + offset, BranchID: &branchID,
			BookingType: "queue", BookingDate: bookingDate, Status: "waiting", TotalDuration: 30,
			TotalPriceMinor: 75_000, Currency: "IDR", PaymentType: "pay_at_salon",
			IdempotencyKey: fmt.Sprintf("queue-%d-%d", base, offset), RequestHash: fmt.Sprintf("queue-hash-%d", offset),
		}
		value, err := repository.Create(context.Background(), input)
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	first := createQueue(1)
	second := createQueue(2)
	if first.QueueNumber == nil || second.QueueNumber == nil || *first.QueueNumber != 1 || *second.QueueNumber != 2 {
		t.Fatalf("unexpected daily queue sequence: first=%v second=%v", first.QueueNumber, second.QueueNumber)
	}
	called, err := repository.ProviderTransition(context.Background(), first.ID, first.ProviderID, nil, "checked_in", nil)
	if err != nil || called.CheckedInAt == nil {
		t.Fatalf("check-in timestamp missing: booking=%+v err=%v", called, err)
	}
	staffID := base + 9000
	started, err := repository.ProviderTransition(context.Background(), first.ID, first.ProviderID, nil, "in_progress", &staffID)
	if err != nil || started.ActualStartedAt == nil || started.StaffID == nil || *started.StaffID != staffID {
		t.Fatalf("start operation incomplete: booking=%+v err=%v", started, err)
	}
	completed, err := repository.ProviderTransition(context.Background(), first.ID, first.ProviderID, nil, "completed", &staffID)
	if err != nil || completed.ActualEndedAt == nil || completed.CompletedAt == nil {
		t.Fatalf("completion timestamps missing: booking=%+v err=%v", completed, err)
	}
	wrongBranch := branchID + 1
	if _, err = repository.ProviderTransition(context.Background(), second.ID, second.ProviderID, &wrongBranch, "checked_in", nil); !errors.Is(err, booking.ErrForbidden) {
		t.Fatalf("cross-branch provider transition returned %v", err)
	}
}
