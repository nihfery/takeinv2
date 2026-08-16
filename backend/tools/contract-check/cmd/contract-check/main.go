package main

import (
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

var methods = map[string]struct{}{
	"get": {}, "post": {}, "put": {}, "patch": {}, "delete": {}, "options": {}, "head": {}, "trace": {},
}

type operation struct {
	Method      string
	Path        string
	OperationID string
	Document    string
	Service     string
}

type ownershipDocument struct {
	Rules []struct {
		Service   string `yaml:"service"`
		PathRegex string `yaml:"path_regex"`
	} `yaml:"rules"`
}

type compiledRule struct {
	service string
	pattern *regexp.Regexp
}

type routeDocument struct {
	Version int          `yaml:"version"`
	Routes  []routeEntry `yaml:"routes"`
}

type routeEntry struct {
	Service string `yaml:"service"`
	Method  string `yaml:"method"`
	Path    string `yaml:"path"`
}

type topicDocument struct {
	Version int `yaml:"version"`
	Topics  []struct {
		Name       string `yaml:"name"`
		Partitions int    `yaml:"partitions"`
		Key        string `yaml:"key"`
	} `yaml:"topics"`
}

type consumerDocument struct {
	Version   int `yaml:"version"`
	Consumers []struct {
		Group   string   `yaml:"group"`
		Service string   `yaml:"service"`
		Topics  []string `yaml:"topics"`
		Inbox   bool     `yaml:"inbox"`
		DLQ     string   `yaml:"dlq"`
		DLQs    []string `yaml:"dlqs"`
	} `yaml:"consumers"`
}

func main() {
	openapiDir := flag.String("openapi", "contracts/openapi/v1", "directory containing split OpenAPI documents")
	ownershipPath := flag.String("ownership", "contracts/openapi/service-ownership.yaml", "service ownership mapping")
	routesPath := flag.String("routes", "contracts/openapi/go-routes.yaml", "Go route registry; checked when present")
	topicsPath := flag.String("topics", "contracts/kafka/topics.yaml", "Kafka topic manifest")
	consumersPath := flag.String("consumers", "contracts/kafka/consumers.yaml", "Kafka consumer manifest")
	writeRoutes := flag.Bool("write-routes", false, "generate the Go route registry from validated OpenAPI ownership")
	flag.Parse()

	operations, err := loadOperations(*openapiDir)
	if err != nil {
		fatal(err)
	}
	rules, err := loadOwnership(*ownershipPath)
	if err != nil {
		fatal(err)
	}
	for index := range operations {
		owners := make([]string, 0, 1)
		for _, rule := range rules {
			if rule.pattern.MatchString(operations[index].Path) {
				owners = append(owners, rule.service)
			}
		}
		if len(owners) != 1 {
			fatal(fmt.Errorf("%s %s must have exactly one owner, got %v", operations[index].Method, operations[index].Path, owners))
		}
		operations[index].Service = owners[0]
	}
	if *writeRoutes {
		if err := writeRouteRegistry(*routesPath, operations); err != nil {
			fatal(err)
		}
	}
	if _, err := os.Stat(*routesPath); err == nil {
		if err := checkRoutes(*routesPath, operations); err != nil {
			fatal(err)
		}
	} else if !errors.Is(err, fs.ErrNotExist) {
		fatal(err)
	}
	topicCount, consumerCount, err := checkKafkaContracts(*topicsPath, *consumersPath)
	if err != nil {
		fatal(err)
	}

	counts := make(map[string]int)
	for _, item := range operations {
		counts[item.Service]++
	}
	services := make([]string, 0, len(counts))
	for service := range counts {
		services = append(services, service)
	}
	sort.Strings(services)
	fmt.Printf("contract check passed: %d operations\n", len(operations))
	for _, service := range services {
		fmt.Printf(" - %s: %d\n", service, counts[service])
	}
	fmt.Printf(" - Kafka: %d domain topics, %d consumers, %d topics including DLQs\n", topicCount, consumerCount, topicCount*2)
}

func checkKafkaContracts(topicsPath, consumersPath string) (int, int, error) {
	data, err := os.ReadFile(topicsPath)
	if err != nil {
		return 0, 0, err
	}
	var topics topicDocument
	if err := yaml.Unmarshal(data, &topics); err != nil {
		return 0, 0, fmt.Errorf("parse Kafka topics: %w", err)
	}
	if topics.Version != 1 || len(topics.Topics) == 0 {
		return 0, 0, errors.New("kafka topic manifest must be version 1 and non-empty")
	}
	validTopic := regexp.MustCompile(`^takein\.[a-z0-9-]+\.events\.v[1-9][0-9]*$`)
	knownTopics := make(map[string]struct{}, len(topics.Topics))
	for _, topic := range topics.Topics {
		if !validTopic.MatchString(topic.Name) {
			return 0, 0, fmt.Errorf("invalid Kafka topic name %q", topic.Name)
		}
		if _, duplicate := knownTopics[topic.Name]; duplicate {
			return 0, 0, fmt.Errorf("duplicate Kafka topic %s", topic.Name)
		}
		if topic.Partitions <= 0 || strings.TrimSpace(topic.Key) == "" {
			return 0, 0, fmt.Errorf("kafka topic %s requires positive partitions and a message key", topic.Name)
		}
		knownTopics[topic.Name] = struct{}{}
	}

	data, err = os.ReadFile(consumersPath)
	if err != nil {
		return 0, 0, err
	}
	var consumers consumerDocument
	if err := yaml.Unmarshal(data, &consumers); err != nil {
		return 0, 0, fmt.Errorf("parse Kafka consumers: %w", err)
	}
	if consumers.Version != 1 || len(consumers.Consumers) == 0 {
		return 0, 0, errors.New("kafka consumer manifest must be version 1 and non-empty")
	}
	groups := make(map[string]struct{}, len(consumers.Consumers))
	for _, consumer := range consumers.Consumers {
		if strings.TrimSpace(consumer.Group) == "" || !strings.HasSuffix(consumer.Service, "-service") {
			return 0, 0, errors.New("kafka consumer requires a group and a service ending in -service")
		}
		if _, duplicate := groups[consumer.Group]; duplicate {
			return 0, 0, fmt.Errorf("duplicate Kafka consumer group %s", consumer.Group)
		}
		groups[consumer.Group] = struct{}{}
		if !consumer.Inbox || len(consumer.Topics) == 0 {
			return 0, 0, fmt.Errorf("kafka consumer %s requires inbox dedup and at least one topic", consumer.Group)
		}
		seen := make(map[string]struct{}, len(consumer.Topics))
		for _, topic := range consumer.Topics {
			if _, exists := knownTopics[topic]; !exists {
				return 0, 0, fmt.Errorf("kafka consumer %s references unknown topic %s", consumer.Group, topic)
			}
			if _, duplicate := seen[topic]; duplicate {
				return 0, 0, fmt.Errorf("kafka consumer %s repeats topic %s", consumer.Group, topic)
			}
			seen[topic] = struct{}{}
		}
		dlqs := append([]string(nil), consumer.DLQs...)
		if consumer.DLQ != "" {
			dlqs = append(dlqs, consumer.DLQ)
		}
		if len(dlqs) == 0 {
			return 0, 0, fmt.Errorf("kafka consumer %s requires at least one DLQ", consumer.Group)
		}
		configuredDLQ := make(map[string]bool, len(dlqs))
		for _, dlq := range dlqs {
			dlqBase := strings.TrimSuffix(dlq, ".dlq")
			if dlqBase == dlq {
				return 0, 0, fmt.Errorf("kafka consumer %s has invalid DLQ %s", consumer.Group, dlq)
			}
			if _, exists := knownTopics[dlqBase]; !exists {
				return 0, 0, fmt.Errorf("kafka consumer %s DLQ base topic is unknown: %s", consumer.Group, dlqBase)
			}
			configuredDLQ[dlq] = true
		}
		for _, topic := range consumer.Topics {
			if !configuredDLQ[topic+".dlq"] {
				return 0, 0, fmt.Errorf("kafka consumer %s requires source DLQ %s", consumer.Group, topic+".dlq")
			}
		}
	}
	return len(topics.Topics), len(consumers.Consumers), nil
}

func writeRouteRegistry(path string, operations []operation) error {
	sort.Slice(operations, func(i, j int) bool {
		if operations[i].Service != operations[j].Service {
			return operations[i].Service < operations[j].Service
		}
		if operations[i].Path != operations[j].Path {
			return operations[i].Path < operations[j].Path
		}
		return operations[i].Method < operations[j].Method
	})
	document := routeDocument{Version: 1, Routes: make([]routeEntry, 0, len(operations))}
	for _, item := range operations {
		document.Routes = append(document.Routes, routeEntry{Service: item.Service, Method: item.Method, Path: item.Path})
	}
	data, err := yaml.Marshal(document)
	if err != nil {
		return err
	}
	return os.WriteFile(path, append([]byte("# Generated from validated OpenAPI ownership; do not edit by hand.\n"), data...), 0o644)
}

func loadOperations(directory string) ([]operation, error) {
	files, err := filepath.Glob(filepath.Join(directory, "*.yaml"))
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("no OpenAPI documents found in %s", directory)
	}
	seenIDs := make(map[string]string)
	seenRoutes := make(map[string]string)
	result := make([]operation, 0, 128)
	for _, path := range files {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		var document map[string]any
		if err := yaml.Unmarshal(data, &document); err != nil {
			return nil, fmt.Errorf("parse %s: %w", path, err)
		}
		if document["openapi"] == nil {
			return nil, fmt.Errorf("%s has no openapi version", path)
		}
		base := "/api"
		if servers, ok := document["servers"].([]any); ok && len(servers) > 0 {
			if first, ok := servers[0].(map[string]any); ok {
				if raw, ok := first["url"].(string); ok {
					if parsed, parseErr := url.Parse(raw); parseErr == nil && parsed.Path != "" {
						base = strings.TrimSuffix(parsed.Path, "/")
					}
				}
			}
		}
		paths, ok := document["paths"].(map[string]any)
		if !ok {
			return nil, fmt.Errorf("%s has no paths object", path)
		}
		for route, rawItem := range paths {
			item, ok := rawItem.(map[string]any)
			if !ok {
				continue
			}
			for method, rawOperation := range item {
				method = strings.ToLower(method)
				if _, ok := methods[method]; !ok {
					continue
				}
				operationMap, ok := rawOperation.(map[string]any)
				if !ok {
					continue
				}
				operationID, _ := operationMap["operationId"].(string)
				if operationID == "" {
					return nil, fmt.Errorf("%s %s in %s has no operationId", method, route, path)
				}
				if prior, duplicate := seenIDs[operationID]; duplicate {
					return nil, fmt.Errorf("duplicate operationId %s in %s and %s", operationID, prior, path)
				}
				canonicalPath := base + route
				key := strings.ToUpper(method) + " " + canonicalPath
				if prior, duplicate := seenRoutes[key]; duplicate {
					return nil, fmt.Errorf("duplicate route %s in %s and %s", key, prior, path)
				}
				seenIDs[operationID] = path
				seenRoutes[key] = path
				result = append(result, operation{Method: strings.ToUpper(method), Path: canonicalPath, OperationID: operationID, Document: filepath.Base(path)})
			}
		}
	}
	return result, nil
}

