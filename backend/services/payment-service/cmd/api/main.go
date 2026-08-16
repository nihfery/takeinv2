package main

import (
	"log/slog"
	"os"

	"github.com/nihfery/takein/libs/go/runtimeapp"
	"github.com/nihfery/takein/services/payment-service/internal/app"
)

func main() {
	if err := runtimeapp.RunService("payment-service", app.RegisterService); err != nil {
		slog.Error("payment service stopped", "error", err)
		os.Exit(1)
	}
}
