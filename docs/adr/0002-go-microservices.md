# ADR 0002: Go microservices

Status: accepted

TakeIn menggunakan 11 service Go yang dipisahkan berdasarkan ownership domain.
Setiap service memiliki PostgreSQL sendiri; komunikasi sinkron memakai gRPC dan
komunikasi asynchronous memakai Kafka. Redis hanya menyimpan state runtime yang
bukan sumber kebenaran bisnis.

Konsekuensi: kontrak HTTP/Protobuf/event wajib versioned, cross-database query
dilarang, workflow lintas domain memakai saga/outbox/inbox, dan setiap service
harus memiliki health, metrics, logging, migration, serta pipeline test sendiri.
