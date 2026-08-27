#!/usr/bin/env bash
set -Eeuo pipefail

# Rebuild and restart the AICoding assessment container after manually
# uploading files into aicoding/aicoding-assessment on the server.
# Run from /opt/training-management.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.docker}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.yml}"
ASSESS_DIR="$ROOT_DIR/aicoding/aicoding-assessment"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi
if [[ ! -d "$ASSESS_DIR" ]]; then
  echo "Missing assessment directory: $ASSESS_DIR" >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

cd "$ROOT_DIR"
echo "Assessment files: $ASSESS_DIR"
ls -l "$ASSESS_DIR" | head -20

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --quiet
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build assessment
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d assessment

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps | grep assessment || true

curl --fail --silent --show-error --max-time 10 -o /dev/null http://127.0.0.1:18082/aicoding-assessment/ || true
echo "AICoding rebuild finished: http://127.0.0.1:18082/aicoding-assessment/"
