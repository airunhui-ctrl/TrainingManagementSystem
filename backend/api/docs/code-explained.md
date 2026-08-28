# 最近变更代码详解

> 说明：本文逐行或逐逻辑行讲解本次功能提交 `1353f36` 的关键代码。模板闭合标签、纯空行、仅格式调整的行不再单独重复解释。部署与运维过程见 [部署操作记录](deployment-log.md)，短信服务商配置见 [短信验证配置](sms-verification-dev-config.md)。

## 1. 短信适配器

### 1.1 `backend/api/src/sms/aliyun-sms.ts`

```ts
import { BadRequestException } from '@nestjs/common'
import { createHmac, randomBytes } from 'node:crypto'
```

- 第 1 行引入 NestJS 统一异常类，配置不完整或服务商返回失败时，API 返回 400，而不是让服务以未处理异常崩溃。
- 第 2 行引入 Node.js crypto：`createHmac` 用于阿里云旧版 RPC 签名，`randomBytes` 用于生成一次性签名随机数。

```ts
export interface AliyunSmsSendInput {
  phone: string
  signName: string
  templateCode: string
  templateParam: Record<string, string | number>
  accessKeyId: string
  accessKeySecret: string
  regionId?: string
  endpoint?: string
}
```

- `phone` 是国内 11 位手机号。
- `signName` 必须与阿里云短信控制台审核通过的签名完全一致。
- `templateCode` 是 `SMS_xxxxxxxx` 形式的模板 ID。
- `templateParam` 是模板变量，例如 `{ code: '123456' }`；阿里云要求序列化成 JSON 字符串传输。
- AccessKey ID/Secret 用于签名；Secret 不写入日志、接口响应或前端。
- `regionId` 与 `endpoint` 可选；不传时分别使用 `cn-hangzhou` 和 `dysmsapi.aliyuncs.com`。

```ts
export interface AliyunSmsResult {
  delivered: boolean
  requestId?: string
  bizId?: string
  devCode?: string
}
```

- 该类型统一成功结果；`requestId` 便于阿里云工单排查，`bizId` 是发送流水号。
- `devCode` 供非生产 fake 模式返回，阿里云真实模式不会返回。

```ts
const DEFAULT_REGION = 'cn-hangzhou'
const DEFAULT_ENDPOINT = 'dysmsapi.aliyuncs.com'
```

- 这两个值是阿里云短信 API 的常用默认值，显式声明可避免在多个分支重复硬编码。

```ts
export function percentEncode(value: string) {
  return encodeURIComponent(value)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~')
}
```

- 阿里云 RPC 协议要求 RFC 3986 编码。
- 浏览器风格 `encodeURIComponent` 与该规范的差异是：`+` 必须变成 `%20`、`*` 必须变成 `%2A`、波浪号 `~` 保持不编码。
- 没有这一步时，含特殊字符的签名或模板参数可能被服务商判定签名错误。

```ts
export function buildAliyunSmsQuery(input: AliyunSmsSendInput, now = new Date()) {
  const timestamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z')
  const templateParam = JSON.stringify(input.templateParam)
```

- 函数把业务输入转换为“公共参数 + 业务参数 + 签名”。
- `now` 允许测试注入固定时间，保证单测稳定。
- `toISOString()` 生成 `2026-08-28T02:00:00.000Z`；阿里云接受秒级 UTC，因此用正则去掉毫秒部分。
- `templateParam` 必须序列化后再参与签名和请求。

```ts
  const params = {
    AccessKeyId: input.accessKeyId,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: input.phone,
    RegionId: input.regionId || DEFAULT_REGION,
    SignName: input.signName,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: randomBytes(12).toString('hex'),
    SignatureVersion: '1.0',
    TemplateCode: input.templateCode,
    TemplateParam: templateParam,
    Timestamp: timestamp,
    Version: '2017-05-25',
  }
```

- `Action=SendSms` 选择阿里云发送短信接口。
- `Format=JSON` 让响应返回 JSON。
- `SignatureNonce` 每次请求都要不同，防止重放。
- `Version=2017-05-25` 是短信服务 API 版本，不是代码版本。

```ts
  const canonicalized = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&')
  const stringToSign = `GET&%2F&${percentEncode(canonicalized)}`
```

- 签名前必须按参数名字典序排序。
- key 和 value 都要 RFC 3986 编码，再用 `&` 连接。
- 阿里云旧 RPC 的待签串固定为 `HTTPMethod + & + percentEncode("/") + & + percentEncode(canonicalQuery)`。
- 当前使用 GET，所以待签串前缀是 `GET&%2F&`。

