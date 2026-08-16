# Database table ownership

Setiap proses aplikasi menerima satu `POSTGRES_DSN` untuk database miliknya.
Cross-service read/write menggunakan gRPC atau Kafka projection, bukan credential
database service lain.

| Database | Owner | Data utama |
| --- | --- | --- |
| `takein_identity` | identity-service | identities, credentials, refresh sessions, inbox/outbox |
| `takein_customer` | customer-service | profile, activity, favorite, review |
| `takein_provider` | provider-service | provider, branch, staff, schedule, role, onboarding |
| `takein_catalog` | catalog-service | category, service, pricing projection, coupon |
| `takein_booking` | booking-service | availability hold, booking, participant, snapshots |
| `takein_payment` | payment-service | charge, gateway notification, replay key |
| `takein_billing` | billing-service | plan, trial, subscription, purchase snapshot |
| `takein_notification` | notification-service | notification dan delivery attempt |
| `takein_chat` | chat-service | thread, message, support ticket |
| `takein_media` | media-service | object metadata dan upload state |
| `takein_audit` | audit-service | append-only sanitized audit event |

Schema executable hanya berada di
`backend/services/<domain>-service/db/migrations`.
Booking memiliki lifecycle slot/participant; Payment menerbitkan state dan
Booking menerapkan proyeksinya secara idempotent. Media memiliki object I/O,
sedangkan domain lain hanya menyimpan reference. Audit tidak pernah menjadi
sumber kebenaran aggregate lain.
