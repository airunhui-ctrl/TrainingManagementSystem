#!/usr/bin/env bash
set -Eeuo pipefail

# Restore a PostgreSQL custom dump into a new temporary database for verification.
# This script refuses to target POSTGRES_DB and never drops an existing database.
# Run from /opt/training-management after a backup has been created.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.docker}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.yml}"
BACKUP_FILE="${BACKUP_FILE:-}"
RESTORE_DB="${RESTORE_DB:-training_management_restore_$(date +%Y%m%d%H%M%S)}"

if [[ "${CONFIRM:-}" != "YES" ]]; then
  echo "该脚本会在 PostgreSQL 容器中创建临时数据库并恢复备份，不会覆盖业务库。"
  echo "确认维护窗口后使用：CONFIRM=YES BACKUP_FILE=/path/to/file.dump $0"
  exit 2
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 $ENV_FILE" >&2
  exit 1
fi
if [[ ! -f "$BACKUP_FILE" || ! -s "$BACKUP_FILE" ]]; then
  echo "BACKUP_FILE 必须指向非空的 custom dump 文件" >&2
  exit 1
fi
if [[ ! "$RESTORE_DB" =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; then
  echo "RESTORE_DB 只能使用小写字母、数字和下划线，且以字母/下划线开头" >&2
  exit 1
fi

env_value() {
  grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2-
}

postgres_user="$(env_value POSTGRES_USER)"
postgres_user="${postgres_user:-training_app}"
postgres_db="$(env_value POSTGRES_DB)"
postgres_db="${postgres_db:-training_management}"
if [[ "$RESTORE_DB" == "$postgres_db" ]]; then
  echo "RESTORE_DB 不得等于业务数据库名" >&2
  exit 1
fi

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
"${compose[@]}" exec -T postgres sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null

# createdb fails if the target already exists; this is intentional so that the
# script never overwrites a previous restore or an application database.
"${compose[@]}" exec -T postgres sh -lc 'createdb -U "$POSTGRES_USER" "$1"' sh "$RESTORE_DB"

"${compose[@]}" exec -T postgres sh -lc 'pg_restore --exit-on-error --no-owner --no-privileges -U "$POSTGRES_USER" -d "$1"' sh "$RESTORE_DB" < "$BACKUP_FILE"

counts="$(${compose[@]} exec -T postgres sh -lc 'psql -Atqc '\''SELECT '\''User'\'', COUNT(*) FROM "User" UNION ALL SELECT '\''Course'\'', COUNT(*) FROM "Course" UNION ALL SELECT '\''Order'\'', COUNT(*) FROM "Order" UNION ALL SELECT '\''Student'\'', COUNT(*) FROM "Student" UNION ALL SELECT '\''AccountStudent'\'', COUNT(*) FROM "AccountStudent" UNION ALL SELECT '\''Enrollment'\'', COUNT(*) FROM "Enrollment";'\'' -U "$POSTGRES_USER" -d "$1"' sh "$RESTORE_DB")"

echo "PostgreSQL 临时恢复完成"
echo "restore_database=$RESTORE_DB"
echo "backup_file=$BACKUP_FILE"
echo "table_counts:"
printf '%s\n' "$counts"
echo "请将上述计数与导出快照及 db:verify:postgres 的 passed=true 结果一并归档。"