```ts
  const signature = createHmac('sha1', `${input.accessKeySecret}&`)
    .update(stringToSign)
    .digest('base64')
  return { ...params, Signature: signature, stringToSign }
```

- HMAC-SHA1 的 key 不是裸 Secret，而是 `AccessKeySecret + '&'`。
- 输出必须是 Base64。
- `stringToSign` 只用于测试和调试，实际请求参数通过解构排除，避免把待签串本身发给服务商。

```ts
export async function sendAliyunSms(input, fetchImpl = (...args) => fetch(...args)) {
  const missing: string[] = []
  if (!String(input.accessKeyId || '').trim()) missing.push('AccessKeyId')
  if (!String(input.accessKeySecret || '').trim()) missing.push('AccessKeySecret')
  if (!String(input.signName || '').trim()) missing.push('SignName')
  if (!String(input.templateCode || '').trim()) missing.push('TemplateCode')
  if (!/^1\d{10}$/.test(String(input.phone || ''))) missing.push('PhoneNumbers')
  if (missing.length) throw new BadRequestException(`阿里云短信配置不完整：${missing.join('、')}`)
```

- `fetchImpl` 是依赖注入参数；单测可以替换成假 fetch，不会真实请求阿里云。
- 五项必填参数逐个判断，报错一次性列出缺失项，便于运维核对。
- 手机号校验后置于业务层基本校验之外，最终在此处兜底，防止适配器被误用时发送非法号码。

```ts
  const { stringToSign, ...query } = buildAliyunSmsQuery(input)
  const endpoint = String(input.endpoint || DEFAULT_ENDPOINT).replace(/^https?:\/\//, '').replace(/\/$/, '')
  const encodedQuery = Object.keys(query)
    .map((key) => `${percentEncode(key)}=${percentEncode(query[key])}`)
    .join('&')
  const response = await fetchImpl(`https://${endpoint}/?${encodedQuery}`, { method: 'GET' })
```

- 先从签名结果中删除 `stringToSign`，只发送正常参数和 `Signature`。
- endpoint 允许配置成 `https://xxx/`，这里统一去掉协议和末尾斜杠，再强制使用 HTTPS。
- 请求参数也重新做 RFC 3986 编码。

```ts
  let payload: Record<string, any> = {}
  try {
    payload = await response.json()
  } catch {
    payload = {}
  }
  if (!response.ok || payload.Code !== 'OK') {
    throw new BadRequestException(`阿里云短信发送失败：${payload.Code || response.status} ${payload.Message || ''}${payload.RequestId ? ` RequestId=${payload.RequestId}` : ''}`.trim())
  }
  return { delivered: true, requestId: payload.RequestId, bizId: payload.BizId }
}
```

- 阿里云业务失败时 HTTP 状态不一定是 4xx/5xx，所以必须同时检查 `response.ok` 和 `payload.Code === 'OK'`。
- 响应体不是 JSON 时降级为空对象，避免解析异常掩盖真实网络状态。
- 错误信息包含业务 Code、Message 和 RequestId，不含 AccessKey Secret。

### 1.2 `backend/api/src/auth/phone-registration-delivery.ts`

```ts
function requiredSmsEnv(name: string) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new BadRequestException(`阿里云短信缺少配置：${name}`)
  return value
}
```

- 只按需读取环境变量名，不记录值。
- 空字符串视同未配置。

```ts
function aliyunSmsReadiness(templateKey: string) {
  const required = ['ALIYUN_SMS_ACCESS_KEY_ID', 'ALIYUN_SMS_ACCESS_KEY_SECRET', 'ALIYUN_SMS_SIGN_NAME', templateKey]
  const missing = required.filter((key) => !String(process.env[key] || '').trim())
  return { configured: missing.length === 0, missing }
}
```

- 健康检查只报告缺失变量名，不暴露任何 Secret。
- 注册和找回密码的模板不同，所以 `templateKey` 由调用方传入。

```ts
const mode = process.env.PHONE_REGISTRATION_ADAPTER || (nodeEnv === 'production' ? 'webhook' : 'fake')
```

- 默认策略：开发/测试用 fake；生产默认 webhook，防止开发假验证码泄漏到生产。
- 显式配置 `aliyun` 时，下面分支优先于默认策略。

```ts
if (mode === 'fake') {
  return { mode, configured: nodeEnv !== 'production', productionSafe: false, ... }
}
```

- fake 模式在非生产视为“已配置”，但 `productionSafe` 始终为 false。

```ts
if (mode === 'aliyun') {
  const { configured, missing } = aliyunSmsReadiness('ALIYUN_SMS_TEMPLATE_CODE_REGISTRATION')
  return { mode, configured, productionSafe: configured, ... }
}
```

- 只有四个必填变量都存在才认为阿里云渠道就绪。

