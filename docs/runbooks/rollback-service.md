# Rollback service

Gunakan image immutable commit sebelumnya hanya bila schema masih
backward-compatible. Jangan membalik migration secara destruktif. Hentikan atau
batasi write bila invariant/data sudah berubah, catat write window, lakukan
reconciliation, kemudian deploy image sebelumnya dengan `--wait` dan ulangi
health/readiness serta smoke test.
