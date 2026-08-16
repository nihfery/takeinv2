# ADR 007: Next.js public surfaces

Status: accepted

Empat public surface dipisahkan menjadi `customer-web`, `provider-landing`,
`provider-console`, dan `admin-web`. Masing-masing merupakan aplikasi Next.js
dengan origin, port, build, serta deployment lifecycle sendiri.

Browser memanggil BFF `/api/*`; BFF meneruskan request ke Go edge/identity pada
jaringan private. Browser tidak boleh mengakses gRPC, database, Kafka, atau
credential internal secara langsung.
