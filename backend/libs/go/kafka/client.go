package kafka

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sasl/plain"
	"github.com/twmb/franz-go/pkg/sasl/scram"
)

var (
	produceTotal  = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "kafka_produce_total", Help: "Kafka records completed by the producer."}, []string{"service", "topic"})
	consumeTotal  = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "kafka_consume_total", Help: "Kafka records buffered for consumption."}, []string{"service", "topic"})
	produceErrors = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "kafka_produce_errors_total", Help: "Kafka producer record errors."}, []string{"service", "topic"})
	consumeErrors = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "kafka_consume_errors_total", Help: "Kafka consumer errors."}, []string{"service", "topic"})
	dlqTotal      = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "kafka_dlq_records_total", Help: "Kafka records written to dead-letter topics."}, []string{"service", "topic"})
	consumerLag   = prometheus.NewGaugeVec(prometheus.GaugeOpts{Name: "kafka_consumer_lag_seconds", Help: "Age of the latest fetched Kafka record, used as a consumer-lag signal."}, []string{"service", "topic", "partition"})
)

func init() {
	prometheus.MustRegister(produceTotal, consumeTotal, produceErrors, consumeErrors, dlqTotal, consumerLag)
}

type metricsHook struct{ service string }

func (h metricsHook) OnProduceRecordUnbuffered(record *kgo.Record, err error) {
	produceTotal.WithLabelValues(h.service, record.Topic).Inc()
	if strings.HasSuffix(record.Topic, ".dlq") {
		dlqTotal.WithLabelValues(h.service, record.Topic).Inc()
	}
	if err != nil {
		produceErrors.WithLabelValues(h.service, record.Topic).Inc()
	}
}

func (h metricsHook) OnFetchRecordBuffered(record *kgo.Record) {
	consumeTotal.WithLabelValues(h.service, record.Topic).Inc()
	if !record.Timestamp.IsZero() {
		lag := time.Since(record.Timestamp).Seconds()
		if lag < 0 {
			lag = 0
		}
		consumerLag.WithLabelValues(h.service, record.Topic, strconv.Itoa(int(record.Partition))).Set(lag)
	}
}

// ObserveConsumeError records a failed fetch or record-processing attempt.
func ObserveConsumeError(service, topic string) {
	consumeErrors.WithLabelValues(service, topic).Inc()
}

type Config struct {
	Brokers          []string
	ClientID         string
	ConsumerGroup    string
	Topics           []string
	MaxRetries       int
	SecurityProtocol string
	SASLMechanism    string
	Username         string
	Password         string
	TLSCAFile        string
	TLSServerName    string
}

func Open(ctx context.Context, cfg Config) (*kgo.Client, error) {
	options, err := clientOptions(cfg)
	if err != nil {
		return nil, err
	}
	client, err := kgo.NewClient(options...)
	if err != nil {
		return nil, fmt.Errorf("create kafka client: %w", err)
	}
	if err := client.Ping(ctx); err != nil {
		client.Close()
		return nil, fmt.Errorf("ping kafka: %w", err)
	}
	return client, nil
}

func clientOptions(cfg Config) ([]kgo.Opt, error) {
	if len(cfg.Brokers) == 0 {
		return nil, fmt.Errorf("create kafka client: at least one broker is required")
	}
	if len(cfg.Topics) > 0 && cfg.ConsumerGroup == "" {
		return nil, fmt.Errorf("create kafka client: consumer topics require a consumer group")
	}
	protocol := strings.ToUpper(strings.TrimSpace(cfg.SecurityProtocol))
	if protocol == "" {
		protocol = "PLAINTEXT"
	}
	usesTLS := protocol == "SSL" || protocol == "SASL_SSL"
	usesSASL := protocol == "SASL_PLAINTEXT" || protocol == "SASL_SSL"
	if !usesTLS && !usesSASL && protocol != "PLAINTEXT" {
		return nil, fmt.Errorf("create kafka client: unsupported security protocol %q", protocol)
	}
	options := []kgo.Opt{
		kgo.SeedBrokers(cfg.Brokers...),
		kgo.ClientID(cfg.ClientID),
		kgo.RequiredAcks(kgo.AllISRAcks()),
		kgo.ProducerBatchCompression(kgo.ZstdCompression()),
		kgo.ProducerLinger(5 * time.Millisecond),
		kgo.RecordRetries(cfg.MaxRetries),
		kgo.WithHooks(metricsHook{service: cfg.ClientID}),
	}
	if usesTLS {
		tlsConfig := &tls.Config{MinVersion: tls.VersionTLS12, ServerName: strings.TrimSpace(cfg.TLSServerName)}
		if path := strings.TrimSpace(cfg.TLSCAFile); path != "" {
			certificate, err := os.ReadFile(path)
			if err != nil {
				return nil, fmt.Errorf("create kafka client: read TLS CA file: %w", err)
			}
			roots, err := x509.SystemCertPool()
			if err != nil || roots == nil {
				roots = x509.NewCertPool()
			}
			if !roots.AppendCertsFromPEM(certificate) {
				return nil, fmt.Errorf("create kafka client: TLS CA file did not contain a valid certificate")
			}
			tlsConfig.RootCAs = roots
		}
		options = append(options, kgo.DialTLSConfig(tlsConfig))
	}
	if usesSASL {
		username := strings.TrimSpace(cfg.Username)
		if username == "" || cfg.Password == "" {
			return nil, fmt.Errorf("create kafka client: SASL username and password are required")
		}
		switch strings.ToUpper(strings.TrimSpace(cfg.SASLMechanism)) {
		case "PLAIN":
			options = append(options, kgo.SASL(plain.Auth{User: username, Pass: cfg.Password}.AsMechanism()))
		case "SCRAM-SHA-256":
			options = append(options, kgo.SASL(scram.Auth{User: username, Pass: cfg.Password}.AsSha256Mechanism()))
		case "SCRAM-SHA-512":
			options = append(options, kgo.SASL(scram.Auth{User: username, Pass: cfg.Password}.AsSha512Mechanism()))
		default:
			return nil, fmt.Errorf("create kafka client: unsupported SASL mechanism %q", cfg.SASLMechanism)
		}
	} else if cfg.SASLMechanism != "" || cfg.Username != "" || cfg.Password != "" {
		return nil, fmt.Errorf("create kafka client: SASL settings require SASL_PLAINTEXT or SASL_SSL")
	}
	if cfg.ConsumerGroup != "" {
		options = append(options, kgo.ConsumerGroup(cfg.ConsumerGroup), kgo.DisableAutoCommit())
	}
	if len(cfg.Topics) > 0 {
		options = append(options, kgo.ConsumeTopics(cfg.Topics...))
	}
	return options, nil
}
