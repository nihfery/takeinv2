# Media domain

Media service memiliki metadata object, lifecycle upload/completion, policy
visibility, signed access, dan operasi penyimpanan S3-compatible. Provider,
catalog, customer, serta chat hanya menyimpan reference object milik aggregate
mereka.

| Jenis | Visibility | Aturan |
| --- | --- | --- |
| gambar provider/cabang/layanan/staf/review | public sesuai policy | MIME/ukuran dibatasi, object key acak |
| KTP/NIB provider | private | owner/admin saja, signed URL singkat |
| attachment chat/support | private | participant/tenant/thread state diperiksa |

Raw object key bukan URL browser. Private response memakai `private`, `no-store`,
dan `nosniff`; log tidak boleh memuat signed URL atau query signature. Bucket,
encryption, versioning, lifecycle, backup, dan malware scanning harus disediakan
dan diverifikasi oleh platform produksi.
