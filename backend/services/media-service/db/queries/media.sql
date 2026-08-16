-- name: CreateMediaObject :one
INSERT INTO media_objects (id, owner_type, owner_id, purpose, bucket, object_key, content_type, visibility, status)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
RETURNING id, owner_type, owner_id, purpose, bucket, object_key, content_type, size_bytes, checksum_sha256,
  visibility, status, created_at, completed_at, deleted_at;

-- name: GetMediaObject :one
SELECT id, owner_type, owner_id, purpose, bucket, object_key, content_type, size_bytes, checksum_sha256,
  visibility, status, created_at, completed_at, deleted_at
FROM media_objects WHERE id=$1;

-- name: CompleteMediaObject :one
UPDATE media_objects SET size_bytes=$2, checksum_sha256=$3, status='ready', completed_at=now() WHERE id=$1 AND status='pending'
RETURNING id, owner_type, owner_id, purpose, bucket, object_key, content_type, size_bytes, checksum_sha256,
  visibility, status, created_at, completed_at, deleted_at;

-- name: DeleteMediaObject :exec
UPDATE media_objects SET status='deleted', deleted_at=now() WHERE id=$1 AND owner_type=$2 AND owner_id=$3;

-- name: UpsertMigrationEntry :one
INSERT INTO media_migration_entries (migration_key, scope, subject_type, subject_id, subject_field, source_disk,
  source_path, source_fingerprint, target_disk, target_path, target_fingerprint, status)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
ON CONFLICT (migration_key) DO UPDATE SET status=EXCLUDED.status, updated_at=now()
RETURNING id, migration_key, scope, subject_type, subject_id, subject_field, source_disk, source_path,
  source_fingerprint, target_object_id, target_disk, target_path, target_fingerprint, source_checksum,
  target_checksum, archive_disk, archive_path, archive_fingerprint, archive_checksum, status, copy_started_at,
  copied_at, verified_at, cutover_at, archive_verified_at, source_retired_at, source_restored_at,
  rolled_back_at, retirement_count, rollback_count, error_message, created_at, updated_at;

