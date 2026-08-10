#!/usr/bin/env bash
set -u

echo '=== system ==='
uname -a
echo '=== node ==='
node --version 2>&1 || true
echo '=== postgres client ==='
psql --version 2>&1 || true
echo '=== postgres service ==='
systemctl is-active postgresql 2>&1 || true
echo '=== listening ports ==='
ss -lntp 2>/dev/null | grep -E ':(22|3100|5174|5185|5432)\b' || true
echo '=== postgres databases (if local admin access is available) ==='
if command -v sudo >/dev/null 2>&1; then
  sudo -u postgres psql -Atc 'SHOW server_version; SHOW port;' 2>&1 || true
  sudo -u postgres psql -Atc 'SELECT datname FROM pg_database ORDER BY datname;' 2>&1 || true
fi
