package main

import (
	"log/slog"
	"os"

	"github.com/nihfery/takein/libs/go/runtimeapp"
	"github.com/nihfery/takein/services/notification-service/internal/app"
)

func main() {
	if err := runtimeapp.Run("notification-service", app.RegisterRoutes); err != nil {
		slog.Error("notification service stopped", "error", err)
		os.Exit(1)
	}
}
