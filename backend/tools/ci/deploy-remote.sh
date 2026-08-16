#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 7 ]]; then
    echo "Usage: deploy-remote.sh <sha> <repository-path> <env-file> <compose-project> <allowed-branch> <image-prefix> <staging|production>" >&2
    exit 2
fi

deploy_sha="$1"
repository_path="$2"
environment_file="$3"
compose_project="$4"
allowed_branch="$5"
image_prefix="$6"
deployment_environment="$7"

[[ "${deploy_sha}" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid deployment SHA." >&2; exit 2; }
[[ "${repository_path}" =~ ^/[A-Za-z0-9._/-]+$ ]] || { echo "Invalid repository path." >&2; exit 2; }
[[ "${environment_file}" =~ ^/[A-Za-z0-9._/-]+$ ]] || { echo "Invalid environment file path." >&2; exit 2; }
[[ "${compose_project}" =~ ^[a-z0-9][a-z0-9_-]{1,62}$ ]] || { echo "Invalid Compose project." >&2; exit 2; }
[[ "${allowed_branch}" =~ ^[A-Za-z0-9._/-]+$ ]] || { echo "Invalid deployment branch." >&2; exit 2; }
[[ "${image_prefix}" =~ ^ghcr\.io/[a-z0-9._/-]+$ ]] || { echo "Invalid image prefix." >&2; exit 2; }
[[ "${deployment_environment}" == "staging" || "${deployment_environment}" == "production" ]] || { echo "Invalid deployment environment." >&2; exit 2; }

cd "${repository_path}"
repository_root="$(realpath -e "$(git rev-parse --show-toplevel)")"
environment_file="$(realpath -e "${environment_file}")"

if [[ "${repository_root}" != "$(realpath -e "${repository_path}")" ]]; then
    echo "DEPLOY_PATH must be the root of the remote Git worktree." >&2
    exit 2
fi
if [[ "${environment_file}" == "${repository_root}" || "${environment_file}" == "${repository_root}"/* ]]; then
    echo "The deployment environment file must remain outside the Git worktree." >&2
    exit 2
fi
if [[ -L "${environment_file}" || ! -f "${environment_file}" ]]; then
    echo "The deployment environment file must be a regular, non-symlink file." >&2
    exit 2
fi
if [[ -n "$(git status --porcelain)" ]]; then
    echo "Remote deployment worktree is dirty; refusing to overwrite operator changes." >&2
    exit 1
fi

git fetch --prune --no-tags origin "${allowed_branch}"
git cat-file -e "${deploy_sha}^{commit}"
if ! git merge-base --is-ancestor "${deploy_sha}" FETCH_HEAD; then
    echo "Requested commit is not reachable from origin/${allowed_branch}." >&2
    exit 1
fi
git checkout --detach "${deploy_sha}"

bash backend/tools/ci/validate-go-runtime-env.sh "${environment_file}" "${deployment_environment}" "${deploy_sha}"

runtime_services=(takein-edge)
for domain in identity customer provider catalog booking payment billing notification chat media audit; do
    upper="${domain^^}"
    api_name="TAKEIN_${upper}_API_IMAGE"
    worker_name="TAKEIN_${upper}_WORKER_IMAGE"
    printf -v "${api_name}" '%s/%s-api:sha-%s' "${image_prefix}" "${domain}" "${deploy_sha}"
    printf -v "${worker_name}" '%s/%s-worker:sha-%s' "${image_prefix}" "${domain}" "${deploy_sha}"
    export "${api_name}" "${worker_name}"
    runtime_services+=("takein-${domain}-api" "takein-${domain}-worker")
done
export TAKEIN_SCHEMA_MIGRATOR_IMAGE="${image_prefix}/schema-migrator:sha-${deploy_sha}"

compose=(docker compose --project-name "${compose_project}" --env-file "${environment_file}" -f docker-compose.yml)
"${compose[@]}" config --quiet
"${compose[@]}" --profile go-core --profile go-migrate --profile go-services --profile go-workers pull takein-schema-migrator "${runtime_services[@]:1}"
"${compose[@]}" build provider customer provider-console admin-web
"${compose[@]}" --profile go-core --profile go-migrate run --rm --no-deps takein-schema-migrator up
"${compose[@]}" --profile go-core --profile go-services --profile go-workers up -d --no-build --pull missing --remove-orphans --wait --wait-timeout 240 "${runtime_services[@]}" provider customer provider-console admin-web
"${compose[@]}" --profile go-core --profile go-migrate run --rm --no-deps takein-schema-migrator status
"${compose[@]}" ps

echo "Go/Next deployment completed for ${deploy_sha}."
