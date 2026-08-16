# SLO and alert foundation

This repository defines measurable alert primitives without claiming production SLOs that have not been approved or observed in production.

## Implemented signals

- Availability: Prometheus scrape health for every Go API and worker.
- HTTP errors: per-service five-minute HTTP 5xx ratio.
- HTTP latency: per-service five-minute p95 and p99 duration.
- gRPC error ratio.
- PostgreSQL connection-pool saturation.
- Kafka producer errors, consumer event-age lag, and DLQ growth.
- Transactional outbox pending and terminal-failure counts.
- Booking conflict anomaly, payment webhook failure/invalid-signature spike,
  and authentication failure spike.
- Host disk usage through node-exporter.
- Correlation and tracing: request/correlation IDs and OpenTelemetry trace export through the collector.

The initial thresholds in `backend/infra/observability/prometheus/rules` are operational
safeguards, not contractual SLOs. They must be tuned from staging/load evidence.

## Required before production cutover

The platform owner must approve availability, latency, error-budget, Kafka lag,
outbox/DLQ, and capacity objectives after staging load evidence exists. Alert
notification routing, on-call escalation ownership, managed-service alerts, and
an explicit Redis dependency signal must be configured in the approved
production observability platform.

Until those items are complete, observability supports local and staging diagnosis but is not evidence of production SLO readiness.
