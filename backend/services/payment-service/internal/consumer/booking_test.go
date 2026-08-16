package consumer

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	bookingeventsv1 "github.com/nihfery/takein/gen/go/takein/events/booking/v1"
	"github.com/twmb/franz-go/pkg/kgo"
	"google.golang.org/protobuf/proto"
)

func TestPayAtSalonProjectionIsCreatedAndPaidIdempotently(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is required for booking projection test")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	processor := NewBookingProcessor(pool)
	seed := time.Now().UnixNano() % 1_000_000_000
	bookingID := seed + 5_000_000_000
	message := &bookingeventsv1.BookingChanged{
		BookingId: strconv.FormatInt(bookingID, 10), ProviderId: strconv.FormatInt(seed+10, 10), CustomerId: strconv.FormatInt(seed+20, 10),
		PaymentType: "pay_at_salon", TotalPriceMinorUnits: 185_000, Currency: "IDR", Status: "confirmed", ChangeType: "booking.created",
	}
	record := bookingRecord(t, message, "booking.created", uuid.NewString(), seed)
	if err = processor.Process(context.Background(), record); err != nil {
		t.Fatal(err)
	}
	if err = processor.Process(context.Background(), record); err != nil {
		t.Fatalf("replay failed: %v", err)
	}
	message.Status, message.ChangeType = "completed", "booking.completed"
	if err = processor.Process(context.Background(), bookingRecord(t, message, "booking.completed", uuid.NewString(), seed+1)); err != nil {
		t.Fatal(err)
	}
	var count int
	var status string
	var amount int64
	var paidAt *time.Time
	err = pool.QueryRow(context.Background(), `SELECT count(*),max(status),round(max(amount)*100)::bigint,max(paid_at) FROM payments WHERE booking_id=$1`, bookingID).Scan(&count, &status, &amount, &paidAt)
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 || status != "paid" || amount != 185_000 || paidAt == nil {
		t.Fatalf("projection count=%d status=%s amount=%d paid_at=%v", count, status, amount, paidAt)
	}
}

func TestPendingHoldDoesNotCreatePayAtSalonProjection(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is required for booking projection test")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	processor := NewBookingProcessor(pool)
	seed := time.Now().UnixNano() % 1_000_000_000
	bookingID := seed + 6_000_000_000
	message := &bookingeventsv1.BookingChanged{
		BookingId: strconv.FormatInt(bookingID, 10), ProviderId: strconv.FormatInt(seed+10, 10), CustomerId: strconv.FormatInt(seed+20, 10),
		PaymentType: "pay_at_salon", TotalPriceMinorUnits: 185_000, Currency: "IDR", Status: "pending_hold", ChangeType: "booking.created",
	}
	if err = processor.Process(context.Background(), bookingRecord(t, message, "booking.created", uuid.NewString(), seed)); err != nil {
		t.Fatal(err)
	}

	var count int
	if err = pool.QueryRow(context.Background(), `SELECT count(*) FROM payments WHERE booking_id=$1`, bookingID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("pending hold created %d payment projections", count)
	}
}

func bookingRecord(t *testing.T, message *bookingeventsv1.BookingChanged, eventType, eventID string, offset int64) *kgo.Record {
	t.Helper()
	payload, err := proto.Marshal(message)
	if err != nil {
		t.Fatal(err)
	}
	return &kgo.Record{
		Topic: "takein.booking.events.v1", Partition: 0, Offset: offset, Value: payload,
		Headers: []kgo.RecordHeader{{Key: "event_id", Value: []byte(eventID)}, {Key: "event_type", Value: []byte(eventType)}, {Key: "correlation_id", Value: []byte(fmt.Sprint(offset))}},
	}
}
