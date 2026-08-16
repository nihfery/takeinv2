package middleware

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
)

var (
	httpRequests = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "http_server_requests_total", Help: "Completed HTTP server requests."}, []string{"service", "method", "route", "status"})
	httpDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{Name: "http_server_request_duration", Help: "HTTP server request duration in seconds.", Buckets: prometheus.DefBuckets}, []string{"service", "method", "route", "status"})
	httpInFlight = prometheus.NewGaugeVec(prometheus.GaugeOpts{Name: "http_server_in_flight", Help: "HTTP server requests currently in flight."}, []string{"service", "method"})
)

func init() { prometheus.MustRegister(httpRequests, httpDuration, httpInFlight) }

func Metrics(service string) gin.HandlerFunc {
	return func(c *gin.Context) {
		started := time.Now()
		inFlight := httpInFlight.WithLabelValues(service, c.Request.Method)
		inFlight.Inc()
		defer inFlight.Dec()
		c.Next()
		route := c.FullPath()
		if route == "" {
			route = "unmatched"
		}
		status := strconv.Itoa(c.Writer.Status())
		httpRequests.WithLabelValues(service, c.Request.Method, route, status).Inc()
		httpDuration.WithLabelValues(service, c.Request.Method, route, status).Observe(time.Since(started).Seconds())
	}
}
