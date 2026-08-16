package payment

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
)

type idempotencyRepository struct {
	mu      sync.Mutex
	locks   map[string]*sync.Mutex
	charges map[string]Charge
}

func newIdempotencyRepository() *idempotencyRepository {
	return &idempotencyRepository{locks: map[string]*sync.Mutex{}, charges: map[string]Charge{}}
}

func (r *idempotencyRepository) LockCharge(_ context.Context, scope string) (func(), error) {
	r.mu.Lock()
	lock := r.locks[scope]
	if lock == nil {
		lock = &sync.Mutex{}
		r.locks[scope] = lock
	}
	r.mu.Unlock()
	lock.Lock()
	return lock.Unlock, nil
}

func (r *idempotencyRepository) ChargeByIdempotency(_ context.Context, input ChargeInput) (Charge, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	value, ok := r.charges[input.IdempotencyKey]
	if !ok {
		return Charge{}, ErrNotFound
	}
	return value, nil
}

func (r *idempotencyRepository) CreateCharge(_ context.Context, input ChargeInput, gateway GatewayResponse) (Charge, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	customerID, key := input.CustomerID, input.IdempotencyKey
	value := Charge{Payment: Payment{ID: 1, BookingID: input.BookingID, CustomerID: &customerID, PaymentType: input.PaymentType, AmountMinor: input.AmountMinor, Currency: input.Currency, Status: "pending", PaymentMethod: input.PaymentMethod, PaymentChannel: input.PaymentChannel, IdempotencyKey: &key}, OrderID: gateway.OrderID, Token: gateway.Token, PaymentChannel: input.PaymentChannel}
	r.charges[key] = value
	return value, nil
}

func (r *idempotencyRepository) ByBooking(context.Context, int64) (Payment, error) {
	return Payment{}, ErrNotFound
}
func (r *idempotencyRepository) ByID(context.Context, int64) (Payment, error) {
	return Payment{}, ErrNotFound
}
func (r *idempotencyRepository) ProcessNotification(context.Context, Notification, []byte) (Payment, bool, error) {
	return Payment{}, false, ErrNotFound
}
func (r *idempotencyRepository) ManualConfirm(context.Context, int64, int64) (Payment, error) {
	return Payment{}, ErrNotFound
}
func (r *idempotencyRepository) ListProvider(context.Context, ProviderFilter) ([]Payment, error) {
	return nil, nil
}

type idempotencyBookingClient struct{}

func (idempotencyBookingClient) PaymentContext(context.Context, int64, string, int64) (BookingPaymentContext, error) {
	return BookingPaymentContext{BookingID: 41, BookingCode: "TK-41", CustomerID: 7, ProviderID: 3, Status: "pending_payment", Currency: "IDR", PaymentType: "full_payment", PaymentChannel: "qris", AmountMinor: 150_000_00}, nil
}
func (idempotencyBookingClient) ApplyPaymentState(context.Context, string, Payment) (string, error) {
	return "confirmed", nil
}

type countingGateway struct{ calls atomic.Int32 }

func (g *countingGateway) Charge(_ context.Context, _ ChargeInput, orderID string) (GatewayResponse, error) {
	g.calls.Add(1)
	return GatewayResponse{OrderID: orderID, Status: "pending", Token: "token"}, nil
}

func TestConcurrentChargeCallsReachGatewayOnce(t *testing.T) {
	repository := newIdempotencyRepository()
	gateway := &countingGateway{}
	service := NewService(repository, gateway, "secret")
	service.ConfigureBooking(idempotencyBookingClient{}, false)

	const concurrency = 100
	var wait sync.WaitGroup
	wait.Add(concurrency)
	errorsFound := make(chan error, concurrency)
	orders := make(chan string, concurrency)
	for range concurrency {
		go func() {
			defer wait.Done()
			value, err := service.Charge(context.Background(), ChargeInput{BookingID: 41, CustomerID: 7, PaymentChannel: "qris", IdempotencyKey: "same-key"})
			if err != nil {
				errorsFound <- err
				return
			}
			orders <- value.OrderID
		}()
	}
	wait.Wait()
	close(errorsFound)
	close(orders)
	for err := range errorsFound {
		t.Fatalf("charge failed: %v", err)
	}
	var orderID string
	for value := range orders {
		if orderID == "" {
			orderID = value
		}
		if value != orderID {
			t.Fatalf("different orders returned: %q and %q", orderID, value)
		}
	}
	if calls := gateway.calls.Load(); calls != 1 {
		t.Fatalf("gateway calls=%d, want 1", calls)
	}
}
