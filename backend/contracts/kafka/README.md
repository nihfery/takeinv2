# Kafka contracts

Domain topics use stable aggregate partition keys. Producers use idempotence and `acks=all`; mutation-coupled messages originate in a transactional outbox. Consumers commit only after their local transaction and use `inbox_events` for deduplication. Poison messages are copied with sanitized failure metadata to the configured `.dlq` topic after bounded retries.

