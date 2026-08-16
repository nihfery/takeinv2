SHELL := /bin/sh
GO ?= go
COMPOSE := docker compose -f docker-compose.yml
LOCAL_COMPOSE := $(COMPOSE) -f docker-compose.local.yml
MODULES := gen/go libs/go services/identity-service services/customer-service services/provider-service services/catalog-service services/booking-service services/payment-service services/billing-service services/notification-service services/chat-service services/media-service services/audit-service tools/contract-check tools/kafka-admin tools/schema-migrator tools/testdb
DOMAINS := identity customer provider catalog booking payment billing notification chat media audit
GO_RUNTIME_SERVICES := $(foreach domain,$(DOMAINS),takein-$(domain)-api takein-$(domain)-worker)

.PHONY: bootstrap generate format lint vet vuln test test-race test-integration test-local-env test-e2e contract build docker-build scan-images up up-local down logs migrate migrate-status create-topics smoke deploy-preflight verify ci

bootstrap:
	$(GO) install github.com/bufbuild/buf/cmd/buf@v1.72.0
	$(GO) install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.10
	$(GO) install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.6.2
	$(GO) install github.com/sqlc-dev/sqlc/cmd/sqlc@v1.31.1
	$(GO) install github.com/pressly/goose/v3/cmd/goose@v3.27.3
	$(GO) install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.12.2
	$(GO) install golang.org/x/vuln/cmd/govulncheck@v1.7.0

generate:
	buf lint
	buf generate
	@for module in $$(find services -mindepth 1 -maxdepth 1 -type d | sort); do (cd $$module && sqlc generate); done
	$(GO) work sync

format:
	@files=$$(find gen libs services tools -name '*.go' -type f); test -z "$$files" || gofmt -w $$files

lint:
	@for module in $(MODULES); do (cd $$module && golangci-lint run ./...) || exit $$?; done
	@cd tests/e2e && GOWORK=off golangci-lint run ./...

vet:
	@for module in $(MODULES); do (cd $$module && $(GO) vet ./...) || exit $$?; done
	@cd tests/e2e && GOWORK=off $(GO) vet ./...

vuln:
	@for module in $(MODULES); do (cd $$module && govulncheck ./...) || exit $$?; done
	@cd tests/e2e && GOWORK=off govulncheck ./...

test:
	@for module in $(MODULES); do (cd $$module && $(GO) test -count=1 ./...) || exit $$?; done
	@cd tests/e2e && GOWORK=off $(GO) test -count=1 ./...

test-race:
	@cd services/catalog-service && CGO_ENABLED=1 $(GO) test -race ./internal/catalog ./internal/persistence/postgres
	@cd services/booking-service && CGO_ENABLED=1 $(GO) test -race ./internal/booking ./internal/persistence/postgres
	@cd services/payment-service && CGO_ENABLED=1 $(GO) test -race ./internal/payment ./internal/persistence/postgres

test-integration:
	@sh scripts/go/test-integration.sh

test-local-env:
	@bash scripts/go/test-local-env-runtime.sh

test-e2e:
	@sh scripts/go/e2e.sh

contract:
	buf lint
	buf breaking --against contracts/proto/baseline.binpb
	$(GO) run ./tools/contract-check/cmd/contract-check

build:
	@for service in $$(find services -mindepth 1 -maxdepth 1 -type d | sort); do (cd $$service && $(GO) build ./cmd/...) || exit $$?; done

docker-build:
	@sh scripts/go/build-runtime.sh

scan-images:
	@sh scripts/go/scan-images.sh

up:
	COMPOSE_PARALLEL_LIMIT=$${COMPOSE_PARALLEL_LIMIT:-2} $(COMPOSE) --profile go-core up -d --wait takein-postgres takein-redis takein-kafka
	$(MAKE) migrate create-topics
	$(MAKE) docker-build
	COMPOSE_PARALLEL_LIMIT=$${COMPOSE_PARALLEL_LIMIT:-2} $(COMPOSE) --profile go-core --profile go-services --profile go-workers --profile observability up -d --no-build takein-object-storage takein-midtrans-mock takein-edge takein-identity-api takein-customer-api takein-provider-api takein-catalog-api takein-booking-api takein-payment-api takein-billing-api takein-notification-api takein-chat-api takein-media-api takein-audit-api takein-identity-worker takein-customer-worker takein-provider-worker takein-catalog-worker takein-booking-worker takein-payment-worker takein-billing-worker takein-notification-worker takein-chat-worker takein-media-worker takein-audit-worker prometheus grafana loki otel-collector

up-local: up
	COMPOSE_PARALLEL_LIMIT=$${COMPOSE_PARALLEL_LIMIT:-2} $(LOCAL_COMPOSE) --profile go-core --profile go-services --profile go-workers up -d --no-build --no-deps $(GO_RUNTIME_SERVICES)

down:
	$(COMPOSE) --profile go-core --profile go-services --profile go-workers --profile observability down

logs:
	$(COMPOSE) logs -f --tail=200

migrate:
	@sh scripts/go/migrate.sh

migrate-status:
	@sh scripts/go/migrate.sh status

create-topics:
	$(GO) run ./tools/kafka-admin/cmd/kafka-admin --brokers 127.0.0.1:$${TAKEIN_KAFKA_PORT:-29092}

smoke:
	@sh scripts/go/smoke.sh

deploy-preflight:
	@test -n "$(ENV_FILE)" || (echo "ENV_FILE is required" >&2; exit 2)
	@test -n "$(DEPLOY_ENVIRONMENT)" || (echo "DEPLOY_ENVIRONMENT is required" >&2; exit 2)
	@test -n "$(DEPLOY_SHA)" || (echo "DEPLOY_SHA is required" >&2; exit 2)
	@bash tools/ci/validate-go-runtime-env.sh "$(ENV_FILE)" "$(DEPLOY_ENVIRONMENT)" "$(DEPLOY_SHA)"

verify: generate contract vet test build

ci: verify test-race test-integration docker-build smoke