func loadOwnership(path string) ([]compiledRule, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var document ownershipDocument
	if err := yaml.Unmarshal(data, &document); err != nil {
		return nil, err
	}
	result := make([]compiledRule, 0, len(document.Rules))
	for _, rule := range document.Rules {
		if rule.Service == "" || rule.PathRegex == "" {
			return nil, errors.New("ownership rule requires service and path_regex")
		}
		pattern, err := regexp.Compile(rule.PathRegex)
		if err != nil {
			return nil, fmt.Errorf("compile ownership rule for %s: %w", rule.Service, err)
		}
		result = append(result, compiledRule{service: rule.Service, pattern: pattern})
	}
	return result, nil
}

func checkRoutes(path string, operations []operation) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var document routeDocument
	if err := yaml.Unmarshal(data, &document); err != nil {
		return err
	}
	registered := make(map[string]string, len(document.Routes))
	for _, route := range document.Routes {
		key := strings.ToUpper(route.Method) + " " + route.Path
		if prior, duplicate := registered[key]; duplicate {
			return fmt.Errorf("duplicate Go route %s for %s and %s", key, prior, route.Service)
		}
		registered[key] = route.Service
	}
	for _, item := range operations {
		key := item.Method + " " + item.Path
		service, exists := registered[key]
		if !exists {
			return fmt.Errorf("migrated OpenAPI route missing from Go registry: %s", key)
		}
		if service != item.Service {
			return fmt.Errorf("route %s registered to %s, ownership says %s", key, service, item.Service)
		}
	}
	if len(registered) != len(operations) {
		return fmt.Errorf("go route registry has %d routes but OpenAPI has %d; incompatible extras are forbidden", len(registered), len(operations))
	}
	return nil
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "contract check failed:", err)
	os.Exit(1)
}
