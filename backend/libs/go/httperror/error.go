package httperror

import (
	"errors"
	"fmt"
	"net/http"
)

type Code string

const (
	CodeValidation            Code = "validation_error"
	CodeNotFound              Code = "not_found"
	CodeConflict              Code = "conflict"
	CodeUnauthorized          Code = "unauthorized"
	CodeForbidden             Code = "forbidden"
	CodeRateLimited           Code = "rate_limited"
	CodeDependencyUnavailable Code = "dependency_unavailable"
	CodeInternal              Code = "internal_error"
)

type Error struct {
	Code       Code
	Message    string
	Status     int
	Validation map[string][]string
	Err        error
}

func (e *Error) Error() string {
	if e.Err == nil {
		return e.Message
	}
	return fmt.Sprintf("%s: %v", e.Message, e.Err)
}

func (e *Error) Unwrap() error { return e.Err }

func New(status int, code Code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

func Wrap(err error, status int, code Code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message, Err: err}
}

func Public(err error) *Error {
	var target *Error
	if errors.As(err, &target) {
		return target
	}
	return New(http.StatusInternalServerError, CodeInternal, "An internal error occurred.")
}
