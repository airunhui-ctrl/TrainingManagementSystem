# 部署操作记录（开发服务器 123.56.45.202）

> 维护约定：每次部署/运维操作后，在「操作记录」追加一节；遇到问题在「问题与解决方案」登记；环境变量变更在「环境变量变更记录」登记。短信功能的完整配置说明见 [短信验证配置](sms-verification-dev-config.md)，本次代码逻辑见 [代码详解](code-explained.md)。

## 环境信息

- 服务器：123.56.45.202（SSH 别名 `Lbx`，用户 root，部署密钥 `~/.ssh/training-deploy`）
- 部署目录：`/opt/training-management`（文件复制式部署，非 git 仓库）
- 编排：docker compose，项目名 `training-management`
- 服务与端口：postgres(内部5432) / api-migrate(一次性) / api(内部3100) / admin(18080) / h5(18081) / assessment(18082)
- 环境配置：`/opt/training-management/.env.docker`（`NODE_ENV=staging`）

## 操作记录

### 2026-08-28 部署提交 0f90ce6

| # | 时间(CST) | 操作 | 命令 | 结果 |
| --- | --- | --- | --- | --- |
| 1 | 10:05 | 推送代码到 GitHub | `git push origin main` | e891210..0f90ce6 推送成功 |
| 2 | 10:08 | 检查提交间有无删除文件 | `git diff --name-status e891210..HEAD` 查 `D` | 无删除文件，覆盖式部署安全 |
| 3 | 10:08 | 检查服务器环境变量键名 | `grep -oE` 只取键名不读值 | 16 个键，缺 11 个短信/webhook 键 |
| 4 | 10:10 | 本地打包提交快照 | `git archive --format=tar.gz -o deploy-0f90ce6.tar.gz HEAD` | 5.2MB |
| 5 | 10:10 | 上传代码包 | `scp deploy-0f90ce6.tar.gz Lbx:/tmp/` | 上传成功 |
| 6 | 10:11 | 数据库备份 | `bash Docs/runtime/backup-postgres-docker.sh` | `backups/training_management-20260828-101110.dump`（58K）+ sha256 |
| 7 | 10:12 | 解压覆盖代码 | `tar -xzf /tmp/deploy-0f90ce6.tar.gz -C /opt/training-management --overwrite` | EXTRACT_OK，新文件（src/sms、migrations 0009~0012）就位 |
| 8 | 10:12 | 补齐环境变量键 | 逐个检查缺失键并追加空值占位 | 追加 11 个键（ALIYUN_SMS_* 等） |
| 9 | 10:12 | compose 配置校验 | `docker compose --env-file .env.docker config --quiet` | COMPOSE_CONFIG_OK |
| 10 | 10:12~10:14 | 构建镜像 | `docker compose --env-file .env.docker build` | api / api-migrate / admin / h5 / assessment 全部构建成功（约 2 分钟） |
| 11 | 10:15 | 执行数据库迁移 | `up -d api-migrate` 后轮询状态 | Exited(0)，日志「No pending migrations to apply」 |
| 12 | 10:16 | 既有库手工补列 | `information_schema` 查缺 → 幂等 ALTER SQL（见问题 2） | 11 列补齐、usernameNormalized 回填 1 行、`User_phone_key` 唯一索引创建 |
| 13 | 10:17 | 启动全部服务 | `docker compose --env-file .env.docker up -d` | 全部容器重建，api healthy |
| 14 | 10:18 | 冒烟验证 | 见下「冒烟验证结果」 | 全部通过 |

### 冒烟验证结果（10:18）

```text
admin  18080: 200
h5     18081: 200
assess 18082: 200
/api/health → {"status":"ok","database":"ok"}
错误密码登录 → 401
POST /api/auth/register/sms/request → {"accepted":true,"challengeId":"PRG-...","devCode":"794752"}（fake 模式）
```

### 既有库手工补列 SQL（步骤 12 实际执行内容，幂等可重复）

