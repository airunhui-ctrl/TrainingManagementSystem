# 开发服务器短信验证配置文档

本文档说明在开发服务器（Docker Compose 部署）上配置短信验证码的方法。短信验证码用于两个场景：**手机号短信注册**与**找回密码**，两个场景各自独立适配器，可分别配置。

## 1. 适配器模式

短信发送通过适配器模式实现，配置项为 `PHONE_REGISTRATION_ADAPTER` 与 `PASSWORD_RESET_ADAPTER`：

| 模式 | 说明 | 适用环境 |
| --- | --- | --- |
| `fake` | 不发送真实短信，验证码打印在 API 日志并作为 `devCode` 随接口返回 | 本地/开发（`NODE_ENV=production` 时禁止） |
| `aliyun` | 阿里云短信直连，内置 HMAC-SHA1 签名，无需安装 SDK | 开发/生产 |
| `webhook` | 将验证码 POST 到自建短信网关（JSON），由网关负责发送 | 开发/生产 |
| `disabled` | 禁用该渠道，调用时返回「尚未配置」错误 | 生产 |

默认值：`NODE_ENV` 非 production 时默认 `fake`；production 时默认 `webhook`（未配置 URL 则发送时报错）。`fake` 模式在 production 下会直接抛错，防止误发测试验证码。

## 2. 环境变量清单（服务器 `.env.docker`）

```dotenv
# 渠道适配器（注册 / 找回密码可分别设置）
PHONE_REGISTRATION_ADAPTER=fake
PASSWORD_RESET_ADAPTER=fake

# webhook 模式（可选）：由自建网关发送
PHONE_REGISTRATION_WEBHOOK_URL=
PHONE_REGISTRATION_WEBHOOK_TOKEN=
PASSWORD_RESET_WEBHOOK_URL=
PASSWORD_RESET_WEBHOOK_TOKEN=

# 阿里云短信（注册与找回密码共用 AccessKey/签名，模板可分开）
ALIYUN_SMS_ACCESS_KEY_ID=
ALIYUN_SMS_ACCESS_KEY_SECRET=
ALIYUN_SMS_SIGN_NAME=
ALIYUN_SMS_REGION_ID=cn-hangzhou
ALIYUN_SMS_ENDPOINT=dysmsapi.aliyuncs.com
ALIYUN_SMS_TEMPLATE_CODE_REGISTRATION=
ALIYUN_SMS_TEMPLATE_CODE_PASSWORD_RESET=

# 验证码散列用 salt（可选，缺省回退 JWT_SECRET）
PHONE_REGISTRATION_SECRET=
PASSWORD_RESET_SECRET=
```

## 3. 阿里云短信开通与模板申请

1. 在阿里云开通「短信服务」，申请**签名**（如「六边形培训」）并通过审核。
2. 申请**验证码模板**，内容需包含变量 `${code}`，例如：「您的验证码为 ${code}，10 分钟内有效，请勿泄露。」审核通过后获得模板 CODE（形如 `SMS_123456789`）。
3. 在 RAM 创建子账号 AccessKey，授权 `AliyunDysmsFullAccess`（或最小化 `dysms:SendSms` 权限）。
4. 将 AccessKey/签名/两个模板 CODE 填入 `.env.docker`。

注意：模板变量名必须与代码一致（代码固定传 `code`），否则阿里云返回 `TemplateParameterInvalid`。

## 4. 开发服务器配置步骤

### 阶段一：先用 fake 跑通流程

```bash
cd /opt/training-management
cp .env.docker.example .env.docker
# 编辑 .env.docker：替换 POSTGRES_PASSWORD、JWT_SECRET（至少 32 位）
# 短信渠道保持 fake，NODE_ENV=staging

docker compose --env-file .env.docker up -d --build
```

fake 模式下验证码不真实发送，而是：
- 打印在 API 容器日志：`[phone-registration] challenge=... phone=... code=123456`、`[password-reset] challenge=... code=...`
- 通过接口响应返回 `devCode`，前端/脚本可直接使用完成注册或重置密码。

### 阶段二：切换为阿里云真实短信

```dotenv
NODE_ENV=staging
PHONE_REGISTRATION_ADAPTER=aliyun
PASSWORD_RESET_ADAPTER=aliyun
ALIYUN_SMS_ACCESS_KEY_ID=LTAI...
ALIYUN_SMS_ACCESS_KEY_SECRET=...
ALIYUN_SMS_SIGN_NAME=六边形培训
ALIYUN_SMS_TEMPLATE_CODE_REGISTRATION=SMS_...
ALIYUN_SMS_TEMPLATE_CODE_PASSWORD_RESET=SMS_...
```

