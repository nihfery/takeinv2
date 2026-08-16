package main

import (
	"log/slog"
	"os"

	"github.com/nihfery/takein/libs/go/runtimeapp"
	"github.com/nihfery/takein/services/media-service/internal/app"
)

func main() {
	if err := runtimeapp.RunService("media-service", app.RegisterService); err != nil {
		slog.Error("media service stopped", "error", err)
		os.Exit(1)
	}
}
