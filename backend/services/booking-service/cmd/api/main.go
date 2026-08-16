package main

import (
	"log/slog"
	"os"

	"github.com/nihfery/takein/libs/go/runtimeapp"
	"github.com/nihfery/takein/services/booking-service/internal/app"
)

func main() {
	if err := runtimeapp.RunService("booking-service", app.RegisterService); err != nil {
		slog.Error("booking service stopped", "error", err)
		os.Exit(1)
	}
}
