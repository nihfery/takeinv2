# OpenAPI v1

Direktori ini mendefinisikan kontrak HTTP eksternal untuk API Go. URL kompatibel
tetap berada di bawah `/api/...`; nama direktori `v1` adalah boundary versi
kontrak, bukan tambahan prefix runtime.

Setiap operation memiliki `operationId`, `x-authentication`, dan metadata
permission bila diperlukan. Security scheme memakai bearer JWT atau signed
webhook. Ownership route diperiksa terhadap registry Go.

Validasi:

```bash
go run ./tools/contract-check/cmd/contract-check
```

Gate gagal bila method/path atau operation ID duplikat, reference schema rusak,
metadata ownership/auth drift, atau route tidak memiliki pemilik Go.
