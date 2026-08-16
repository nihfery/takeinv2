# Kafka admin tool

Create the local domain and DLQ topics from the committed manifest:

```text
go run ./tools/kafka-admin/cmd/kafka-admin --brokers 127.0.0.1:29092
```

The tool is idempotent and never deletes topics.

