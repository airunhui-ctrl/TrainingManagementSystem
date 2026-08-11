#!/usr/bin/env bash
set -Eeuo pipefail

# Deploy TrainingManagementSystem from GitHub to a Docker Compose host.
# Usage:
#   REPO_URL=... BRANCH=main APP_DIR=/opt/training-management ./deploy-from-github.sh
# The script never deletes server-only untracked files such as .env.docker,
# docker-compose.override.yml or PostgreSQL exports.

REPO_URL="${REPO_URL:-https://github.com/airunhui-ctrl/TrainingManagementSystem.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/training-management}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env.docker}"

command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; }
command -v git >/dev/null 2>&1 || { echo "git is required" >&2; exit 1; }

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Create it on the server and keep it outside Git." >&2
  exit 1
fi

if ! grep -Eq '^PAYMENT_ADAPTER=disabled([[:space:]]|$)' "$ENV_FILE"; then
  echo "PAYMENT_ADAPTER must remain disabled for this release" >&2
  exit 1
fi

mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  git -c safe.directory="$APP_DIR" fetch origin "$BRANCH"
  git -c safe.directory="$APP_DIR" checkout "$BRANCH"
  git -c safe.directory="$APP_DIR" pull --ff-only origin "$BRANCH"
fi

echo "Release commit: $(git -c safe.directory="$APP_DIR" rev-parse --short HEAD)"

if [[ -f "$APP_DIR/Docs/runtime/backup-postgres-docker.sh" ]]; then
  chmod +x "$APP_DIR/Docs/runtime/backup-postgres-docker.sh"
  "$APP_DIR/Docs/runtime/backup-postgres-docker.sh"
fi

docker compose --env-file "$ENV_FILE" config --quiet
docker compose --env-file "$ENV_FILE" build
docker compose --env-file "$ENV_FILE" up -d api-migrate

# Schema safeguard for upgraded databases: the auth session migration may be
# skipped by an older migration history, which breaks every login. Make the
# column idempotently present before the API starts.
postgres_user="$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | tail -n 1 | cut -d= -f2-)"
postgres_db="$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | tail -n 1 | cut -d= -f2-)"
docker compose --env-file "$ENV_FILE" exec -T postgres psql -U "${postgres_user:-training_app}" -d "${postgres_db:-training_management}" -c 'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;' || echo "sessionVersion schema safeguard skipped"

docker compose --env-file "$ENV_FILE" up -d

if [[ -f "$APP_DIR/Docs/runtime/verify-compose-release.sh" ]]; then
  chmod +x "$APP_DIR/Docs/runtime/verify-compose-release.sh"
  "$APP_DIR/Docs/runtime/verify-compose-release.sh"
fi

echo "Deployment finished. admin=http://<server-ip>:18080 h5=http://<server-ip>:18081"
