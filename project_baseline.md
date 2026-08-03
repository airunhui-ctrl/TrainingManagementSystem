# 学员域重构与真实联动项目现状总结

> 基线日期：2026-07-31
>
> 本文以当前仓库代码、Prisma schema、API 控制器、C 端与管理端页面，以及 `Docs/FeatureList/培训管理系统功能清单.xlsx` 的实际内容为依据。文中明确区分“已经存在的实现”和“下一阶段规划”，不把规划模型描述成现有能力。

## 1. 项目目标与当前结论

本项目已经从最初的 COP/MVP 页面演示，推进到“前端通过 API 访问 NestJS、后端通过 Prisma 持久化 SQLite”的可联调阶段。课程、报名模板、订单、支付凭证、发票、预览、反馈、积分、审计等核心链路已有真实接口和数据库读写。

但项目还不能宣称已经完成生产化首版，主要原因有三点：

1. 学员仍然以 `Order.participants` JSON 快照存在，没有独立的学员主档案和报名履历表。
2. 微信登录仍是开发适配：后端用 `mock:` 前缀生成身份，H5 开发环境在没有微信容器时也会走稳定设备标识；这不能作为生产微信鉴权。
3. 在线支付接口目前只返回 `ready: false` 的渠道占位结果，线下支付凭证已能上传并进入后台审核，但真实支付渠道仍需通过 adapter 接入。

因此，下一阶段的目标不是继续堆叠页面，而是完成“学员域数据模型重构、历史迁移、事务双写、真实 API 联调、Mock 边界收敛、端到端验收”，形成可测试、可回滚、可上线的第一版小程序。

## 2. 当前系统结构

| 层级 | 目录 | 当前职责 | 当前状态 |
|---|---|---|---|
| C 端小程序 | `frontend/client-uni` | 课程浏览、动态报名、订单、支付、线下凭证、我的/资料 | 主要业务请求已走真实 API；微信 H5 登录保留开发适配 |
| 管理端 | `frontend/admin-react` | 课程、模板、报名、订单支付审核、发票、用户、学员入口、运营配置 | 主要页面已通过 API 访问后端；学员入口仍是订单快照视图 |
| 后端 API | `backend/api` | NestJS 控制器、JWT、业务服务、上传、权限和审计 | 使用 Prisma 访问 SQLite，已有 API/服务测试 |
| 数据库 | `backend/api/prisma` | 用户、课程、模板、订单、支付凭证等表 | 尚无 `Student`、`AccountStudent`、`Enrollment` |
| 共享文档 | `Docs/Summary`、`Docs/Plans`、`Docs/FeatureList` | 现状、规则、功能清单、实施规划 | 本次新增基线总结和后续任务规划 |

## 3. 当前已经实现的真实链路

### 3.1 C 端到后端

`frontend/client-uni/src/common/api.ts` 统一封装请求，H5 默认通过 `/api` 代理，其他平台可使用 `VITE_API_BASE_URL`。当前已接入的业务包括：

- 课程列表、课程详情、课程图片和 Banner；
- 报名模板读取、人数报价和订单创建；
- 订单列表、取消、在线支付意图和线下支付凭证上传；
- 发票申请、预览记录、个人资料、密码修改和反馈。

订单创建目前发送 `courseId + participants[].data + paymentMethod`，后端在事务中校验模板必填字段、手机号、重复报名、课程容量、优惠规则，然后写入 `Order` 和课程已报名人数。

### 3.2 管理端到后端

管理端通过 `frontend/admin-react/src/api.ts` 调用后端，已覆盖：

- 课程与课程图片；
- 动态报名模板；
- 订单和支付凭证审核；
- 发票处理；
- Banner、支付设置、折扣规则、反馈、消息、积分和系统配置；
- 用户分页、启用/停用和密码重置；
- 报名明细和报名汇总。

### 3.3 后端到数据库

当前 Prisma 模型包括 `User`、`Course`、`RegistrationTemplate`、`Order`、`PaymentProof`、`Invoice`、`Preview`、`Feedback`、`PointLedger`、`AuditLog` 等。核心业务不依赖前端静态演示数组；`frontend/client-uni/src/common/mock.ts` 当前没有被页面业务代码导入。

## 4. 当前 Mock/开发适配边界

