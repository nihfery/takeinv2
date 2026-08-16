package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Runtime struct {
	Environment             string
	ServiceName             string
	ServiceVersion          string
	HTTPAddr                string
	GRPCAddr                string
	LogLevel                string
	PostgresDSN             string
	PostgresMaxConns        int
	PostgresMinConns        int
	PostgresMaxConnLifetime time.Duration
	PostgresMaxConnIdleTime time.Duration
	PostgresHealthCheck     time.Duration
	PostgresConnectTimeout  time.Duration
	RedisAddr               string
	RedisPassword           string
	RedisDB                 int
	KafkaBrokers            []string
	KafkaSecurityProtocol   string
	KafkaSASLMechanism      string
	KafkaUsername           string
	KafkaPassword           string
	KafkaTLSCAFile          string
	KafkaTLSServerName      string
	KafkaMaxRetries         int
	KafkaConsumerMaxRetries int
	ShutdownTimeout         time.Duration
	RequestTimeout          time.Duration
	CORSOrigins             []string
	OTLPEndpoint            string
}

func LoadRuntime(defaultService string) (Runtime, error) {
	if err := validateKnownOverrides(); err != nil {
		return Runtime{}, err
	}
	r := Runtime{
		Environment:             String("APP_ENV", "local"),
		ServiceName:             String("SERVICE_NAME", defaultService),
		ServiceVersion:          String("SERVICE_VERSION", "dev"),
		HTTPAddr:                String("HTTP_ADDR", ":8080"),
		GRPCAddr:                String("GRPC_ADDR", ":9090"),
		LogLevel:                String("LOG_LEVEL", "info"),
		PostgresDSN:             strings.TrimSpace(os.Getenv("POSTGRES_DSN")),
		PostgresMaxConns:        Int("POSTGRES_MAX_CONNS", 10),
		PostgresMinConns:        Int("POSTGRES_MIN_CONNS", 1),
		PostgresMaxConnLifetime: Duration("POSTGRES_MAX_CONN_LIFETIME", 30*time.Minute),
		PostgresMaxConnIdleTime: Duration("POSTGRES_MAX_CONN_IDLE_TIME", 5*time.Minute),
		PostgresHealthCheck:     Duration("POSTGRES_HEALTH_CHECK_PERIOD", 30*time.Second),
		PostgresConnectTimeout:  Duration("POSTGRES_CONNECT_TIMEOUT", 5*time.Second),
		RedisAddr:               String("REDIS_ADDR", "127.0.0.1:6379"),
		RedisPassword:           os.Getenv("REDIS_PASSWORD"),
		RedisDB:                 Int("REDIS_DB", 0),
		KafkaBrokers:            CSV("KAFKA_BROKERS", "127.0.0.1:9092"),
		KafkaSecurityProtocol:   strings.ToUpper(String("KAFKA_SECURITY_PROTOCOL", "PLAINTEXT")),
		KafkaSASLMechanism:      strings.ToUpper(strings.TrimSpace(os.Getenv("KAFKA_SASL_MECHANISM"))),
		KafkaUsername:           strings.TrimSpace(os.Getenv("KAFKA_USERNAME")),
		KafkaPassword:           os.Getenv("KAFKA_PASSWORD"),
		KafkaTLSCAFile:          strings.TrimSpace(os.Getenv("KAFKA_TLS_CA_FILE")),
		KafkaTLSServerName:      strings.TrimSpace(os.Getenv("KAFKA_TLS_SERVER_NAME")),
		KafkaMaxRetries:         Int("KAFKA_MAX_RETRIES", 10),
		KafkaConsumerMaxRetries: Int("KAFKA_CONSUMER_MAX_RETRIES", 5),
		ShutdownTimeout:         Duration("SHUTDOWN_TIMEOUT", 20*time.Second),
		RequestTimeout:          Duration("REQUEST_TIMEOUT", 15*time.Second),
		CORSOrigins:             CSV("CORS_ALLOWED_ORIGINS", "http://127.0.0.1:5173,http://127.0.0.1:5174"),
		OTLPEndpoint:            strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")),
	}
	if r.ServiceName == "" {
		return Runtime{}, errors.New("SERVICE_NAME must not be empty")
	}
	if r.Environment != "test" && r.PostgresDSN == "" {
		return Runtime{}, errors.New("POSTGRES_DSN is required outside tests")
	}
	if len(r.KafkaBrokers) == 0 {
		return Runtime{}, errors.New("KAFKA_BROKERS must not be empty")
	}
	if r.PostgresMinConns > r.PostgresMaxConns {
		return Runtime{}, errors.New("POSTGRES_MIN_CONNS must not exceed POSTGRES_MAX_CONNS")
	}
	if err := validateKafkaSecurity(r); err != nil {
		return Runtime{}, err
	}
	return r, nil
}

