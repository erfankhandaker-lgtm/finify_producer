#!/usr/bin/env sh
set -eu

compose_files="-f compose.yaml -f compose.prod.yaml"

: "${FINIFY_IMAGE_REGISTRY:?FINIFY_IMAGE_REGISTRY is required}"
: "${FINIFY_IMAGE_TAG:?FINIFY_IMAGE_TAG is required}"

case "$FINIFY_IMAGE_REGISTRY" in
  ghcr.io/*) ;;
  *) echo "FINIFY_IMAGE_REGISTRY must be a ghcr.io namespace" >&2; exit 1 ;;
esac

case "$FINIFY_IMAGE_TAG" in
  *[!A-Za-z0-9._-]*|'') echo "FINIFY_IMAGE_TAG contains unsupported characters" >&2; exit 1 ;;
esac

if [ ! -f .env ]; then
  echo "A production .env file must already exist on the deployment host" >&2
  exit 1
fi

if ! grep -Eq '^NODE_MODE=(prod|production)$' .env; then
  echo "Production deployment requires NODE_MODE=prod or NODE_MODE=production in .env" >&2
  exit 1
fi

docker compose $compose_files config --quiet
docker compose $compose_files pull

# Migrations are serialized with a PostgreSQL advisory lock by migrate.js.
docker compose $compose_files run --rm --no-deps producer npm run migrate

docker compose $compose_files up -d --no-build --remove-orphans --wait --wait-timeout 300
docker compose $compose_files ps