```ts
const webhookConfigured = Boolean(String(process.env.PHONE_REGISTRATION_WEBHOOK_URL || '').trim())
```

- 任意非 webhook 值最终走该分支。
- webhook 只有配置 URL 才算就绪；Token 可选，用于给下游接口加 Bearer 认证。

```ts
if (mode === 'fake') {
  if (process.env.NODE_ENV === 'production') throw new BadRequestException('生产环境禁止使用 fake 手机短信渠道')
  console.info(`[phone-registration] challenge=${input.challengeId} phone=${input.phone} code=${input.code}`)
  return { delivered: false, devCode: input.code }
}
```

- 生产环境硬禁止 fake 模式。
- 开发日志方便联调；如果日志系统会同步到敏感环境，应关闭 fake 模式。

```ts
if (mode === 'aliyun') {
  return sendAliyunSms({ ... })
}
```

- 从环境变量读取签名、模板、AK/SK、地域和 endpoint。
- `templateParam` 只传验证码，避免模板内容与阿里云审核模板不一致。

```ts
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({ type: 'phone_registration', challengeId, phone, code, expiresInMinutes: 10 }),
})
if (!response.ok) throw new BadRequestException(`短信验证码发送失败：${response.status}`)
```

- webhook 模式向自建短信网关 POST JSON。
- Token 存在时才添加 Authorization，避免发送空 Bearer。
- 非 2xx 视为失败；API 层会在异常时删除刚创建的挑战记录，避免留下可用但未发送的验证码。

### 1.3 `backend/api/src/auth/password-reset-delivery.ts`

- 该文件结构与手机注册发送器一致，但有两个差异：
  - 环境变量前缀为 `PASSWORD_RESET_*`。
  - 阿里云模板变量为 `ALIYUN_SMS_TEMPLATE_CODE_PASSWORD_RESET`。
  - webhook 请求体携带 `targetType: 'phone'`，便于网关区分找回密码场景。
- 重复结构保留了两个渠道互相隔离的能力：后续一个渠道接入阿里云、另一个接入企业网关时，不需要共享可变配置。

## 2. 认证与验证码

### 2.1 登录：用户名严格区分大小写

```ts
const username = String(usernameInput || '').trim()
const row = (await this.db.user.findFirst({ where: { username } })) ||
  (/^1\d{10}$/.test(username) ? await this.db.user.findFirst({ where: { phone: username } }) : null)
```

- 只去除首尾空格，不执行 `toLowerCase()`。
- `findFirst({ where: { username } })` 使用数据库原值精确比较，因此 `aaron` 与 `Aaron` 是两个不同用户名。
- 如果输入匹配国内 11 位手机号，才会按手机号查找；手机号本身数字没有大小写概念。
- 查找顺序是“先用户名，再手机号”，避免同名用户名和手机号造成歧义。

```ts
if (!row || !row.enabled || !passwordMatches(password, row.passwordHash)) throw new UnauthorizedException('账号或密码错误')
```

- 用户不存在、用户被禁用、密码错误都返回同一条错误，避免向攻击者暴露账号存在性。
- `passwordMatches` 使用 scrypt 并用 `timingSafeEqual` 比较摘要。

### 2.2 账号密码注册：注册查重也区分大小写

```ts
const username = String(input.username || '').trim()
const normalizedUsername = normalizeUsername(username)
```

- `username` 保留用户输入的大小写，作为登录展示和精确登录依据。
- `usernameNormalized` 只存储小写/trim 结果，用于管理端搜索和历史兼容，不用于登录匹配。

```ts
if (!isValidPassword(input.password)) throw new BadRequestException(PASSWORD_POLICY_MESSAGE)
if (input.agreementVersion !== AGREEMENT_VERSION) throw new BadRequestException('请先阅读并同意用户协议和隐私政策')
const exists = await this.db.user.findFirst({ where: { username } })
if (exists) throw new ConflictException('账号已存在，请直接登录')
```

- 密码必须 8-64 位，且同时包含字母、数字、符号。
- 协议版本必须和后端当前版本一致，防止旧前端未展示新版协议就提交。
- 查重条件是 `username` 原值精确匹配，所以注册 `Aaron` 不会因为已有 `aaron` 而被拒绝。
- 如需同时禁止“视觉同名”账号，必须显式恢复 `usernameNormalized` 唯一索引；当前业务决定允许大小写不同账号。

```ts
if (phone && await this.db.user.findFirst({ where: { phone } })) throw new ConflictException('手机号已绑定其他账号')
if (email && await this.db.user.findFirst({ where: { email } })) throw new ConflictException('邮箱已绑定其他账号')
```

