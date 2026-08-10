#!/usr/bin/env bash
set -Eeuo pipefail

# 仅用于独立 PostgreSQL 测试库或已确认的维护窗口。
# 执行前设置 DATABASE_URL=postgresql://...，并显式 CONFIRM=YES。
# 脚本不读取、不打印密码；不要把 DATABASE_URL 发到聊天或提交到仓库。

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

if [[ "${CONFIRM:-}" != "YES" ]]; then
  echo "这是 SQLite → PostgreSQL 数据迁移操作，会生成备份并修改 PostgreSQL 测试库。"
  echo "确认目标库和维护窗口后，使用：CONFIRM=YES DATABASE_URL='postgresql://...' $0"
  exit 2
fi
if [[ ! "${DATABASE_URL:-}" =~ ^postgres(ql)?:// ]]; then
  echo "必须设置 DATABASE_URL=postgresql://...，当前未设置或不是 PostgreSQL URL。" >&2
  exit 1
fi

NODE_BIN="${NODE_BIN:-node}"
PNPM_BIN="${PNPM_BIN:-pnpm}"
SOURCE_DB="${DATABASE_FILE:-backend/api/data/training.db}"
if [[ ! -f "${SOURCE_DB}" ]]; then
  echo "找不到 SQLite 数据库：${SOURCE_DB}" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DB="backend/api/data/training.pre-postgresql-${STAMP}.db"
EXPORT_JSON="backend/api/data/postgresql-export-${STAMP}.json"
EXPORT_JSON_ABS="${ROOT_DIR}/${EXPORT_JSON}"

echo "[1/4] 创建 WAL-safe SQLite 备份：${BACKUP_DB}"
"${NODE_BIN}" backend/api/prisma/create-consistent-backup.js "${SOURCE_DB}" "${BACKUP_DB}"

echo "[2/4] 导出快照：${EXPORT_JSON}"
"${NODE_BIN}" backend/api/prisma/export-postgresql.cjs --database-file="${BACKUP_DB}" --output="${EXPORT_JSON}"

echo "[3/4] 生成 PostgreSQL schema/client 并执行 migration"
DATABASE_URL="${DATABASE_URL}" "${PNPM_BIN}" --dir backend/api db:prepare:postgres
DATABASE_URL="${DATABASE_URL}" "${PNPM_BIN}" --dir backend/api db:migrate:postgres

echo "[4/4] 导入并输出行数对账"
DATABASE_URL="${DATABASE_URL}" "${PNPM_BIN}" --dir backend/api db:import:postgres -- --input="${EXPORT_JSON_ABS}"

echo
echo "迁移测试完成。请保留以下证据文件并核对金额、订单状态、学员履历和附件数量："
echo "  备份：${BACKUP_DB}"
echo "  导出：${EXPORT_JSON}"
