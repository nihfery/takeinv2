package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strings"
	"time"
)

type apiClient struct {
	baseURL string
	token   string
	http    *http.Client
}

type apiResponse struct {
	status int
	body   map[string]any
	raw    []byte
}

type multipartFile struct {
	field, name, contentType string
	content                  []byte
}

func (client apiClient) withToken(token string) apiClient {
	client.token = token
	return client
}

func (client apiClient) do(ctx context.Context, method, path string, payload any, headers map[string]string) (apiResponse, error) {
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return apiResponse{}, err
		}
		body = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, client.baseURL+path, body)
	if err != nil {
		return apiResponse{}, err
	}
	if payload != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if client.token != "" {
		request.Header.Set("Authorization", "Bearer "+client.token)
	}
	for name, value := range headers {
		request.Header.Set(name, value)
	}
	response, err := client.http.Do(request)
	if err != nil {
		return apiResponse{}, err
	}
	defer func() { _ = response.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return apiResponse{}, err
	}
	decoded := map[string]any{}
	if len(raw) > 0 && json.Unmarshal(raw, &decoded) != nil {
		decoded = map[string]any{"raw": string(raw)}
	}
	return apiResponse{status: response.StatusCode, body: decoded, raw: raw}, nil
}

func (client apiClient) doMultipart(ctx context.Context, method, path string, fields map[string][]string, files []multipartFile) (apiResponse, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for name, values := range fields {
		for _, value := range values {
			if err := writer.WriteField(name, value); err != nil {
				return apiResponse{}, err
			}
		}
	}
	for _, file := range files {
		header := make(textproto.MIMEHeader)
		header.Set("Content-Disposition", fmt.Sprintf(`form-data; name=%q; filename=%q`, file.field, file.name))
		header.Set("Content-Type", file.contentType)
		if header.Get("Content-Type") == "" {
			header.Set("Content-Type", "application/octet-stream")
		}
		part, err := writer.CreatePart(header)
		if err != nil {
			return apiResponse{}, err
		}
		if _, err = part.Write(file.content); err != nil {
			return apiResponse{}, err
		}
	}
	if err := writer.Close(); err != nil {
		return apiResponse{}, err
	}
	request, err := http.NewRequestWithContext(ctx, method, client.baseURL+path, &body)
	if err != nil {
		return apiResponse{}, err
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	if client.token != "" {
		request.Header.Set("Authorization", "Bearer "+client.token)
	}
	response, err := client.http.Do(request)
	if err != nil {
		return apiResponse{}, err
	}
	defer func() { _ = response.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return apiResponse{}, err
	}
	decoded := map[string]any{}
	if len(raw) > 0 && json.Unmarshal(raw, &decoded) != nil {
		decoded = map[string]any{"raw": string(raw)}
	}
	return apiResponse{status: response.StatusCode, body: decoded, raw: raw}, nil
}

func (client apiClient) putURL(ctx context.Context, target, contentType string, content []byte) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodPut, target, bytes.NewReader(content))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", contentType)
	response, err := client.http.Do(request)
	if err != nil {
		return err
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(response.Body, 800))
		return fmt.Errorf("object upload HTTP %d: %s", response.StatusCode, truncate(string(raw), 800))
	}
	return nil
}

func (response apiResponse) expect(statuses ...int) error {
	for _, status := range statuses {
		if response.status == status {
			return nil
		}
	}
	return fmt.Errorf("unexpected HTTP %d: %s", response.status, truncate(string(response.raw), 800))
}

func responseFailure(action string, response apiResponse, err error) error {
	if err != nil {
		return fmt.Errorf("%s: %w", action, err)
	}
	return fmt.Errorf("%s: unexpected HTTP %d: %s", action, response.status, truncate(string(response.raw), 800))
}

func waitFor(ctx context.Context, label string, fn func() (bool, error)) error {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	var last error
	for {
		ready, err := fn()
		if ready && err == nil {
			return nil
		}
		if err != nil {
			last = err
		}
		select {
		case <-ctx.Done():
			if last != nil {
				return fmt.Errorf("%s: %w", label, last)
			}
			return fmt.Errorf("%s: %w", label, ctx.Err())
		case <-ticker.C:
		}
	}
}

func nestedMap(value map[string]any, keys ...string) map[string]any {
	current := value
	for _, key := range keys {
		next, ok := current[key].(map[string]any)
		if !ok {
			return nil
		}
		current = next
	}
	return current
}

func number(value any) int64 {
	switch typed := value.(type) {
	case float64:
		return int64(typed)
	case int64:
		return typed
	case json.Number:
		result, _ := typed.Int64()
		return result
	default:
		return 0
	}
}

func stringValue(value any) string {
	result, _ := value.(string)
	return result
}

func containsID(items any, key string, target int64) bool {
	values, ok := items.([]any)
	if !ok {
		return false
	}
	for _, value := range values {
		item, ok := value.(map[string]any)
		if ok && number(item[key]) == target {
			return true
		}
	}
	return false
}

func truncate(value string, limit int) string {
	value = strings.TrimSpace(value)
	if len(value) <= limit {
		return value
	}
	return value[:limit] + "..."
}
