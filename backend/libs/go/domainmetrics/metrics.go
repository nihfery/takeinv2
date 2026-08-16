package domainmetrics

import "github.com/prometheus/client_golang/prometheus"

var (
	bookingCreate      = prometheus.NewCounter(prometheus.CounterOpts{Name: "booking_create_total", Help: "Booking creation attempts."})
	bookingConflict    = prometheus.NewCounter(prometheus.CounterOpts{Name: "booking_conflict_total", Help: "Booking slot conflicts."})
	bookingHoldExpired = prometheus.NewCounter(prometheus.CounterOpts{Name: "booking_hold_expired_total", Help: "Booking holds expired by the sweeper."})
	paymentWebhook     = prometheus.NewCounter(prometheus.CounterOpts{Name: "payment_webhook_total", Help: "Payment webhook requests."})
	paymentInvalidSig  = prometheus.NewCounter(prometheus.CounterOpts{Name: "payment_webhook_invalid_signature_total", Help: "Payment webhooks rejected for an invalid signature."})
	paymentTransition  = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "payment_transition_total", Help: "Successful payment state transitions."}, []string{"status"})
	authLogin          = prometheus.NewCounter(prometheus.CounterOpts{Name: "auth_login_total", Help: "Authentication login attempts."})
	authLoginFailed    = prometheus.NewCounter(prometheus.CounterOpts{Name: "auth_login_failed_total", Help: "Failed authentication login attempts."})
)

func init() {
	prometheus.MustRegister(bookingCreate, bookingConflict, bookingHoldExpired, paymentWebhook, paymentInvalidSig, paymentTransition, authLogin, authLoginFailed)
}

func BookingCreate()                  { bookingCreate.Inc() }
func BookingConflict()                { bookingConflict.Inc() }
func BookingHoldsExpired(count int64) { bookingHoldExpired.Add(float64(count)) }
func PaymentWebhook()                 { paymentWebhook.Inc() }
func PaymentInvalidSignature()        { paymentInvalidSig.Inc() }
func PaymentTransition(status string) { paymentTransition.WithLabelValues(status).Inc() }
func AuthLogin()                      { authLogin.Inc() }
func AuthLoginFailed()                { authLoginFailed.Inc() }
