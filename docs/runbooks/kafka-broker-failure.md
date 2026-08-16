# Kafka Broker Failure

Keep APIs available when safe; outbox rows retain unpublished events. Check broker quorum, ISR, controller health, storage and producer errors. Do not bypass outbox or lower durability silently. After recovery verify topic health, drain outbox, and inspect duplicates through consumer inbox.

Every action must record operator, UTC timestamps, environment, affected service/version, evidence, rollback decision, and final verification. Never expose secrets or delete source data during incident response.
