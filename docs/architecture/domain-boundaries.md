# Domain boundaries

Implementasi domain berada di `backend/services/<domain>-service`. Setiap service
memiliki handler HTTP/gRPC, application/domain logic, persistence PostgreSQL,
migration, dan worker event-nya sendiri.

Database hanya boleh diakses pemilik domain. Integrasi sinkron menggunakan gRPC
berkontrak Protobuf; integrasi asynchronous menggunakan Kafka schema versioned.
Cross-domain transaction dilarang: gunakan saga, outbox/inbox, idempotency, dan
compensating action.

Ownership lengkap terdapat di `docs/database/table-ownership.md` dan
`backend/contracts/ownership`.