func validateKafkaSecurity(r Runtime) error {
	switch r.KafkaSecurityProtocol {
	case "PLAINTEXT", "SSL", "SASL_PLAINTEXT", "SASL_SSL":
	default:
		return fmt.Errorf("KAFKA_SECURITY_PROTOCOL must be PLAINTEXT, SSL, SASL_PLAINTEXT, or SASL_SSL")
	}
	usesSASL := strings.HasPrefix(r.KafkaSecurityProtocol, "SASL_")
	if !usesSASL {
		if r.KafkaSASLMechanism != "" || r.KafkaUsername != "" || r.KafkaPassword != "" {
			return errors.New("kafka SASL settings require KAFKA_SECURITY_PROTOCOL=SASL_PLAINTEXT or SASL_SSL")
		}
		return nil
	}
	switch r.KafkaSASLMechanism {
	case "PLAIN", "SCRAM-SHA-256", "SCRAM-SHA-512":
	default:
		return errors.New("KAFKA_SASL_MECHANISM must be PLAIN, SCRAM-SHA-256, or SCRAM-SHA-512 for SASL")
	}
	if r.KafkaUsername == "" || r.KafkaPassword == "" {
		return errors.New("KAFKA_USERNAME and KAFKA_PASSWORD are required for SASL")
	}
	return nil
}

func validateKnownOverrides() error {
	positiveDurations := []string{
		"SHUTDOWN_TIMEOUT", "REQUEST_TIMEOUT", "POSTGRES_CONNECT_TIMEOUT", "POSTGRES_MAX_CONN_LIFETIME",
		"POSTGRES_MAX_CONN_IDLE_TIME", "POSTGRES_HEALTH_CHECK_PERIOD", "GRPC_CLIENT_TIMEOUT", "MIDTRANS_TIMEOUT",
		"REDIS_CONNECT_TIMEOUT", "ACCESS_TOKEN_TTL", "REFRESH_TOKEN_TTL", "PAYMENT_EXPIRY_INTERVAL",
		"HOLD_EXPIRY_INTERVAL", "OUTBOX_POLL_INTERVAL",
	}
	for _, name := range positiveDurations {
		value := strings.TrimSpace(os.Getenv(name))
		if value == "" {
			continue
		}
		parsed, err := time.ParseDuration(value)
		if err != nil || parsed <= 0 {
			return fmt.Errorf("%s must be a positive duration", name)
		}
	}
	nonNegativeIntegers := []string{"POSTGRES_MIN_CONNS", "REDIS_DB", "KAFKA_MAX_RETRIES", "KAFKA_CONSUMER_MAX_RETRIES"}
	for _, name := range nonNegativeIntegers {
		if err := validateInteger(name, 0); err != nil {
			return err
		}
	}
	positiveIntegers := []string{
		"POSTGRES_MAX_CONNS", "OUTBOX_BATCH_SIZE", "GRPC_MAX_RECV_BYTES", "GRPC_MAX_SEND_BYTES",
		"RATE_LIMIT_WEBHOOK", "RATE_LIMIT_MANUAL_CONFIRM", "RATE_LIMIT_REGISTER", "RATE_LIMIT_LOGIN", "RATE_LIMIT_REFRESH",
	}
	for _, name := range positiveIntegers {
		if err := validateInteger(name, 1); err != nil {
			return err
		}
	}
	if value := strings.TrimSpace(os.Getenv("PAYMENT_ALLOW_MANUAL_CONFIRMATION")); value != "" {
		if _, err := strconv.ParseBool(value); err != nil {
			return errors.New("PAYMENT_ALLOW_MANUAL_CONFIRMATION must be true or false")
		}
	}
	return nil
}

func validateInteger(name string, minimum int) error {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < minimum {
		return fmt.Errorf("%s must be an integer greater than or equal to %d", name, minimum)
	}
	return nil
}

func String(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func Required(name string) (string, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return "", fmt.Errorf("%s is required", name)
	}
	return value, nil
}

func Duration(name string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func Int(name string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(os.Getenv(name)))
	if err != nil {
		return fallback
	}
	return value
}

func Bool(name string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func CSV(name, fallback string) []string {
	value := String(name, fallback)
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if _, exists := seen[part]; exists {
			continue
		}
		seen[part] = struct{}{}
		result = append(result, part)
	}
	return result
}
