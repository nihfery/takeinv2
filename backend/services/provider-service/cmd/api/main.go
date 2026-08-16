package main

import (
	"log/slog"
	"os"

	"github.com/nihfery/takein/libs/go/runtimeapp"
	"github.com/nihfery/takein/services/provider-service/internal/app"
)

func main() {
	if err := runtimeapp.RunService("provider-service", app.RegisterService); err != nil {
		slog.Error("provider service stopped", "error", err)
		os.Exit(1)
	}
}