- 手机号与邮箱只在用户填写时校验。
- 手机号数据库层也有唯一索引兜底；并发注册时事务会失败，避免重复绑定。

```ts
const created = await tx.user.create({ data: {
  username,
  usernameNormalized: normalizedUsername,
  passwordHash: hashPassword(input.password),
  ...
  ...agreementRecord(),
} })
await tx.auditLog.create({ data: { ..., action: '用户注册', detail: '账号密码注册' } })
```

- 创建用户和审计日志在同一个事务，保证注册成功必有审计记录。
- 密码不落明文，只保存 `salt:scryptHash`。
- `agreementRecord()` 写入协议版本和同意时间。

### 2.3 手机号注册验证码申请

```ts
if (!/^1\d{10}$/.test(phone)) throw new BadRequestException('请输入有效的手机号')
const existing = await this.db.user.findFirst({ where: { phone } })
if (existing) return { accepted: false, phoneRegistered: true, message: '该手机号已被注册，请直接登录' }
```

- 只允许 `1` 开头的 11 位数字。
- 已注册手机号直接返回业务提示，不生成挑战，也不发送短信。

```ts
const recentCount = await this.db.phoneRegistrationChallenge.count({ where: { phone, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } } })
if (recentCount >= 5) return { accepted: true, challengeId, message: '请求过于频繁，请稍后再试' }
```

- 10 分钟内同手机号最多 5 次申请。
- 超限时返回 `accepted: true`，避免接口明确告知攻击者“已被限流”，但不会创建有效挑战。

```ts
const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
await this.db.phoneRegistrationChallenge.updateMany({ where: { phone, usedAt: null }, data: { usedAt: new Date() } })
await this.db.phoneRegistrationChallenge.create({ data: {
  id: challengeId,
  phone,
  codeHash: this.registrationCodeHash(challengeId, code),
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  requestIp: requestIp || null,
} })
```

- `randomInt` 是密码学安全随机数；`padStart` 保证 `000123` 这类六位码格式。
- 新挑战创建前把旧未使用挑战作废。
- 数据库只保存加盐 pepper 后的 SHA-256 摘要，不保存明文验证码。
- 有效期 10 分钟。

```ts
try {
  const delivery = await deliverPhoneRegistrationCode({ challengeId, phone, code })
  return { accepted: true, challengeId, ..., ...(delivery.devCode ? { devCode: delivery.devCode } : {}) }
} catch (error) {
  await this.db.phoneRegistrationChallenge.delete({ where: { id: challengeId } }).catch(() => undefined)
  throw error
}
```

- 先落库、后发送，避免短信发送成功但数据库写入失败导致无法核销。
- 发送失败删除挑战，防止用户没收到短信却留下可尝试的验证码。
- fake 模式的 `devCode` 只在非生产返回给前端展示。

### 2.4 手机号注册确认

```ts
const challenge = await this.db.phoneRegistrationChallenge.findFirst({ where: { id: input.challengeId, phone } })
if (!challenge) throw new BadRequestException('验证码无效，请重新获取')
if (challenge.usedAt || challenge.expiresAt <= new Date()) throw new BadRequestException('验证码无效或已过期')
if (challenge.attempts >= 5) throw new BadRequestException('验证码错误次数过多，请重新获取')
```

- challengeId 和手机号必须同时匹配，防止拿 A 手机号的挑战给 B 手机号提交。
- 单次使用、有效期、尝试次数三层校验缺一不可。

```ts
if (challenge.codeHash !== this.registrationCodeHash(challenge.id, input.code)) {
  await this.db.phoneRegistrationChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } })
  throw new BadRequestException('验证码错误')
}
```

- 只在验证码不匹配时递增失败次数。
- 超过 5 次后即使后续猜中也不允许通过。

```ts
const consumed = await tx.phoneRegistrationChallenge.updateMany({ where: { id: challenge.id, usedAt: null }, data: { usedAt: new Date() } })
if (consumed.count !== 1) throw new BadRequestException('验证码无效或已被使用')
```

- 使用条件更新做一次性核销，避免并发请求同时消费同一个验证码。
- `count === 1` 才表示当前事务成功抢占到这一次使用权。

```ts
if (!/^[A-Za-z0-9_.@+-]{3,64}$/.test(username)) throw new BadRequestException('用户名需 3-64 位，可用字母、数字和 _ . @ + -')
const existingUsername = await this.db.user.findFirst({ where: { username } })
if (existingUsername) throw new ConflictException('用户名已存在，请更换后重试')
```

- 用户名白名单防止空字符串、换行和控制字符。
- 查重同样精确区分大小写。

### 2.5 找回密码申请与确认

