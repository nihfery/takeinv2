package logging

import (
	"io"
	"log/slog"
	"os"
	"strings"
)

func New(service, version, environment, level string) *slog.Logger {
	return NewWithWriter(os.Stdout, service, version, environment, level)
}

func NewWithWriter(writer io.Writer, service, version, environment, level string) *slog.Logger {
	var parsed slog.Level
	switch strings.ToLower(level) {
	case "debug":
		parsed = slog.LevelDebug
	case "warn", "warning":
		parsed = slog.LevelWarn
	case "error":
		parsed = slog.LevelError
	default:
		parsed = slog.LevelInfo
	}
	handler := slog.NewJSONHandler(writer, &slog.HandlerOptions{
		Level: parsed,
		ReplaceAttr: func(_ []string, attr slog.Attr) slog.Attr {
			switch attr.Key {
			case slog.TimeKey:
				attr.Key = "timestamp"
			case slog.MessageKey:
				attr.Key = "message"
			}
			return attr
		},
	})
	return slog.New(handler).With("service", service, "version", version, "environment", environment)
}