| 边界 | 当前实现 | 首版要求 |
|---|---|---|
| 微信登录 | `AuthService.wechatLogin()` 将设备/请求身份 hash 为 `mock:` openId | 使用服务端向微信换取 `openid/unionid` 的 adapter；开发 mock 只能在显式开发环境开启 |
| 在线支付 | `createPaymentIntent()` 返回 `ready: false`、空 `payload` | 对接微信/支付宝服务端签名、回调和幂等状态更新；渠道代码与业务服务隔离 |
| 业务数据 | 课程、订单、模板、支付凭证等已经读写 Prisma/SQLite | 保持真实数据库链路，并补齐迁移、备份、回滚和生产数据库配置 |
| C 端静态数据 | 页面业务已基本不导入 `common/mock.ts` | 发布构建不得依赖演示数组；测试数据通过 seed 或测试数据库注入 |
| API 地址 | 管理端默认 `http://localhost:3100/api`，C 端 H5 默认 `/api` | 开发、测试、生产分别配置，不把 localhost 写入发布构建 |

“脱离 Mock”指业务数据和身份链路必须有真实可验证的来源，不等同于禁止测试替身。支付渠道、微信 SDK 等外部依赖应保留可替换 adapter，并在自动化测试中使用受控 fake adapter。

## 5. 学员域当前事实

### 5.1 账号与学员不是同一个概念

- `User` 是登录和业务责任账号，负责登录、下单、支付、开票、查看本人订单。
- `Order.userId` 表示谁创建/拥有订单，不能证明这个人就是实际参训人。
- `Order.participants` 是本次订单中一名或多名报名人的字段对象数组。

因此，一个账号可以为自己报名，也可以代表企业或团队为多个学员报名。

### 5.2 当前“学员管理”并不是学员档案

`GET /admin/enrollments` 和 `GET /admin/students` 最终都调用订单展开逻辑：读取订单、解析 `participants` JSON，再补充账号、课程、订单和支付状态。当前关系可以表示为：

```text
User ──< Order ──< Order.participants(JSON)
                       └─ 管理端学员/报名明细视图
```

这套实现能满足 MVP 的“查看谁报名了什么”，但不能支持：跨课程历史、学员长期资料维护、一个账号管理多个学员、学员去重合并、报名模板版本追溯和稳定统计。

### 5.3 模板与报名值的存储边界

- `RegistrationTemplate.payload`：保存字段定义和选项；课程通过 `registrationTemplateId` 关联模板。
- `Order.participants`：保存提交时每个报名人的字段值快照。
- 当前订单没有保存模板 ID/版本和结构化报名履历；模板修改后只能依赖订单原始 JSON 解释历史数据。

## 6. 目标学员域模型

目标模型采用四层职责分离，订单保留兼容快照，不直接替代学员档案：

```mermaid
erDiagram
    User ||--o{ Order : "下单账号"
    User ||--o{ AccountStudent : "管理关系"
    Student ||--o{ AccountStudent : "被账号管理"
    Student ||--o{ Enrollment : "报名履历"
    Course ||--o{ Enrollment : "课程报名"
    Order ||--o{ Enrollment : "订单来源"
    RegistrationTemplate ||--o{ Enrollment : "模板版本快照"

    User { string id PK }
    Student { string id PK; string phoneNormalized; string status }
    AccountStudent { string userId FK; string studentId FK; string relationType; boolean isDefault }
    Enrollment { string id PK; string studentId FK; string courseId FK; string orderId FK; int templateVersion; string formPayload }
```

### 6.1 `Student`：长期学员主档案

保存可复用的基础身份资料，例如姓名、规范化手机号、公司、部门、职位、状态、创建/更新时间。档案停用采用状态，不物理删除历史报名。

### 6.2 `AccountStudent`：账号与学员授权关系

支持一个账号管理多个学员，也允许同一个学员在授权规则下被多个企业账号管理。关系表保存来源、关系类型、默认报名人标记和审计字段；普通账号只能读取自身有权限的关系。

### 6.3 `Enrollment`：一次报名履历

每次学员参加某门课程产生一条履历，至少保存 `studentId`、`courseId`、可空 `orderId`、订单责任账号、模板 ID、模板版本、`formPayload`、状态、支付/出勤/完成时间。`formPayload` 是不可被后续模板修改覆盖的历史快照。

### 6.4 `Order`：交易主体与兼容字段

订单继续负责金额、折扣、支付、退款、发票和交易状态。`participants` 在迁移期间保留，作为旧接口兼容和对账来源；新代码不应再把它当作唯一的学员主数据源。

## 7. 迁移与实现原则

必须采用可回滚的渐进迁移，顺序固定为：

