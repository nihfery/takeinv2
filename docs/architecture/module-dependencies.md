# Service dependencies

Dependency utama:

```text
identity
  +--> customer
  +--> provider --> catalog
  +---------------------> booking --> payment
                          |             |
                          +--> chat     +--> billing
                          +--> notification
                          +--> media
                          `--> audit
```

Panah menunjukkan kebutuhan kontrak, bukan izin membaca database. HTTP/gRPC
dipakai hanya untuk keputusan yang harus sinkron. Event Kafka dipakai untuk
proyeksi, notifikasi, audit, dan side effect yang dapat diproses ulang.
