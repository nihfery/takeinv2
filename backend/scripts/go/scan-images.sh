#!/bin/sh
set -eu

scan_image() {
  image="$1"
  if command -v trivy >/dev/null 2>&1; then
    trivy image --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --quiet "$image"
    return
  fi
  set -- docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v takein_trivy_cache:/root/.cache/trivy aquasec/trivy:0.72.0 image
  if [ -n "${TRIVY_DB_REPOSITORY:-}" ]; then
    set -- "$@" --db-repository "$TRIVY_DB_REPOSITORY"
  fi
  MSYS_NO_PATHCONV=1 "$@" --timeout "${TRIVY_TIMEOUT:-10m}" --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --quiet "$image"
}

for name in identity customer provider catalog booking payment billing notification chat media audit; do
  for kind in service worker; do
    image="takein/${name}-${kind}:${TAKEIN_IMAGE_TAG:-local}"
    echo "===== TRIVY ${image}"
    scan_image "$image"
  done
done

echo "===== TRIVY takein/schema-migrator:${TAKEIN_IMAGE_TAG:-local}"
scan_image "takein/schema-migrator:${TAKEIN_IMAGE_TAG:-local}"
