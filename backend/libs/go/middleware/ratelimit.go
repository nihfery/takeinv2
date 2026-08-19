package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
	"net"
	"net/http"
	"reflect"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nihfery/takein/libs/go/redisx"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/redis/go-redis/v9"
)

type RatePolicy struct {
	Limit  int64
	Window time.Duration
}

var rateLimitDecisions = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "rate_limit_decisions_total", Help: "Rate-limit decisions by service, route, and result."}, []string{"service", "route", "result"})

func init() { prometheus.MustRegister(rateLimitDecisions) }

type memoryCounter struct {
	count     int64
	expiresAt time.Time
}

type rateLimiter struct {
	redis    redis.Cmdable
	service  string
	policies map[string]RatePolicy
	logger   *slog.Logger
	mu       sync.Mutex
	memory   map[string]memoryCounter
	uses     uint64
}

var incrementScript = redis.NewScript(`
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`)

func RateLimit(client redis.Cmdable, service string, policies map[string]RatePolicy, logger *slog.Logger) gin.HandlerFunc {
	if isNilRedisClient(client) {
		client = nil
	}
	limiter := &rateLimiter{redis: client, service: service, policies: policies, logger: logger, memory: map[string]memoryCounter{}}
	if limiter.logger == nil {
		limiter.logger = slog.Default()
	}
	return limiter.handle
}

func isNilRedisClient(client redis.Cmdable) bool {
	if client == nil {
		return true
	}
	value := reflect.ValueOf(client)
	switch value.Kind() {
	case reflect.Chan, reflect.Func, reflect.Interface, reflect.Map, reflect.Pointer, reflect.Slice:
		return value.IsNil()
	default:
		return false
	}
}

func (l *rateLimiter) handle(c *gin.Context) {
	route := c.Request.Method + " " + c.FullPath()
	policy, exists := l.policies[route]
	if !exists {
		c.Next()
		return
	}
	if policy.Limit <= 0 || policy.Window <= 0 {
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"message": "Rate limiter is not configured."})
		return
	}
	identity := remoteIP(c.Request)
	hash := sha256.Sum256([]byte(identity))
	key := redisx.Key(l.service, "ratelimit", hex.EncodeToString(hash[:16])+":"+routeHash(route))
	count, ttl, err := l.increment(c.Request.Context(), key, policy)
	result := "allowed"
	if err != nil {
		count, ttl = l.incrementMemory(key, policy)
		result = "fallback_allowed"
		l.logger.Warn("Redis rate limit unavailable; bounded memory fallback active", "service", l.service, "route", route, "error", err)
	}
	if count > policy.Limit {
		result = "limited"
		if ttl <= 0 {
			ttl = policy.Window
		}
		seconds := int64(ttl.Round(time.Second).Seconds())
		if seconds < 1 {
			seconds = 1
		}
		c.Header("Retry-After", strconv.FormatInt(seconds, 10))
		c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"message": "Too many attempts. Please try again later."})
	}
	rateLimitDecisions.WithLabelValues(l.service, route, result).Inc()
	if !c.IsAborted() {
		c.Next()
	}
}

func (l *rateLimiter) increment(ctx context.Context, key string, policy RatePolicy) (int64, time.Duration, error) {
	if l.redis == nil {
		return 0, 0, redis.ErrClosed
	}
	values, err := incrementScript.Run(ctx, l.redis, []string{key}, policy.Window.Milliseconds()).Slice()
	if err != nil {
		return 0, 0, err
	}
	count, _ := values[0].(int64)
	ttlMilliseconds, _ := values[1].(int64)
	return count, time.Duration(ttlMilliseconds) * time.Millisecond, nil
}

func (l *rateLimiter) incrementMemory(key string, policy RatePolicy) (int64, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	value := l.memory[key]
	if !value.expiresAt.After(now) {
		value = memoryCounter{expiresAt: now.Add(policy.Window)}
	}
	value.count++
	l.memory[key] = value
	l.uses++
	if l.uses%1024 == 0 {
		for currentKey, current := range l.memory {
			if !current.expiresAt.After(now) {
				delete(l.memory, currentKey)
			}
		}
	}
	return value.count, time.Until(value.expiresAt)
}

func remoteIP(request *http.Request) string {
	host, _, err := net.SplitHostPort(request.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	if request.RemoteAddr != "" {
		return request.RemoteAddr
	}
	return "unknown"
}

func routeHash(route string) string {
	hash := sha256.Sum256([]byte(route))
	return hex.EncodeToString(hash[:8])
}
