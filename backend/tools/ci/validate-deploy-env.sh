#!/usr/bin/env bash
set -euo pipefail

required=(
    DEPLOY_SHA
    DEPLOY_ENVIRONMENT
    DEPLOY_HOST
    DEPLOY_USER
    DEPLOY_PORT
    DEPLOY_PATH
    DEPLOY_ENV_FILE
    DEPLOY_COMPOSE_PROJECT
    DEPLOY_ALLOWED_BRANCH
    DEPLOY_SMOKE_URL
    DEPLOY_SSH_KEY
    DEPLOY_KNOWN_HOSTS
    REGISTRY_TOKEN
    REGISTRY_USERNAME
    IMAGE_PREFIX
)
smoke_url_pattern='^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/[A-Za-z0-9._~/?=&%-]*$'

for name in "${required[@]}"; do
    if [[ -z "${!name:-}" ]]; then
        echo "Required deployment setting is absent: ${name}" >&2
        exit 2
    fi
done

[[ "${DEPLOY_SHA}" =~ ^[a-f0-9]{40}$ ]] || { echo "DEPLOY_SHA must be a full lowercase commit SHA." >&2; exit 2; }
[[ "${DEPLOY_ENVIRONMENT}" == "staging" || "${DEPLOY_ENVIRONMENT}" == "production" ]] || { echo "DEPLOY_ENVIRONMENT is invalid." >&2; exit 2; }
[[ "${DEPLOY_HOST}" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "DEPLOY_HOST contains unsafe characters." >&2; exit 2; }
[[ "${DEPLOY_USER}" =~ ^[A-Za-z_][A-Za-z0-9_-]*$ ]] || { echo "DEPLOY_USER contains unsafe characters." >&2; exit 2; }
if [[ ! "${DEPLOY_PORT}" =~ ^[0-9]{1,5}$ ]] || (( DEPLOY_PORT < 1 || DEPLOY_PORT > 65535 )); then
    echo "DEPLOY_PORT is invalid." >&2
    exit 2
fi
[[ "${DEPLOY_PATH}" =~ ^/[A-Za-z0-9._/-]+$ ]] || { echo "DEPLOY_PATH must be an absolute path without shell metacharacters." >&2; exit 2; }
[[ "${DEPLOY_ENV_FILE}" =~ ^/[A-Za-z0-9._/-]+$ ]] || { echo "DEPLOY_ENV_FILE must be an absolute path without shell metacharacters." >&2; exit 2; }
[[ "${DEPLOY_COMPOSE_PROJECT}" =~ ^[a-z0-9][a-z0-9_-]{1,62}$ ]] || { echo "DEPLOY_COMPOSE_PROJECT is invalid." >&2; exit 2; }
[[ "${DEPLOY_ALLOWED_BRANCH}" =~ ^[A-Za-z0-9._/-]+$ ]] || { echo "DEPLOY_ALLOWED_BRANCH is invalid." >&2; exit 2; }
[[ "${DEPLOY_SMOKE_URL}" =~ ${smoke_url_pattern} ]] || { echo "DEPLOY_SMOKE_URL must be an HTTPS URL." >&2; exit 2; }
[[ "${REGISTRY_USERNAME}" =~ ^[A-Za-z0-9_-]+$ ]] || { echo "REGISTRY_USERNAME is invalid." >&2; exit 2; }
[[ "${IMAGE_PREFIX}" =~ ^ghcr\.io/[a-z0-9._/-]+$ ]] || { echo "IMAGE_PREFIX must be a lowercase GHCR path." >&2; exit 2; }

if [[ "${DEPLOY_PATH}" == "${DEPLOY_ENV_FILE}" || "${DEPLOY_ENV_FILE}" == "${DEPLOY_PATH}"/* ]]; then
    echo "DEPLOY_ENV_FILE must live outside the deployment worktree." >&2
    exit 2
fi

if [[ "${DEPLOY_SSH_KEY}" != *"PRIVATE KEY"* ]]; then
    echo "DEPLOY_SSH_KEY does not look like a private key." >&2
    exit 2
fi

git cat-file -e "${DEPLOY_SHA}^{commit}"
echo "Deployment inputs are present and structurally valid. Secret values were not printed."
