# API MVP

## 启动

```powershell
pnpm install
pnpm --dir backend/api start:dev
```

默认端口为 `3100`，API 前缀为 `/api`。如需覆盖端口，可在启动前设置 `PORT` 环境变量；请勿使用 `3000`，该端口已由其他项目占用。

## JWT 演示账号

- `admin / 123456`：平台管理员
- `operator / 123456`：运营人员
- `demo / 123456`：C 端用户

登录接口：`POST /api/auth/login`；鉴权接口：`GET /api/auth/me`。鉴权请求需使用 `Authorization: Bearer <accessToken>` 请求头。

access token 与 refresh token 已区分类型，refresh token 单次消费后轮换；禁用用户会被实时拒绝并吊销刷新令牌。生产环境仍需使用强随机 JWT secret、HTTPS 和密钥轮换。
## SQLite 本地运行

复制根目录 `.env.example` 为 `.env` 后执行：

```powershell
pnpm --dir backend/api db:init
pnpm --dir backend/api start:dev
```

默认端口为 `3100`，数据库文件为 `data/training.db`（可由 `DATABASE_FILE` 或 `DATABASE_URL=file:...` 覆盖），支付凭证保存在 `storage/payment-proofs`。种子账号：`demo/123456`（普通用户）、`admin/123456` 和 `operator/123456`（管理员）。

运行时使用 Prisma Client 直接读写 SQLite 结构化表。`db:init` 会生成 Client、执行兼容迁移和种子；旧版 `AppState` 数据会事务迁移到结构化表并清理。生产环境将 provider 切换到 PostgreSQL，并把凭证目录替换为对象存储适配器。

## 验证

```powershell
pnpm --dir backend/api test
pnpm --dir backend/api build
```

测试使用系统临时目录中的独立 SQLite 数据库，不会污染正式 `data/training.db`。

## 阿里云短信

注册验证码与找回密码验证码可分别使用阿里云短信模板。开发环境保持 `fake`，生产环境将两个适配器设为 `aliyun`：

```dotenv
PHONE_REGISTRATION_ADAPTER=aliyun
PASSWORD_RESET_ADAPTER=aliyun
```

阿里云短信必需配置：

- `ALIYUN_SMS_ACCESS_KEY_ID`
- `ALIYUN_SMS_ACCESS_KEY_SECRET`
- `ALIYUN_SMS_SIGN_NAME`
- `ALIYUN_SMS_TEMPLATE_CODE_REGISTRATION`
- `ALIYUN_SMS_TEMPLATE_CODE_PASSWORD_RESET`

发送接口由 `src/sms/aliyun-sms.ts` 使用内置 HMAC-SHA1 签名调用，无需额外安装 SDK。配置检查接口：`GET /api/admin/integration-readiness`。AccessKeySecret 只放服务器环境变量或本地 `.env`，不要提交到 Git。