```ts
if (!row || !row.enabled) return { accepted: true, challengeId, message: '如果手机号已注册，验证码会发送到该手机号' }
```

- 手机号不存在或用户被禁用时返回相同文案，避免枚举已注册手机号。

```ts
await this.db.passwordResetChallenge.updateMany({ where: { userId: row.id, usedAt: null }, data: { usedAt: new Date() } })
```

- 新验证码申请会使旧验证码失效。

```ts
const consumed = await tx.passwordResetChallenge.updateMany({ where: { id: challenge.id, usedAt: null }, data: { usedAt: new Date() } })
if (consumed.count !== 1) throw new BadRequestException('验证码无效或已被使用')
await tx.user.update({ where: { id: challenge.userId }, data: { passwordHash: hashPassword(input.newPassword), sessionVersion: { increment: 1 } } })
await tx.refreshToken.updateMany({ where: { userId: challenge.userId, revokedAt: null }, data: { revokedAt: new Date() } })
```

- 同一事务内完成：一次性核销、重置密码、递增会话版本、吊销刷新令牌。
- 任何一步失败整体回滚，不会出现验证码已核销但密码未重置的状态。

```ts
private resetCodeHash(challengeId: string, code: string) {
  const pepper = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET || 'development-reset-secret'
  return createHash('sha256').update(`${challengeId}:${code}:${pepper}`).digest('hex')
}
```

- 数据库泄漏时不能直接还原验证码。
- pepper 缺失时只能使用开发默认值；生产必须配置独立 `PASSWORD_RESET_SECRET`。

## 3. 数据库迁移

### 3.1 `0009_p0_internal_loop/migration.sql`

```sql
ALTER TABLE "User" ADD COLUMN "agreementVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "agreementAcceptedAt" DATETIME;
ALTER TABLE "Course" ADD COLUMN "specialPriceEndsAt" TEXT;
ALTER TABLE "Course" ADD COLUMN "maxParticipantsPerOrder" INTEGER;
ALTER TABLE "Course" ADD COLUMN "registrationStartAt" TEXT;
ALTER TABLE "Course" ADD COLUMN "registrationEndAt" TEXT;
ALTER TABLE "RegistrationTemplate" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AuditLog" ADD COLUMN "beforeJson" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "afterJson" TEXT;
```

- 用户表保存同意的协议版本和同意时间，用于后续协议升级强制重新确认。
- 课程表新增报名开始/结束时间、单笔订单最大人数、特价结束时间。
- 报名模板新增启用状态，默认启用。
- 审计表新增前后快照，便于后台追溯管理员变更。

### 3.2 `0010_username_case_phone/migration.sql`

```sql
ALTER TABLE "User" ADD COLUMN "usernameNormalized" TEXT;
UPDATE "User" SET "usernameNormalized" = LOWER(TRIM("username")) WHERE "usernameNormalized" IS NULL;
```

- 新增归一化字段。
- 只回填空值，避免覆盖已有数据。

