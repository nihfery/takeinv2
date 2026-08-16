package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nihfery/takein/services/payment-service/internal/payment"
)

func TestWebhookReplayIsDeduplicated(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is required for PostgreSQL replay test")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	repository := New(pool)
	seed := time.Now().UnixNano() % 1_000_000_000
	orderID := fmt.Sprintf("ORDER-%d", seed)
	input := payment.ChargeInput{BookingID: seed, CustomerID: seed, PaymentType: "full_payment", AmountMinor: 125000, Currency: "IDR", PaymentMethod: "bank_transfer", IdempotencyKey: orderID}
	_, err = repository.CreateCharge(context.Background(), input, payment.GatewayResponse{OrderID: orderID, Status: "pending", Raw: []byte(`{"token":"test"}`)})
	if err != nil {
		t.Fatal(err)
	}
	notification := payment.Notification{OrderID: orderID, StatusCode: "200", GrossAmount: "1250.00", SignatureKey: "signature", TransactionID: fmt.Sprintf("TX-%d", seed), TransactionStatus: "settlement"}
	raw, _ := json.Marshal(notification)
	first, replay, err := repository.ProcessNotification(context.Background(), notification, raw)
	if err != nil || replay || first.Status != "paid" {
		t.Fatalf("first status=%s replay=%v err=%v", first.Status, replay, err)
	}
	second, replay, err := repository.ProcessNotification(context.Background(), notification, raw)
	if err != nil || !replay || second.Status != "paid" {
		t.Fatalf("second status=%s replay=%v err=%v", second.Status, replay, err)
	}
	var webhookCount int
	if err = pool.QueryRow(context.Background(), `SELECT count(*) FROM webhook_notifications WHERE provider_order_id=$1`, orderID).Scan(&webhookCount); err != nil {
		t.Fatal(err)
	}
	if webhookCount != 1 {
		t.Fatalf("webhook rows=%d", webhookCount)
	}
}