```sql
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "usernameNormalized" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "agreementVersion" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "agreementAcceptedAt" TIMESTAMP(3);
UPDATE "User" SET "usernameNormalized" = LOWER(TRIM("username")) WHERE "usernameNormalized" IS NULL;
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "specialPriceEndsAt" TEXT;
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "maxParticipantsPerOrder" INTEGER;
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "registrationStartAt" TEXT;
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "registrationEndAt" TEXT;
ALTER TABLE "RegistrationTemplate" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "beforeJson" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "afterJson" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User"("phone");
```

## 环境变量变更记录

配置位置：`/opt/training-management/.env.docker`。修改后执行 `docker compose --env-file .env.docker up -d api --force-recreate` 使新环境变量生效（仅改环境变量无需重新构建镜像）。

| 日期 | 变更 | 说明 |
| --- | --- | --- |
| 2026-08-28 | 追加空值占位：`PHONE_REGISTRATION_WEBHOOK_URL/TOKEN`、`PASSWORD_RESET_WEBHOOK_URL/TOKEN`、`ALIYUN_SMS_ACCESS_KEY_ID/SECRET`、`ALIYUN_SMS_SIGN_NAME`、`ALIYUN_SMS_REGION_ID`、`ALIYUN_SMS_ENDPOINT`、`ALIYUN_SMS_TEMPLATE_CODE_REGISTRATION`、`ALIYUN_SMS_TEMPLATE_CODE_PASSWORD_RESET` | 保证配置文件自描述；短信当前为 fake 模式（验证码打日志并返回 devCode），接入真实短信按 `backend/api/docs/sms-verification-dev-config.md` 第 3、4 节填写 |

## 问题与解决方案

### 问题 1：SSH 默认密钥被拒（Permission denied (publickey,password)）

- 现象：`ssh Lbx` 使用默认密钥认证失败。
- 原因：`~/.ssh/config` 中 Lbx 条目未指定 IdentityFile，默认尝试的密钥未被服务器授权。
- 解决：显式指定部署密钥 `-i ~/.ssh/training-deploy`（`training-management-ed25519` 也可用）。

### 问题 2：api-migrate 显示「No pending migrations」但数据库缺新列

- 现象：迁移容器 Exited(0) 且无迁移执行，但新代码查询 `usernameNormalized` 等列会报错。
- 原因：本项目的 PostgreSQL 迁移是构建期用 `db:prepare:postgres` 按当前 schema 重新生成的单一 `0001_init`；Prisma `migrate deploy` 只按迁移名判断是否已应用（不校验内容），旧库里已记录 `0001_init`，因此新增列被跳过。
- 解决：对既有库执行上面「手工补列 SQL」（全部 `ADD COLUMN IF NOT EXISTS`，幂等）。全新库无此问题（0001_init 直接建全量表结构）。
- 后续建议：若频繁增量上线，考虑为 PostgreSQL 引入真正的增量迁移目录，或上线前用 `prisma migrate diff` 对比库结构。

### 问题 3：宿主机 `curl 127.0.0.1:3100` 返回 000

- 现象：宿主机无法直接访问 API 端口。
- 原因：compose 中 api 服务只 `expose 3100` 未映射宿主机端口，属预期设计（由 admin/h5 容器内 nginx 反代 `/api/`）。
- 解决：验证一律走 `http://127.0.0.1:18081/api/...`（nginx 反代）或容器内 `docker compose exec api ...`。

### 问题 4：（预留，后续问题追加于此）

## 回滚方法

- 代码回滚：用上一版本的 tar 包重新解压覆盖 + 重新 `build` + `up -d`；或在本地 `git checkout <上一提交>` 后重新 `git archive` 打包上传。
- 数据库回滚：`docker compose exec -T postgres psql ... < backups/*.sql`，或用 pg_restore 恢复 `.dump` 备份；恢复前先停 api 容器避免写入冲突。
- 本次补列均为新增列/索引，回滚旧代码时可保留（旧代码不识别新列，不影响运行）。
