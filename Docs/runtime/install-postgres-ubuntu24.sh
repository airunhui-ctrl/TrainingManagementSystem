#!/usr/bin/env bash
set -Eeuo pipefail

# 在 Ubuntu 24.04 服务器上安装 PostgreSQL 并初始化项目专用账号/数据库。
# 脚本不会把数据库密码写入文件、日志或仓库；密码通过 psql 的交互式
# \password 输入。执行前请确认当前主机就是目标服务器。

if [[ "${EUID}" -ne 0 ]]; then
  echo "请使用 root 或 sudo 执行此脚本。" >&2
  exit 1
fi

DB_NAME="${DB_NAME:-training_management}"
DB_USER="${DB_USER:-training_app}"
DB_PORT="${DB_PORT:-5432}"

if [[ ! "${DB_NAME}" =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; then
  echo "DB_NAME 只能包含小写字母、数字和下划线，且必须以字母/下划线开头。" >&2
  exit 1
fi
if [[ ! "${DB_USER}" =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; then
  echo "DB_USER 只能包含小写字母、数字和下划线，且必须以字母/下划线开头。" >&2
  exit 1
fi
if [[ ! "${DB_PORT}" =~ ^[0-9]{2,5}$ ]]; then
  echo "DB_PORT 不合法。" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y postgresql postgresql-client

systemctl enable --now postgresql

run_as_postgres() {
  if command -v runuser >/dev/null 2>&1; then
    runuser -u postgres -- "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u postgres "$@"
  else
    echo "找不到 runuser 或 sudo，无法切换到 postgres 系统用户。" >&2
    exit 1
  fi
}

if ! id postgres >/dev/null 2>&1; then
  echo "postgres 系统用户不存在，PostgreSQL 安装异常。" >&2
  exit 1
fi

if ! run_as_postgres psql -Atqc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -qx '1'; then
  run_as_postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE \"${DB_USER}\" LOGIN;"
else
  echo "PostgreSQL 角色 ${DB_USER} 已存在，将重新设置密码。"
fi

echo "请为 PostgreSQL 应用账号 ${DB_USER} 输入一个新的强密码（不会显示，也不会写入仓库）："
run_as_postgres psql -v ON_ERROR_STOP=1 -c "\\password ${DB_USER}"

if ! run_as_postgres psql -Atqc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -qx '1'; then
  run_as_postgres createdb -O "${DB_USER}" -p "${DB_PORT}" "${DB_NAME}"
else
  echo "数据库 ${DB_NAME} 已存在，不删除、不覆盖。"
fi

run_as_postgres psql -v ON_ERROR_STOP=1 -d "${DB_NAME}" -c "GRANT CONNECT, TEMPORARY ON DATABASE \"${DB_NAME}\" TO \"${DB_USER}\"; GRANT USAGE, CREATE ON SCHEMA public TO \"${DB_USER}\";"

echo
echo "PostgreSQL 实例初始化完成。当前连接参数："
echo "  DB_HOST=127.0.0.1"
echo "  DB_PORT=${DB_PORT}"
echo "  DB_NAME=${DB_NAME}"
echo "  DB_USER=${DB_USER}"
echo "  DB_SCHEMA=public"
echo
echo "请把以下连接串写入 API 服务器的 .env（替换 <password>，不要发到聊天）："
echo "DATABASE_URL=postgresql://${DB_USER}:<password>@127.0.0.1:${DB_PORT}/${DB_NAME}?schema=public"
echo
echo "建议验证：psql -h 127.0.0.1 -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -W -c 'select version();'"
