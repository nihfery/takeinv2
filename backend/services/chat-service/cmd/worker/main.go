package main

import (
	"log/slog"
	"os"

	"github.com/nihfery/takein/libs/go/workerapp"
)

func main() {
	if err := workerapp.RunOutbox("chat-service"); err != nil {
		slog.Error("chat worker stopped", "error", err)
		os.Exit(1)
	}
}
