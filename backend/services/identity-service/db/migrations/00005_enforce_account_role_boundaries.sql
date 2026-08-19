-- +goose Up
ALTER TABLE users
    ADD CONSTRAINT users_role_scope_check CHECK (
        (
            role IN ('admin', 'customer')
            AND provider_id IS NULL
            AND branch_id IS NULL
            AND provider_role_id IS NULL
            AND cardinality(permissions) = 0
        )
        OR
        (
            role = 'provider'
            AND (
                (
                    provider_id IS NULL
                    AND branch_id IS NULL
                    AND provider_role_id IS NULL
                    AND cardinality(permissions) = 0
                )
                OR
                (
                    provider_id IS NOT NULL
                    AND (
                        (branch_id IS NULL AND provider_role_id IS NULL)
                        OR
                        (branch_id IS NOT NULL AND provider_role_id IS NOT NULL)
                    )
                )
            )
        )
    );

-- +goose Down
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_scope_check;
