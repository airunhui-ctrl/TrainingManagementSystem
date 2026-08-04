# 培训管理系统 MVP

## 目录结构

```text
frontend/
  client-uni/       # C 端：uni-app + Vue 3 + TypeScript
  admin-react/      # 管理端：React + TypeScript + Vite
backend/
  api/              # 服务端：NestJS + TypeScript + JWT
mvp/
  static-demo/      # 零依赖静态演示
  scripts/          # 演示服务与验证脚本
Docs/
  FeatureList/      # 产品需求、Excel 清单、技术选型
  Plans/            # task_plan、findings、progress 及前置准备
  Summary/          # 阶段总结
  outputs/          # Excel 交付物
```

## 常用命令

```powershell
pnpm install
pnpm --dir backend/api db:init
pnpm run dev:api
pnpm run dev:admin
pnpm run dev:client
pnpm run verify
pnpm run build:client
pnpm run build:admin
pnpm run build:api
pnpm run preview:static
```

## Docker Compose 单机部署

当前服务器推荐使用 Docker Compose：API、管理端、C 端 H5 和 PostgreSQL 分别运行，PostgreSQL 与上传文件使用持久化卷；当前代码未使用 Redis，因此暂不部署 Redis。

```bash
cp .env.docker.example .env.docker
# 编辑 .env.docker，设置 PostgreSQL 密码、DATABASE_URL 和 JWT_SECRET
docker compose --env-file .env.docker config
docker compose --env-file .env.docker build
docker compose --env-file .env.docker up -d
```

内网地址：管理端 `http://服务器IP:8080`，C 端 H5 `http://服务器IP:8081`。SQLite 到 PostgreSQL 的迁移、备份和回滚步骤见 `Docs/Summary/2026-08-04_DockerCompose单机部署实施方案.md`。

默认 API 地址为 `http://localhost:3100/api`，可通过 `VITE_API_BASE_URL` 覆盖。演示账号：`admin/123456`、`operator/123456`、`demo/123456`。

## 说明

- C 端正式源码必须放在 `frontend/client-uni/src/`，这是当前 uni-app CLI 的输入目录约定。
- C 端与管理端均通过独立 API client 接入后端，静态演示仅用于快速验收。
- 本地开发默认使用 Prisma + SQLite，数据库位于 `backend/api/data/training.db`；Docker 单机内测使用 PostgreSQL 持久化卷。线下支付凭证存放在 API 的持久化 storage 卷。
- 真实支付、短信、电子发票和对象存储在后续阶段通过接口适配层接入。
