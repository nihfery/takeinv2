# Auth Key Rotation

Generate an RSA key outside the repository and secret manager, publish the new public key/kid, then sign new tokens while validators accept old and new keys for the maximum access-token TTL. Remove the old key after overlap, revoke refresh families if compromise is suspected, and audit rotation.

Every action must record operator, UTC timestamps, environment, affected service/version, evidence, rollback decision, and final verification. Never expose secrets or delete source data during incident response.