1. 新增表、索引和模板版本字段，不删除 `Order.participants`；
2. 备份 SQLite，编写可重复执行的历史回填脚本；
3. 回填前先规范化手机号，无法确定的冲突进入人工清单；
4. 新订单在同一事务中写入订单、学员关系和报名履历；
5. 对账通过后，后台学员档案读取 `Student`，报名明细读取 `Enrollment`；
6. 保留旧字段和兼容读一段观察期，再决定是否下线旧接口字段。

禁止在迁移时静默覆盖历史姓名、手机号或公司；禁止用后续模板重新解释历史报名；禁止直接删除旧 JSON 字段。

## 8. 第一版上线范围

### 必须完成

- `Student`、`AccountStudent`、`Enrollment` Prisma 模型、索引和迁移；
- 历史订单快照回填、幂等游标、异常日志、对账报告和回滚方案；
- 下单事务双写和可选 `studentId` 兼容请求；
- 管理端区分“学员档案”和“报名明细”，支持权限、脱敏和审计；
- C 端选择已有学员、新建/临时填写报名人，以及“我的学员”维护；
- 真实 API/数据库联调、开发/测试/生产 API 配置、构建和端到端回归；
- 微信登录和在线支付的生产 adapter 接入或明确的上线前置门禁。

### 首版明确不做

- 不在迁移阶段物理删除旧订单快照；
- 不把“手机号相同”直接当成无条件自动合并；
- 不把课程报名模板改成无法追溯的动态覆盖结构；
- 不在没有回调验签、幂等和退款规则时宣称在线支付已生产可用；
- 不用前端静态 mock 数组伪造业务成功状态。

## 9. FeatureList 本次更新

更新后的 `Docs/FeatureList/培训管理系统功能清单.xlsx`：

- 标准功能：105 项；
- 详细原子功能：402 项；
- 已实现标准功能：23 项；
- 已实现原子功能：217 项；
- 产品分为 C 端小程序 35 项、平台管理端 64 项、服务端/API 与数据层 6 项；
- 新增 C 端已有学员选择/临时填写、我的学员；
- 新增管理端学员档案、账号关系、报名履历、匹配合并、历史迁移、权限脱敏；
- 新增服务端数据模型、事务双写、迁移对账、Mock 脱离和首版发布验收；
- 清除 `WEB-STU-001` 的“已实现”标记，明确其只是订单报名快照兼容视图。

P1 已完成数据库基础模型和迁移：新增 `Student`、`AccountStudent`、`RegistrationTemplateVersion`、`Enrollment` 及索引；当前主库新表为空，历史回填和订单事务双写仍分别属于 P2/P3。

清单中的“已实现”只表示当前代码和验收证据已经覆盖；规划补充项统一保留为未实现，不能因为已有页面入口就提前打勾。

## 10. 验收门禁

每个阶段完成后至少满足：

1. 相关 API 有成功、失败、权限和重复执行测试；
2. 订单人数、`Enrollment` 数量、课程汇总和支付状态可对账；
3. 迁移脚本重复运行不产生重复档案、关系或履历；
4. 历史报名仍能查看原始模板版本和表单快照；
5. 普通账号不能读取其他账号未授权学员，敏感字段按规则脱敏；
6. C 端、管理端、API、数据库使用同一环境配置，发布构建不依赖演示数组；
7. 构建、自动化测试、启动检查、备份和回滚演练均有记录；
8. 只有通过对账和回归门禁后，才允许切换新读路径或标记功能为“已实现”。

## 11. 关联文件

- 业务关系与独立档案详细分析：`Docs/Summary/用户管理_学员管理_报名信息存储关系分析.md`
- 功能清单：`Docs/FeatureList/培训管理系统功能清单.xlsx`
- 后续任务规划：`Docs/Plans/2026-07-31_脱离Mock的前后端数据库联动任务规划.md`
- 数据库设计方案：`Docs/Plans/2026-07-31_学员域数据库设计方案.md`
- 根目录基线副本：`project_baseline.md`
# P2 当前状态补充（2026-07-31）

主库已完成历史报名快照回填：20 个订单、21 个报名人对应 21 个 Student、21 个 AccountStudent、21 个 Enrollment；迁移批次异常和对账差异均为 0，`Order.participants` 保留。

P3 已完成下单事务双写：旧请求兼容，`studentId` 授权校验、档案/关系/履历写入和取消退款状态同步均在同一事务内完成。

P4 已完成独立学员档案、账号关系、报名履历、匹配/软合并、脱敏导出和审计 API，旧订单快照接口保留兼容。

P5 已完成管理端数据源拆分：学员档案读取 Student，报名明细读取 Enrollment，旧快照/汇总接口仍保留。