### 3.3 `0011_phone_unique/migration.sql`

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User"("phone");
```

- 手机号唯一索引兜底并发注册。
- `IF NOT EXISTS` 让幂等执行更安全。

### 3.4 `0012_username_case_sensitive/migration.sql`

```sql
DROP INDEX IF EXISTS "User_usernameNormalized_key";
```

- 删除归一化用户名唯一索引。
- 数据库层面不再阻止 `aaron` 和 `Aaron` 共存。
- 登录和注册查重也改为 `username` 原值精确匹配，三者保持一致。

### 3.5 线上既有库补列 SQL

旧测试库的迁移记录已经是 `0001_init`，Prisma 只按迁移名称判断已应用，不会重放内容。因此 2026-08-28 部署时使用幂等 SQL 手工补齐缺失列，完整 SQL 与执行结果记录在 [部署操作记录](deployment-log.md)。

## 4. Prisma 服务

### 4.1 数据库连接

```ts
if (/^(postgres(ql)?|mysql):\/\//i.test(configuredUrl)) return configuredUrl
```

- PostgreSQL/MySQL 连接串原样交给 Prisma。
- 避免把 `postgres://...` 误当成 SQLite 文件路径。

```ts
const filePath = isAbsolute(value) ? value : resolve(process.cwd(), value)
mkdirSync(dirname(filePath), { recursive: true })
return `file:${filePath.replace(/\\/g, '/')}`
```

- SQLite 模式下自动创建父目录。
- Windows 反斜杠统一为 `/`，提高 Prisma URL 兼容性。

### 4.2 密码哈希

```ts
const salt = randomBytes(16).toString('hex')
return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
```

- 每个密码使用独立 16 字节随机盐。
- scrypt 输出 64 字节，存储格式为 `salt:hash`。

```ts
return expected.length === actual.length && timingSafeEqual(actual, expected)
```

- 先比较长度，避免 `timingSafeEqual` 因长度不同抛异常。
- 恒定时间比较降低时序侧信道风险。

### 4.3 审计快照

```ts
const snapshot = (value: unknown) => value === undefined || value === null
  ? null
  : typeof value === 'string' ? value : JSON.stringify(value)
return this.auditLog.create({ data: { ..., beforeJson: snapshot(before), afterJson: snapshot(after) } })
```

- 空值统一存 `null`。
- 字符串按原文存，对象序列化为 JSON。
- 管理端审计列表可以把 `beforeJson/afterJson` 展示为“变更前/变更后”。

## 5. C 端前端

### 5.1 `frontend/client-uni/src/main.ts`

```ts
if (typeof document !== 'undefined') {
  document.addEventListener('wheel', (event) => {
    const target = event.target as HTMLElement | null
    if (target && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'number') {
      event.preventDefault()
    }
  }, { passive: false })
}
```

- 只在 H5/浏览器存在 `document` 时注册，小程序环境不受影响。
- 监听全局滚轮事件。
- 事件目标命中 `input[type=number]` 时阻止默认行为，浏览器就不会滚动增减数值。
- `passive: false` 是必须的；只有非 passive 监听器才能调用 `preventDefault()`。

### 5.2 `frontend/client-uni/src/common/api.ts`

```ts
const BASE_URL = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? '/api' : 'http://localhost:3100/api')
```

- 优先使用构建期环境变量。
- H5 默认走同源 `/api`，由 Vite/nginx 代理，避免浏览器跨域。
- 非 H5 平台默认访问本机 API，便于开发。

```ts
let refreshing: Promise<string> | null = null
```

- 模块级共享刷新 Promise，避免多个请求同时收到 401 后重复刷新。

```ts
function refreshAccessToken(): Promise<string> {
  const refreshToken = tokenStorage.getRefreshToken()
  if (!refreshToken) return Promise.reject(new Error('登录已过期'))
  if (!refreshing) refreshing = new Promise((resolve, reject) => { ... }).finally(() => { refreshing = null })
  return refreshing
}
```

- 无 refresh token 直接失败。
- 已有刷新请求时复用同一个 Promise。
- `finally` 在成功或失败后清空，允许下次重新刷新。

```ts
if (response.statusCode === 401 && !retried && tokenStorage.getRefreshToken()) {
  try { await refreshAccessToken(); resolve(await performRequest<T>(options, true)); return } catch { /* clear below */ }
}
```

- 401 先尝试刷新。
- 刷新成功后用新 token 重放原请求一次，`retried=true` 防止无限循环。

```ts
if (response.statusCode === 401) {
  if (accessToken) { tokenStorage.clear(); uni.switchTab({ url: '/pages/index/index' }); reject(new Error('登录已过期')); return }
}
```

- 只有“原来带 accessToken 的受保护请求”在刷新失败后才清会话并跳首页。

```ts
if (accessToken) { ... }
// 未携带会话的匿名请求（如登录失败）只返回错误，不跳转首页
```

- 登录接口本身没有 accessToken，401 会进入普通错误分支，页面只显示“账号或密码错误”，不再跳转首页。

```ts
if (response.statusCode >= 400) {
  const payload = response.data
  const message = Array.isArray(payload?.message) ? payload.message.join('；') : payload?.message || payload?.error
  reject(new Error(message || `请求失败：${response.statusCode}`))
  return
}
```

- NestJS 校验错误的 `message` 可能是字符串数组，这里合并成可读文案。
- 页面 `catch (error)` 后用 `error.message` 显示 toast。

### 5.3 `frontend/client-uni/src/common/agreement.ts`

```ts
if (!tokenStorage.getAccessToken()) return true
```

- 未登录用户不强制协议检查。

```ts
const profile = await api.profile()
if (!profile.agreementRequired) return true
```

- 已登录用户由后端判断是否签署当前协议版本，前端不自行信任本地版本。

```ts
catch { return true }
```

- profile 接口暂时失败时不阻断浏览；受保护操作仍会由各自鉴权拦截。

```ts
const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''
uni.navigateTo({ url: `/pages/agreement/agreement${query}` })
return false
```

- 保存原目标页面，协议同意后可以返回或继续原流程。
- 返回 false 让调用方知道当前操作已被协议页接管。

### 5.4 `frontend/client-uni/src/pages/forgot-password/forgot-password.vue`

```html
<view class="code-row">
  <input v-model="code" class="field-input" type="number" maxlength="6" ... />
  <button class="code-btn" :disabled="countdown > 0 || requesting" ...>...</button>
</view>
```

- `code-row` 是横向 flex 容器。
- 验证码输入框 `flex:1; min-width:0`，按钮固定 210rpx，形成“左输入、右按钮”。
- 60 秒倒计时或发送请求中禁用按钮。

```ts
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)
```

- 两个密码框显隐状态独立，互不影响。

```html
<input v-model="newPassword" class="field-input" :password="!showNewPassword" ... />
<text class="password-toggle" @tap="showNewPassword = !showNewPassword">{{ showNewPassword ? '隐藏' : '显示' }}</text>
```

- uni-app 的 `password` 属性绑定布尔值；`false` 显示明文，`true` 显示圆点。
- 点击文字切换状态，标签随状态变化。

```ts
if (!/^1\d{10}$/.test(phone.value.trim())) return uni.showToast({ title: '请输入正确的注册手机号', icon: 'none' })
```

- 找回密码只接受注册手机号，不再接受账号或邮箱。

```ts
const result = await api.requestPasswordReset(phone.value.trim())
challengeId.value = result.challengeId
devCode.value = result.devCode || ''
```

- 后端返回的 challengeId 是后续提交验证码的凭据。
- 只有 fake 模式返回 `devCode`，真实短信模式为空。

```ts
timer = setInterval(() => { countdown.value -= 1; if (countdown.value <= 0 && timer) { clearInterval(timer); timer = undefined } }, 1000)
```

- 每秒倒计时，到 0 清理定时器。

```ts
catch (error) { uni.showToast({ title: error?.message || '密码重置失败', icon: 'none' }) }
```

- 所有失败都停留在当前页面并显示后端/本地校验错误，不做页面跳转。

```ts
onUnload(() => {
  if (timer) clearInterval(timer)
  timer = undefined
  if (navigateBackTimer) clearTimeout(navigateBackTimer)
  navigateBackTimer = null
})
```

- 卸载页面清理倒计时和成功后延迟返回定时器，避免跨页面执行状态更新。

### 5.5 `frontend/client-uni/src/stores/auth.ts`

```ts
logout(redirectUrl?: string) {
  this.accessToken = ''
  this.userName = ''
  tokenStorage.clear()
  if (redirectUrl) uni.navigateTo({ url: redirectUrl })
  else uni.switchTab({ url: '/pages/index/index' })
}
```

- 可选参数控制退出后目标页。
- 传 `redirectUrl` 用 `navigateTo`，适合跳到登录/协议页。
- 不传时保持原有首页行为。

## 6. 业务与后台

### 6.1 课程报名窗口

`mvp.service.ts` 中原来的“只判断报名截止时间”改为双边界：

```ts
const notStarted = startAt !== null && startAt > Date.now()
const ended = endAt !== null && endAt <= Date.now()
```

- `registrationStartAt` 晚于当前时间：未开始，不可报名。
- `registrationEndAt` 或旧字段 `registrationDeadline` 早于等于当前时间：已结束，不可报名。
- 老数据没有开始时间时 `startAt === null`，视为立即开始，保持兼容。

单笔订单人数限制在校验参与者数量时执行：

- 未配置或非正整数时不限制。
- 配置后参与者人数不能大于课程剩余名额和单笔上限中的较小值。

### 6.2 协议与密码接口

```ts
@Post('profile/agreement') acceptAgreement(@Req() request: any) { return this.mvp.acceptAgreement(request.user.sub) }
```

- 登录用户签署当前 `AGREEMENT_VERSION`。
- 后端写入版本和时间，并返回 `agreementRequired` 的最新结果。

```ts
@Post('profile/password') changePassword(..., @Body('oldPassword') oldPassword?: string, @Body('password') password?: string) {
  return this.mvp.changePassword(request.user.sub, oldPassword, password)
}
```

- 修改密码必须先验证旧密码。
- 新密码复用 `isValidPassword`，与注册、找回密码保持同一策略。

### 6.3 反馈附件

```ts
@UseInterceptors(FileInterceptor('file', { limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024) } }))
feedbackAttachment(..., @UploadedFile() file?: { ... }) {
  if (!file) throw new BadRequestException('请选择反馈附件图片')
  return this.mvp.uploadFeedbackAttachment(request.user.sub, file)
}
```

- 字段名固定为 `file`。
- 上传层先限制 5MB，可通过 `MAX_UPLOAD_BYTES` 调整。

```ts
const attachments = Array.isArray(payload.attachments) ? payload.attachments.map(...).filter(...) : []
if (attachments.length > MAX_FEEDBACK_ATTACHMENTS) throw new BadRequestException(`反馈附件不能超过 ${MAX_FEEDBACK_ATTACHMENTS} 个`)
if (attachments.some((item) => !item.originalName || !item.mimeType || !item.size || item.size > MAX_FEEDBACK_ATTACHMENT_BYTES)) throw new BadRequestException('反馈附件信息不完整或超过大小限制')
```

- 最多 3 个附件。
- 提交前再次校验附件元数据，防止客户端绕过上传接口伪造超大附件。

### 6.4 用户列表与详情

```ts
const enabled = status === 'enabled' ? true : status === 'disabled' ? false : undefined
```

- 后台状态筛选转换为 Prisma 布尔条件。
- 其他值不筛选，保持接口宽松兼容。

```ts
...(keyword ? { OR: [{ id: ... }, { username: ... }, { usernameNormalized: { contains: keyword.trim().toLowerCase() } }, ...] } : {}),
```

- 管理端搜索同时查原用户名和归一化用户名。
- 这样输入 `aaron` 或 `Aaron` 都能找到大小写变体，但列表仍然保留真实用户名。

```ts
const orders = await this.db.order.findMany({
  where: { userId },
  include: { course: true, paymentProofs: { orderBy: { createdAt: 'desc' }, take: 1 }, paymentTransactions: { orderBy: { createdAt: 'desc' } } },
  orderBy: { createdAt: 'desc' },
})
```

- 用户详情返回订单、课程、最近支付凭证和全部支付流水。
- 后台 `UserDetailPanel` 只负责展示，不再额外发多个请求。

### 6.5 后台管理端字段

`frontend/admin-react/src/App.tsx` 的主要变更：

- `TemplateField` 增加 `maxLength` 和 `maxSelect`，模板字段可以限制文本长度和多选数量。
- `TemplateForm` 增加 `enabled`，模板可启用/停用。
- `CourseForm` 增加报名开始、报名结束、单笔最大人数、特价结束时间。
- `columnLabels` 增加 `before: '变更前'` 和 `after: '变更后'`。
- 审计模块格式化时把前后快照对象显示为 JSON，而不是 `[object Object]`。
- 新增 `UserDetailPanel`，展示基础资料、订单、支付方式和支付流水。
- 报名模板预览显示“最长 N”和“最多 N 项”。

## 7. 配置文件与部署行为

### 7.1 `.env.docker.example`

新增三类配置：

```env
PHONE_REGISTRATION_ADAPTER=
PHONE_REGISTRATION_WEBHOOK_URL=
PHONE_REGISTRATION_WEBHOOK_TOKEN=

PASSWORD_RESET_ADAPTER=
PASSWORD_RESET_WEBHOOK_URL=
PASSWORD_RESET_WEBHOOK_TOKEN=

ALIYUN_SMS_ACCESS_KEY_ID=
ALIYUN_SMS_ACCESS_KEY_SECRET=
ALIYUN_SMS_SIGN_NAME=
ALIYUN_SMS_REGION_ID=
ALIYUN_SMS_ENDPOINT=
ALIYUN_SMS_TEMPLATE_CODE_REGISTRATION=
ALIYUN_SMS_TEMPLATE_CODE_PASSWORD_RESET=
```

- 前两组控制注册验证码和找回验证码的渠道。
- 第三组是两个渠道共用的阿里云基础配置，但模板 Code 必须分开。

### 7.2 测试服务器当前状态

`/opt/training-management/.env.docker` 已追加空值键，两个适配器未显式配置，`NODE_ENV=staging`，所以当前进入 fake 模式：

```text
PHONE_REGISTRATION_ADAPTER=fake
PASSWORD_RESET_ADAPTER=fake
```

fake 模式行为：

- 验证码写入数据库时只保存 hash。
- 服务日志打印明文验证码，便于开发联调。
- 接口响应返回 `devCode`，前端显示“内部测试验证码”。
- 生产环境禁止 fake 模式。

切换真实短信：

1. 在阿里云完成签名和两个模板审核。
2. 创建最小权限 AccessKey。
3. 填写 `.env.docker` 中 `ALIYUN_SMS_*`。
4. 设置 `PHONE_REGISTRATION_ADAPTER=aliyun`、`PASSWORD_RESET_ADAPTER=aliyun`。
5. 执行 `docker compose --env-file .env.docker up -d api --force-recreate`。
6. 用真实手机号分别请求注册验证码和找回验证码，并在阿里云控制台核对发送记录。

### 7.3 冒烟验证与测试

部署后已验证：

- admin `18080`、H5 `18081`、assessment `18082` 均返回 200。
- `/api/health` 返回 API 和数据库都正常。
- 错误密码登录返回 401。
- fake 模式注册验证码接口返回 `devCode`。

代码提交前已跑通后端测试基线：16 个测试套件、84 个用例全部通过。
