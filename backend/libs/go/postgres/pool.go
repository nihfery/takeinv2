package postgres

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
)

type poolCollector struct {
	mu    sync.RWMutex
	pools map[string]*pgxpool.Pool
	desc  map[string]*prometheus.Desc
}

var metricsCollector = newPoolCollector()

func newPoolCollector() *poolCollector {
	labels := []string{"service"}
	return &poolCollector{
		pools: make(map[string]*pgxpool.Pool),
		desc: map[string]*prometheus.Desc{
			"acquired": prometheus.NewDesc("db_pool_acquired", "Currently acquired PostgreSQL connections.", labels, nil),
			"idle":     prometheus.NewDesc("db_pool_idle", "Currently idle PostgreSQL connections.", labels, nil),
			"max":      prometheus.NewDesc("db_pool_max", "Maximum PostgreSQL pool connections.", labels, nil),
			"wait":     prometheus.NewDesc("db_pool_wait_duration", "Cumulative time waiting for a PostgreSQL connection in seconds.", labels, nil),
		},
	}
}

func init() { prometheus.MustRegister(metricsCollector) }

func (c *poolCollector) Describe(ch chan<- *prometheus.Desc) {
	for _, desc := range c.desc {
		ch <- desc
	}
}

func (c *poolCollector) Collect(ch chan<- prometheus.Metric) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for service, pool := range c.pools {
		stats := pool.Stat()
		ch <- prometheus.MustNewConstMetric(c.desc["acquired"], prometheus.GaugeValue, float64(stats.AcquiredConns()), service)
		ch <- prometheus.MustNewConstMetric(c.desc["idle"], prometheus.GaugeValue, float64(stats.IdleConns()), service)
		ch <- prometheus.MustNewConstMetric(c.desc["max"], prometheus.GaugeValue, float64(stats.MaxConns()), service)
		ch <- prometheus.MustNewConstMetric(c.desc["wait"], prometheus.GaugeValue, stats.AcquireDuration().Seconds(), service)
	}
}

// RegisterMetrics exposes pgxpool statistics for the service process.
func RegisterMetrics(service string, pool *pgxpool.Pool) {
	metricsCollector.mu.Lock()
	metricsCollector.pools[service] = pool
	metricsCollector.mu.Unlock()
}

type PoolConfig struct {
	DSN               string
	MaxConns          int32
	MinConns          int32
	MaxConnLifetime   time.Duration
	MaxConnIdleTime   time.Duration
	HealthCheckPeriod time.Duration
	ConnectTimeout    time.Duration
}

func Open(ctx context.Context, input PoolConfig) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(input.DSN)
	if err != nil {
		return nil, fmt.Errorf("parse postgres config: %w", err)
	}
	if input.MaxConns > 0 {
		config.MaxConns = input.MaxConns
	}
	if input.MinConns >= 0 {
		config.MinConns = input.MinConns
	}
	if input.MaxConnLifetime > 0 {
		config.MaxConnLifetime = input.MaxConnLifetime
	}
	if input.MaxConnIdleTime > 0 {
		config.MaxConnIdleTime = input.MaxConnIdleTime
	}
	if input.HealthCheckPeriod > 0 {
		config.HealthCheckPeriod = input.HealthCheckPeriod
	}
	if input.ConnectTimeout > 0 {
		config.ConnConfig.ConnectTimeout = input.ConnectTimeout
	}
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("open postgres pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return pool, nil
}
