#!/usr/bin/env bash
set -Eeuo pipefail

# Docker Compose PostgreSQL logical backup.
# Run from /opt/training-management. This script never prints DATABASE_URL or passwords.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.docker}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.yml}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 $ENV_FILE；请先复制 .env.docker.example 并填写服务器配置" >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "未找到 docker 命令" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
backup_file="$BACKUP_DIR/training_management-$stamp.dump"
checksum_file="$backup_file.sha256"

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
"${compose[@]}" exec -T postgres sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null
"${compose[@]}" exec -T postgres sh -lc 'pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$backup_file"

if [[ ! -s "$backup_file" ]]; then
  rm -f -- "$backup_file"
  echo "备份文件为空，已中止" >&2
  exit 1
fi

sha256sum "$backup_file" > "$checksum_file"
chmod 600 "$backup_file" "$checksum_file"
printf 'PostgreSQL 备份完成：%s\n校验文件：%s\n' "$backup_file" "$checksum_file"