```bash
docker compose --env-file .env.docker up -d --build api api-migrate
docker compose --env-file .env.docker logs -f api | grep -E "sms|phone-registration|password-reset"
```

## 5. 配置检查与联调验证

### 配置检查接口

```bash
# 需管理端登录获取 token 后调用
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3100/api/admin/integration-readiness
```

返回结构：`{ generatedAt, channels, passwordReset, phoneRegistration }`，其中每个渠道含 `mode`、`configured`、`productionSafe`、`webhookConfigured`、`missing`（缺失的配置项名）。

### 手机号短信注册（fake 模式联调）

```bash
# 1) 请求验证码，响应含 devCode（fake 模式）
curl -X POST http://127.0.0.1:3100/api/auth/register/sms/request \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800000001"}'

# 2) 用 devCode 完成注册（需传用户名与协议版本）
curl -X POST http://127.0.0.1:3100/api/auth/register/sms/confirm \
  -H "Content-Type: application/json" \
  -d '{"challengeId":"PRG-...","phone":"13800000001","code":"123456","password":"Passw0rd!","confirmPassword":"Passw0rd!","username":"demo-user","agreementVersion":"2026-08-17-v1"}'
```

### 找回密码（fake 模式联调）

```bash
# 1) 请求验证码（仅支持已注册的手机号）
curl -X POST http://127.0.0.1:3100/api/auth/password-reset/request \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800000001"}'

# 2) 用 devCode 重置密码
curl -X POST http://127.0.0.1:3100/api/auth/password-reset/confirm \
  -H "Content-Type: application/json" \
  -d '{"challengeId":"PRC-...","code":"123456","newPassword":"Newpass123!","confirmPassword":"Newpass123!"}'
```

### 验证码规则

- 6 位数字，10 分钟有效
- 同一手机号 10 分钟内最多请求 5 次
- 校验错误 5 次后挑战作废，需重新获取
- 验证码一次性使用（成功后立即作废，未使用的挑战在下次请求时批量作废）

## 6. 常见问题排查

| 现象 | 原因与处理 |
| --- | --- |
| 接口报「阿里云短信缺少配置：XXX」 | 对应 `ALIYUN_SMS_*` 环境变量未填，补齐后重启 api 容器 |
| 接口报「生产环境禁止使用 fake」 | `NODE_ENV=production` 且适配器仍为 fake，改为 aliyun/webhook |
| 阿里云返回 `SignatureDoesNotMatch` | AccessKey 与 Secret 不匹配或含多余空格，检查 `.env.docker` |
| 阿里云返回 `isv.SMS_SIGNATURE_ILLEGAL` | 签名未审核通过或签名内容不一致 |
| 阿里云返回 `isv.TEMPLATE_MISSING_PARAMETERS` / `TemplateParameterInvalid` | 模板变量名不是 `code`，或模板未审核 |
| 阿里云返回 `isv.BUSINESS_LIMIT_CONTROL` | 触发阿里云限频（同一手机号发送频率过高），等待后重试 |
| 一直收不到短信 | 先查 api 日志确认是否进入 aliyun 分支；再查阿里云短信控制台发送记录 |

## 7. 安全注意事项

- `ALIYUN_SMS_ACCESS_KEY_SECRET` 等密钥只放服务器 `.env.docker`，该文件已被 gitignore，禁止提交到 Git。
- `devCode` 仅在 `fake` 模式返回；`aliyun`/`webhook` 模式不返回验证码明文。
- 验证码以散列形式存储（HMAC-SHA256 + `PHONE_REGISTRATION_SECRET`/`PASSWORD_RESET_SECRET`），数据库不保存明文。
- 生产环境务必把两个适配器从 `fake` 切换到 `aliyun` 或 `webhook`。

## 8. 本次提交相关的部署提醒

- 本次提交包含数据库迁移 `0009`~`0012`，全新库由 `api-migrate` 容器（`prisma migrate deploy`）自动执行；**已有数据的开发库**需先备份（`Docs/runtime/backup-postgres-docker.sh`）并核对 `_prisma_migrations` 中 `0001_init` 校验和，若不一致需手工执行迁移 SQL（`0010/0011/0012`）。
- 迁移 `0012` 删除用户名不区分大小写的唯一索引；登录与注册查重现在严格区分大小写。
- 若需通过域名访问三个站点（管理端/移动端/测评），使用 `deploy/host-nginx/training-proxy.conf` 配置宿主机 Nginx 转发（18080/18081/18082）。

