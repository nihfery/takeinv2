# PostgreSQL backup and restore

Backup produksi harus terenkripsi, disimpan di luar host aplikasi, memiliki
retention dan akses audit, serta mendukung point-in-time recovery sesuai RPO/RTO.
Object storage memerlukan versioning/backup terpisah. Named volume lokal bukan
backup.

## Restore drill

1. Inventaris snapshot exact dan checksum-nya tanpa mencetak data.
2. Pulihkan ke instance PostgreSQL terisolasi dengan credential terbatas.
3. Pastikan instance hasil restore tidak dapat mengirim email, webhook, event,
   atau transaksi eksternal.
4. Jalankan schema migrator `status`, integrity query, sampling bisnis, dan smoke
   test seluruh service.
5. Catat durasi restore, data loss window, dan hasil RPO/RTO.

## Insiden produksi

Restore produksi memerlukan persetujuan incident commander dan database owner.
Hentikan write, simpan log/audit, ambil snapshot keadaan terakhir bila aman,
verifikasi target dan snapshot oleh dua operator, lalu prioritaskan restore ke
instance baru. Alihkan koneksi hanya setelah schema, reconciliation
booking/payment, dan smoke test lolos.
