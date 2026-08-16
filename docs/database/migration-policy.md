# PostgreSQL migration policy

1. Service hanya memiliki migration di
   `backend/services/<domain>-service/db/migrations`.
2. Version yang sudah diterapkan immutable; perubahan berikutnya memakai file
   SQL berurutan yang baru.
3. Migration tidak boleh membuat foreign key, view, atau query ke database
   service lain.
4. Gunakan pola expand/backfill/verify/contract agar versi lama dan baru dapat
   overlap saat rolling deployment.
5. Operasi destructive memerlukan backup/PITR terverifikasi, restore drill,
   maintenance window, dan rencana forward-fix.
6. Uji fresh apply, status, sqlc generation, lock duration, cardinality staging,
   serta kompatibilitas sebelum produksi.

Migrasi seluruh domain dijalankan melalui:

```bash
make -C backend migrate-status
make -C backend migrate
```

Deployment menjalankan image `takein-schema-migrator` sebelum API/worker baru.
Kegagalan migration menghentikan rilis. Jangan drop/rename field yang masih
dibaca image sebelumnya pada rollout yang sama.
