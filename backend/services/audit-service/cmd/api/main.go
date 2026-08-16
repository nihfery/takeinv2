package main

import (
	"log/slog"
	"os"

	"github.com/nihfery/takein/libs/go/runtimeapp"
	"github.com/nihfery/takein/services/audit-service/internal/app"
)

func main() {
	if err := runtimeapp.Run("audit-service", app.RegisterRoutes); err != nil {
		slog.Error("audit service stopped", "error", err)
		os.Exit(1)
	}
}
