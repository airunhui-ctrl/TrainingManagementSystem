#!/usr/bin/env bash
set -Eeuo pipefail

# Non-destructive Docker Compose release smoke check.
# Run from the project directory on the server after creating .env.docker.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.docker}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.yml}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
ADMIN_PORT="${ADMIN_PORT:-18080}"
H5_PORT="${H5_PORT:-18081}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "docker command is required" >&2
  exit 1
fi
if ! grep -Eq '^PAYMENT_ADAPTER=disabled([[:space:]]|$)' "$ENV_FILE"; then
  echo "PAYMENT_ADAPTER must remain disabled for the non-payment release" >&2
  exit 1
fi

env_value() {
  grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2-
}

postgres_password="$(env_value POSTGRES_PASSWORD)"
jwt_secret="$(env_value JWT_SECRET)"
if [[ -z "$postgres_password" || "$postgres_password" == "change-this-database-password" ]]; then
  echo "POSTGRES_PASSWORD must be replaced with a server-only value" >&2
  exit 1
fi
if [[ -z "$jwt_secret" || "$jwt_secret" == "replace-with-a-new-random-secret-at-least-32-characters" || ${#jwt_secret} -lt 32 ]]; then
  echo "JWT_SECRET must be a server-only value of at least 32 characters" >&2
  exit 1
fi
if ! grep -Eq '^DATABASE_URL=postgresql://[^@]+@postgres:5432/' "$ENV_FILE"; then
  echo "DATABASE_URL must use the Compose postgres hostname" >&2
  exit 1
fi

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
"${compose[@]}" config --quiet

if ! "${compose[@]}" ps postgres | grep -q 'healthy'; then
  echo "PostgreSQL container is not healthy" >&2
  "${compose[@]}" ps -a
  exit 1
fi
if ! "${compose[@]}" ps api | grep -q 'Up'; then
  echo "API container is not running" >&2
  "${compose[@]}" ps -a
  exit 1
fi
if ! "${compose[@]}" ps -a api-migrate | grep -Eq 'Exited[[:space:]]+\(0\)|exited[[:space:]]+0'; then
  echo "API migration container did not finish successfully" >&2
  "${compose[@]}" logs --no-color --tail=120 api-migrate >&2 || true
  exit 1
fi

"${compose[@]}" exec -T api node -e "fetch('http://127.0.0.1:3100/api/health').then(async r=>{if(!r.ok)process.exit(1); const body=await r.json(); if(body.status!=='ok'||body.database!=='ok')process.exit(1)}).catch(()=>process.exit(1))"
"${compose[@]}" exec -T api node -e "fetch('http://127.0.0.1:3100/api/payment-settings/public').then(async r=>{if(!r.ok)process.exit(1); const body=await r.json(); if(body.onlineWechatEnabled!==false||body.onlineAlipayEnabled!==false)process.exit(1)}).catch(()=>process.exit(1))"
curl --fail --silent --show-error --max-time 10 "$BASE_URL:$ADMIN_PORT/" >/dev/null
curl --fail --silent --show-error --max-time 10 "$BASE_URL:$H5_PORT/" >/dev/null

echo "Compose release smoke check passed"
echo "admin=$BASE_URL:$ADMIN_PORT h5=$BASE_URL:$H5_PORT api=healthy postgres=healthy payment=disabled"
