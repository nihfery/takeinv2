package main

import (
	"log/slog"
	"os"

	"github.com/nihfery/takein/libs/go/runtimeapp"
	"github.com/nihfery/takein/services/catalog-service/internal/app"
)

func main() {
	if err := runtimeapp.RunService("catalog-service", app.RegisterService); err != nil {
		slog.Error("catalog service stopped", "error", err)
		os.Exit(1)
	}
}
