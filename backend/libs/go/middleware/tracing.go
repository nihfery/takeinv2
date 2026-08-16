package middleware

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
)

func Tracing(service string) gin.HandlerFunc {
	return func(c *gin.Context) {
		propagator := otel.GetTextMapPropagator()
		ctx := propagator.Extract(c.Request.Context(), propagation.HeaderCarrier(c.Request.Header))
		name := c.Request.Method + " " + c.Request.URL.Path
		ctx, span := otel.Tracer(service).Start(ctx, name)
		c.Request = c.Request.WithContext(ctx)
		c.Next()
		route := c.FullPath()
		span.SetAttributes(attribute.String("http.request.method", c.Request.Method), attribute.String("http.route", route), attribute.Int("http.response.status_code", c.Writer.Status()))
		if c.Writer.Status() >= http.StatusInternalServerError {
			span.SetStatus(codes.Error, fmt.Sprintf("HTTP %d", c.Writer.Status()))
		}
		span.End()
	}
}
