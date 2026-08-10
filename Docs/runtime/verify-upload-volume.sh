#!/usr/bin/env bash
set -Eeuo pipefail

# Verify that the Compose upload volume survives an API container restart.
# The check writes only a hidden temporary marker and removes it afterwards.
# Run from the project directory on the server after the stack is healthy.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.docker}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.yml}"
MARKER_NAME=".${UPLOAD_MARKER_NAME:-release-volume-check-$(date +%Y%m%d%H%M%S)-$$}"
MARKER_VALUE="training-management-upload-volume-${RANDOM}-${RANDOM}"

if [[ ! "$MARKER_NAME" =~ ^\.[A-Za-z0-9._-]+$ ]]; then
  echo "UPLOAD_MARKER_NAME 只能包含字母、数字、点、下划线和连字符" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 $ENV_FILE；请先配置服务器环境变量" >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "未找到 docker 命令" >&2
  exit 1
fi

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
api_id="$("${compose[@]}" ps -q api)"
if [[ -z "$api_id" ]]; then
  echo "API 容器未创建，请先启动 Compose 服务" >&2
  exit 1
fi

health_status() {
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' "$api_id" 2>/dev/null || true
}

wait_for_healthy() {
  local status
  for _ in $(seq 1 30); do
    status="$(health_status)"
    if [[ "$status" == "healthy" ]]; then return 0; fi
    sleep 2
  done
  echo "API 重启后未恢复 healthy，当前状态：$(health_status)" >&2
  "${compose[@]}" ps -a >&2 || true
  return 1
}

cleanup_marker() {
  "${compose[@]}" exec -T api sh -lc 'set -eu; upload_dir="${UPLOAD_DIR:?UPLOAD_DIR is required}"; rm -f -- "$upload_dir/$1"' sh "$MARKER_NAME" >/dev/null 2>&1 || true
}
trap cleanup_marker EXIT

"${compose[@]}" exec -T api sh -lc 'set -eu; upload_dir="${UPLOAD_DIR:?UPLOAD_DIR is required}"; mkdir -p "$upload_dir"; printf "%s" "$2" > "$upload_dir/$1"; test "$(cat "$upload_dir/$1")" = "$2"' sh "$MARKER_NAME" "$MARKER_VALUE"
"${compose[@]}" restart api >/dev/null
wait_for_healthy
"${compose[@]}" exec -T api sh -lc 'set -eu; upload_dir="${UPLOAD_DIR:?UPLOAD_DIR is required}"; test "$(cat "$upload_dir/$1")" = "$2"' sh "$MARKER_NAME" "$MARKER_VALUE"

echo "上传卷跨 API 容器重启持久化检查通过"
echo "volume=upload_data api=healthy marker=temporary-and-removed"
