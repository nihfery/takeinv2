package main

import (
	"log/slog"
	"os"

	"github.com/nihfery/takein/libs/go/runtimeapp"
	"github.com/nihfery/takein/services/customer-service/internal/app"
)

func main() {
	if err := runtimeapp.RunService("customer-service", app.RegisterService); err != nil {
		slog.Error("customer service stopped", "error", err)
		os.Exit(1)
	}
}
