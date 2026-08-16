package midtrans

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/nihfery/takein/services/payment-service/internal/payment"
)

type Client struct {
	baseURL, serverKey string
	http               *http.Client
}

func New(baseURL, serverKey string, timeout time.Duration) *Client {
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), serverKey: serverKey, http: &http.Client{Timeout: timeout}}
}
func (c *Client) Charge(ctx context.Context, input payment.ChargeInput, orderID string) (payment.GatewayResponse, error) {
	grossAmount := (input.AmountMinor + 50) / 100
	if grossAmount < 1 {
		return payment.GatewayResponse{}, errors.New("midtrans gross amount must be positive")
	}
	payload := map[string]any{
		"transaction_details": map[string]any{"order_id": orderID, "gross_amount": grossAmount},
		"custom_expiry":       map[string]any{"expiry_duration": 7, "unit": "minute"},
		"custom_field1":       input.BookingCode,
		"custom_field2":       input.PaymentType,
	}
	switch input.PaymentChannel {
	case "qris":
		payload["payment_type"] = "gopay"
	case "mandiri_bill":
		label := "JasaKu Booking"
		if input.SubscriptionID > 0 {
			label = "JasaKu Subscription"
		}
		payload["payment_type"] = "echannel"
		payload["echannel"] = map[string]any{"bill_info1": "Payment For:", "bill_info2": label}
	case "bca_va", "bni_va", "bri_va", "permata_va", "cimb_va":
		payload["payment_type"] = "bank_transfer"
		payload["bank_transfer"] = map[string]any{"bank": strings.TrimSuffix(input.PaymentChannel, "_va")}
	default:
		return payment.GatewayResponse{}, errors.New("unsupported Midtrans payment channel")
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return payment.GatewayResponse{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/snap/v1/transactions", bytes.NewReader(body))
	if err != nil {
		return payment.GatewayResponse{}, err
	}
	request.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(c.serverKey+":")))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Idempotency-Key", input.IdempotencyKey)
	response, err := c.http.Do(request)
	if err != nil {
		return payment.GatewayResponse{}, err
	}
	defer func() { _ = response.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return payment.GatewayResponse{}, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return payment.GatewayResponse{}, fmt.Errorf("midtrans returned HTTP %d", response.StatusCode)
	}
	var decoded struct {
		Token       string `json:"token"`
		RedirectURL string `json:"redirect_url"`
	}
	if err = json.Unmarshal(raw, &decoded); err != nil {
		return payment.GatewayResponse{}, err
	}
	if decoded.Token == "" {
		return payment.GatewayResponse{}, errors.New("midtrans response did not contain a token")
	}
	expiresAt := time.Now().UTC().Add(7 * time.Minute)
	return payment.GatewayResponse{OrderID: orderID, Status: "pending", RedirectURL: decoded.RedirectURL, Token: decoded.Token, ExpiresAt: &expiresAt, Raw: raw}, nil
}
