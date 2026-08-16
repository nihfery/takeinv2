package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://127.0.0.1:8080/health", nil)
		if err != nil {
			os.Exit(1)
		}
		response, err := http.DefaultClient.Do(request)
		if err != nil || response.StatusCode != http.StatusNoContent {
			os.Exit(1)
		}
		_ = response.Body.Close()
		return
	}
	root := os.Getenv("OBJECT_ROOT")
	if root == "" {
		root = "/data"
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		log.Fatal(err)
	}
	if err = os.MkdirAll(absRoot, 0o750); err != nil {
		log.Fatal(err)
	}
	handler := http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/health" {
			response.WriteHeader(http.StatusNoContent)
			return
		}
		target, targetErr := safeTarget(absRoot, request.URL.Path)
		if targetErr != nil {
			http.Error(response, "invalid object key", http.StatusBadRequest)
			return
		}
		switch request.Method {
		case http.MethodPut:
			content, readErr := io.ReadAll(http.MaxBytesReader(response, request.Body, 6<<20))
			if readErr != nil {
				http.Error(response, "invalid object", http.StatusRequestEntityTooLarge)
				return
			}
			if err := os.MkdirAll(filepath.Dir(target), 0o750); err != nil {
				http.Error(response, "storage error", http.StatusInternalServerError)
				return
			}
			if err := os.WriteFile(target, content, 0o640); err != nil {
				http.Error(response, "storage error", http.StatusInternalServerError)
				return
			}
			response.WriteHeader(http.StatusNoContent)
		case http.MethodGet:
			http.ServeFile(response, request, target)
		case http.MethodHead:
			info, statErr := os.Stat(target)
			if errors.Is(statErr, os.ErrNotExist) {
				http.NotFound(response, request)
				return
			}
			if statErr != nil || !info.Mode().IsRegular() {
				http.Error(response, "storage error", http.StatusInternalServerError)
				return
			}
			response.Header().Set("Content-Length", fmt.Sprint(info.Size()))
			response.WriteHeader(http.StatusOK)
		case http.MethodDelete:
			if err := os.Remove(target); err != nil && !errors.Is(err, os.ErrNotExist) {
				http.Error(response, "storage error", http.StatusInternalServerError)
				return
			}
			response.WriteHeader(http.StatusNoContent)
		default:
			response.Header().Set("Allow", "GET, HEAD, PUT, DELETE")
			response.WriteHeader(http.StatusMethodNotAllowed)
		}
	})
	server := &http.Server{Addr: ":8080", Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	log.Fatal(server.ListenAndServe())
}

func safeTarget(root, requestPath string) (string, error) {
	relative := strings.TrimPrefix(filepath.Clean("/"+requestPath), string(filepath.Separator))
	target, err := filepath.Abs(filepath.Join(root, relative))
	if err != nil || target == root || !strings.HasPrefix(target, root+string(filepath.Separator)) {
		return "", errors.New("unsafe object key")
	}
	return target, nil
}
