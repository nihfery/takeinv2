package kafka

import (
	"testing"

	"github.com/twmb/franz-go/pkg/kgo"
)

func TestProducerOnlyClientOptionsAreValid(t *testing.T) {
	options, err := clientOptions(Config{Brokers: []string{"127.0.0.1:1"}, ClientID: "outbox-worker", MaxRetries: 1})
	if err != nil {
		t.Fatalf("producer-only options: %v", err)
	}
	client, err := kgo.NewClient(options...)
	if err != nil {
		t.Fatalf("producer-only client: %v", err)
	}
	client.Close()
}

func TestConsumerTopicsRequireGroup(t *testing.T) {
	if _, err := clientOptions(Config{Brokers: []string{"127.0.0.1:1"}, Topics: []string{"events"}}); err == nil {
		t.Fatal("expected topics without consumer group to be rejected")
	}
}

func TestConsumerClientOptionsAreValid(t *testing.T) {
	options, err := clientOptions(Config{Brokers: []string{"127.0.0.1:1"}, ClientID: "consumer", ConsumerGroup: "consumer-v1", Topics: []string{"events"}})
	if err != nil {
		t.Fatalf("consumer options: %v", err)
	}
	client, err := kgo.NewClient(options...)
	if err != nil {
		t.Fatalf("consumer client: %v", err)
	}
	client.Close()
}

func TestKafkaSecurityConfigurationIsValidated(t *testing.T) {
	tests := []struct {
		name   string
		config Config
	}{
		{name: "unknown protocol", config: Config{Brokers: []string{"127.0.0.1:1"}, SecurityProtocol: "MAGIC"}},
		{name: "SASL credentials missing", config: Config{Brokers: []string{"127.0.0.1:1"}, SecurityProtocol: "SASL_SSL", SASLMechanism: "PLAIN"}},
		{name: "SASL mechanism unknown", config: Config{Brokers: []string{"127.0.0.1:1"}, SecurityProtocol: "SASL_SSL", SASLMechanism: "UNKNOWN", Username: "user", Password: "secret"}},
		{name: "SASL on plaintext protocol", config: Config{Brokers: []string{"127.0.0.1:1"}, SecurityProtocol: "PLAINTEXT", SASLMechanism: "PLAIN", Username: "user", Password: "secret"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := clientOptions(test.config); err == nil {
				t.Fatal("expected invalid Kafka security configuration to fail")
			}
		})
	}
}

func TestSASLAndTLSClientOptionsAreValid(t *testing.T) {
	options, err := clientOptions(Config{
		Brokers:          []string{"127.0.0.1:1"},
		ClientID:         "secure-client",
		SecurityProtocol: "SASL_SSL",
		SASLMechanism:    "SCRAM-SHA-512",
		Username:         "takein",
		Password:         "not-a-real-secret",
	})
	if err != nil {
		t.Fatalf("secure Kafka options: %v", err)
	}
	client, err := kgo.NewClient(options...)
	if err != nil {
		t.Fatalf("secure Kafka client: %v", err)
	}
	client.Close()
}
