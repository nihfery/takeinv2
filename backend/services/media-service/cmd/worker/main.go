package main

import (
	"log/slog"
	"os"

	"github.com/nihfery/takein/libs/go/workerapp"
)

func main() {
	if err := workerapp.RunOutbox("media-service"); err != nil {
		slog.Error("media worker stopped", "error", err)
		os.Exit(1)
	}
}
