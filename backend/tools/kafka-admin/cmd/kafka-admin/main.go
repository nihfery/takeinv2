package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"gopkg.in/yaml.v3"
)

type manifest struct {
	Topics []struct {
		Name       string `yaml:"name"`
		Partitions int32  `yaml:"partitions"`
	} `yaml:"topics"`
}

func main() {
	brokers := flag.String("brokers", "127.0.0.1:29092", "comma-separated bootstrap brokers")
	manifestPath := flag.String("manifest", "contracts/kafka/topics.yaml", "topic manifest")
	withDLQ := flag.Bool("with-dlq", true, "create a DLQ for every domain topic")
	flag.Parse()

	data, err := os.ReadFile(*manifestPath)
	check(err)
	var config manifest
	check(yaml.Unmarshal(data, &config))
	if len(config.Topics) == 0 {
		check(fmt.Errorf("topic manifest is empty"))
	}

	client, err := kgo.NewClient(kgo.SeedBrokers(split(*brokers)...), kgo.ClientID("takein-kafka-admin"))
	check(err)
	defer client.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	check(client.Ping(ctx))

	type requestedTopic struct {
		name       string
		partitions int32
	}
	requests := make([]requestedTopic, 0, len(config.Topics)*2)
	seen := make(map[string]struct{})
	for _, topic := range config.Topics {
		if topic.Name == "" || topic.Partitions < 1 {
			check(fmt.Errorf("invalid topic entry: %q partitions=%d", topic.Name, topic.Partitions))
		}
		if _, duplicate := seen[topic.Name]; duplicate {
			check(fmt.Errorf("duplicate topic %s", topic.Name))
		}
		seen[topic.Name] = struct{}{}
		requests = append(requests, requestedTopic{name: topic.Name, partitions: topic.Partitions})
		if *withDLQ {
			requests = append(requests, requestedTopic{name: topic.Name + ".dlq", partitions: topic.Partitions})
		}
	}
	admin := kadm.NewClient(client)
	names := make([]string, 0, len(requests))
	for _, request := range requests {
		responses, err := admin.CreateTopics(ctx, request.partitions, 1, nil, request.name)
		check(err)
		for name, response := range responses {
			if response.Err != nil && !strings.Contains(strings.ToLower(response.Err.Error()), "already exists") {
				check(fmt.Errorf("create %s: %w", name, response.Err))
			}
			names = append(names, name)
		}
	}
	sort.Strings(names)
	fmt.Printf("Kafka topics ready: %d\n", len(names))
}

func split(value string) []string {
	parts := strings.Split(value, ",")
	result := parts[:0]
	for _, part := range parts {
		if part = strings.TrimSpace(part); part != "" {
			result = append(result, part)
		}
	}
	return result
}

func check(err error) {
	if err == nil {
		return
	}
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
