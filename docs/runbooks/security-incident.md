# Security incident

1. Tetapkan incident commander, waktu kejadian, scope actor/domain, dan jalur
   komunikasi privat.
2. Cabut/rotasi credential atau signing key terdampak; jangan menghapus evidence.
3. Batasi ingress atau nonaktifkan operasi sensitif tanpa menghentikan audit.
4. Korelasikan request ID pada edge, API, worker, Kafka, PostgreSQL, object
   storage, dan audit-service.
5. Rekonsiliasi booking/payment serta replay event hanya dengan prosedur
   idempotent.
6. Pulihkan traffic bertahap setelah credential, authorization, readiness,
   backlog, dan audit persistence terverifikasi.

Jangan menempel token, cookie, signature, data personal, atau private URL ke
issue/log bersama.
