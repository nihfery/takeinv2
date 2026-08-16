# System context

| Aktor/sistem | Interaksi |
| --- | --- |
| Customer | mencari salon, booking, bayar, review, chat melalui customer-web |
| Provider | onboarding dan operasional melalui provider landing/console |
| Admin | verifikasi, moderasi, audit, dan operasi melalui admin-web |
| Midtrans | checkout serta signed payment webhook |
| S3-compatible storage | object media private/public |
| Observability stack | metrics, log, trace, dan alert |

Browser hanya melihat origin Next.js dan endpoint edge yang dipublikasikan.
PostgreSQL, Kafka, Redis, gRPC, worker, dan secret store berada pada trust boundary
private.
