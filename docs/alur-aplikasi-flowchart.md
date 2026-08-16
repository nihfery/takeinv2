# Alur aplikasi TakeIn

Dokumen ini memetakan runtime Go/Next yang aktif. Customer, provider, dan admin
masuk melalui aplikasi Next.js terpisah; seluruh keputusan bisnis dijalankan oleh
service Go pemilik domain.

## Alur tingkat sistem

```mermaid
flowchart LR
    Customer[Customer] --> CW[customer-web]
    Provider[Provider] --> PL[provider-landing]
    PL --> PC[provider-console]
    Admin[Admin] --> AW[admin-web]

    CW --> Edge[Traefik edge]
    PL --> Edge
    PC --> Edge
    AW --> Edge

    Edge --> Identity[identity-service]
    Edge --> CustomerSvc[customer-service]
    Edge --> ProviderSvc[provider-service]
    Edge --> Catalog[catalog-service]
    Edge --> Booking[booking-service]
    Edge --> Payment[payment-service]
    Edge --> Billing[billing-service]
    Edge --> Notification[notification-service]
    Edge --> Chat[chat-service]
    Edge --> Media[media-service]
    Edge --> Audit[audit-service]

    Identity --> PG[(PostgreSQL per service)]
    CustomerSvc --> PG
    ProviderSvc --> PG
    Catalog --> PG
    Booking --> PG
    Payment --> PG
    Billing --> PG
    Notification --> PG
    Chat --> PG
    Media --> PG
    Audit --> PG

    Booking --> Kafka[(Kafka)]
    Payment --> Kafka
    Billing --> Kafka
    Kafka --> Workers[Domain workers]
    Workers --> Notification
    Workers --> Audit
```

## Login dan routing provider

```mermaid
sequenceDiagram
    actor P as Provider
    participant L as provider-landing
    participant I as identity-service
    participant C as provider-console
    participant S as provider-service

    P->>L: Login atau registrasi
    L->>I: POST /api/auth/* melalui BFF
    I-->>L: Access token + secure refresh cookie
    L-->>P: Redirect /provider/dashboard
    P->>C: Buka dashboard
    C->>S: Muat profile/cabang/staf/layanan melalui edge
    S-->>C: Data sesuai ownership dan permission
```

## Booking dan pembayaran customer

```mermaid
sequenceDiagram
    actor C as Customer
    participant W as customer-web
    participant K as catalog-service
    participant B as booking-service
    participant P as payment-service
    participant M as Midtrans
    participant E as Kafka

    C->>W: Cari salon, layanan, dan staf
    W->>K: Query katalog publik
    K-->>W: Cabang, layanan, harga, staf
    C->>W: Pilih slot dan checkout
    W->>B: Buat hold/booking dengan idempotency key
    B-->>W: Booking pending + snapshot harga
    W->>P: Buat transaksi pembayaran
    P->>M: Create charge
    M-->>P: Token/redirect pembayaran
    M->>P: Signed webhook status
    P->>E: payment.status.changed
    E->>B: Terapkan status secara idempotent
    B->>E: booking.status.changed
```

## Prinsip konsistensi

- Service hanya menulis database miliknya.
- Operasi sinkron lintas domain menggunakan gRPC internal.
- Side effect memakai Kafka, inbox/outbox, retry terbatas, dan DLQ.
- Booking/payment menggunakan transaction, constraint, row lock yang relevan,
  serta idempotency key.
- Notification, chat, media, dan audit tidak boleh menggagalkan commit bisnis
  hanya karena delivery downstream sementara tidak tersedia.
