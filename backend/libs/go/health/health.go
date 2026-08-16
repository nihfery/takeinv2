package health

import (
	"context"
	"sync"
)

type Check func(context.Context) error

type Registry struct {
	mu     sync.RWMutex
	ready  bool
	checks map[string]Check
}

func New() *Registry {
	return &Registry{ready: true, checks: make(map[string]Check)}
}

func (r *Registry) Add(name string, check Check) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.checks[name] = check
}

func (r *Registry) SetReady(value bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.ready = value
}

func (r *Registry) Ready(ctx context.Context) map[string]string {
	r.mu.RLock()
	ready := r.ready
	checks := make(map[string]Check, len(r.checks))
	for name, check := range r.checks {
		checks[name] = check
	}
	r.mu.RUnlock()
	status := make(map[string]string, len(checks)+1)
	if ready {
		status["service"] = "ready"
	} else {
		status["service"] = "draining"
	}
	for name, check := range checks {
		if err := check(ctx); err != nil {
			status[name] = "unavailable"
		} else {
			status[name] = "ready"
		}
	}
	return status
}

func IsReady(status map[string]string) bool {
	for _, value := range status {
		if value != "ready" {
			return false
		}
	}
	return true
}
