# 分析发现

## 2026-07-31 学员领域重构与第一版脱离 Mock 的基线

- 用户指定的依据文档已核对：当前 `User` 是账号主体，`Order.participants` 是报名快照，`/admin/students` 与 `/admin/enrollments` 当前均由订单展开，尚不存在独立 `Student`/`Enrollment` 数据表。
- 依据文档给出的目标模型，后续实现应采用 `User`（账号）+ `Student`（学员档案）+ `AccountStudent`（账号关系）+ `Enrollment`（报名履历）四层结构；订单继续承担金额、支付、开票和兼容快照职责。
- 迁移必须采用“新增表/索引 → 历史回填 → 事务双写 → 新读旧留 → 对账切换”的渐进路径，不能直接删除 `Order.participants`。
- 本次用户目标不仅是文档更新，还要求以当前代码事实为基线更新功能清单，并把后续工作拆成可执行、可验收、可持续引用的任务规划。
- 当前 C 端大多数业务请求已通过 `frontend/client-uni/src/common/api.ts` 访问 `/api`，`common/mock.ts` 当前未被页面导入；但微信登录仍使用 `mock:` 身份标识，且 H5 开发失败分支会调用后端 mock 适配接口，生产接入仍未完成。
- 当前 `CreateOrderDto` 只接收 `participants[].data`，控制器丢弃潜在的 `studentId`；`MvpService.createOrder()` 只写 `Order.participants` JSON，说明独立学员档案仍是规划而非现状。
- FeatureList 当前有 91 个标准功能、354 个原子功能；`WEB-STU-001` 的绿色实现标记与代码事实不一致，需改为“订单报名快照/兼容入口”，并新增学员主档案、账号关系、报名履历、去重合并、迁移对账和真实 API/数据库联动等规划功能。

## 数据模型

- `User` 是账号主体：`id`、`username`、`passwordHash`、`role`、`name`、`company`、启用状态、积分及注册/更新时间；关联 `Order`、`Invoice`、`Preview`、`Feedback`、`PointLedger`。
- `Course` 是课程主体，包含 `registrationTemplateId`，通过外键关联 `RegistrationTemplate`；一个模板可被多个课程复用，一个课程当前只关联一个模板。
- `RegistrationTemplate` 用 `payload` 字符串保存字段定义 JSON，另有 `version`；字段类型包括 text、phone、select、radio、checkbox。
- `Order` 同时关联 `userId` 和 `courseId`，并以 `participants` 字符串保存该订单下报名人的 JSON 数组，`participantCount` 保存人数；没有独立的 Student/Participant 表。
- `PaymentProof` 只关联订单，不直接关联用户；订单通过 `userId` 间接归属账号。

## 后端行为

- `createOrder(userId, courseId, participants, paymentMethod)` 先读取课程模板，按模板必填字段逐个校验报名人，再把整个数组 `JSON.stringify` 写入一条订单；允许多人报名时一条订单可含多名报名人。
- 课程 `allowMultiParticipant` 为 false 时拒绝多人报名；同时按报名人手机号检查同课程有效订单中的重复报名。
- `listEnrollments()` 读取所有订单，把 `Order.participants` JSON 数组展开成报名明细，并补充账号用户、课程、订单和支付状态；`listStudents()` 目前只是该方法的别名。
- 用户管理 `listUsersPage()` 查询 `User`，展示账号资料，并额外统计订单数和课程预览数；“报名课程数”实际是订单条数，不是去重后的课程数。
- 当前后端认证控制器只有登录、刷新令牌、当前用户查询，没有发现公开注册接口；用户数据来自种子/迁移或其他未在当前模块暴露的管理流程。

## 前端语义

- 管理端“用户管理”调用 `/admin/users`。
- “学员管理”和“报名明细”分别调用 `/admin/students`、`/admin/enrollments`，但后端返回完全相同的展开结果，因此当前学员管理不是独立学员主数据维护。
- 详情面板直接显示订单下的报名人数组，说明报名人资料来源是订单快照，而非 User 表。

## 示例数据

- 种子数据中的每条演示订单都写入一元素 `participants` 数组；课程模板按课程或课程组配置，证明模板字段与报名数据均通过 JSON 快照承载。

## 2026-07-31 本次改造现状

- C 端底部 Tab 在 `frontend/client-uni/src/pages.json` 中仍显示“业务”，业务页面标题和文案也使用“我的业务”；需要统一改为“订单”。
- C 端“我的”页目前只有简单弹窗：个人资料只能修改姓名，账号与安全是直接重置演示密码，尚未支持姓名、联系方式、性别、企业等完整资料编辑。
- `User` 当前只有 `name`、`company`、`avatarText` 等基础字段，没有 `phone`、`gender`、`email`、微信身份标识等资料字段；认证控制器也只有账号密码登录，没有微信一键登录接口。
- `Course` 当前没有图片字段；首页和详情页通过前端课程编号映射本地 SVG，首页轮播第一张还使用固定 banner 图。管理端课程编辑器没有课程图片上传控件。
- 报名汇总后端已返回每门课程的总人数、已支付人数、未支付人数，但管理端目前只渲染表格，没有图表；汇总行也没有详情操作。
- 报名明细后端已有 `/admin/enrollments`，可按订单展开报名人信息；可复用于报名汇总详情中的已支付/未支付分区。

## 2026-07-31 独立学员档案复核

- 当前 `Order.participants` 是 JSON 字符串，`MvpService.createOrder()` 只写订单快照；`listStudents()` 直接复用 `listEnrollments()`，所以“学员管理”不是独立主数据。
- `CreateOrderDto` 将 `participants[].data` 映射为报名对象，当前接口尚未接收 `studentId`；独立档案改造需要在兼容旧请求的前提下增加可选 `studentId`。
- 当前重复报名校验从订单快照中提取手机号，未建立数据库级学员唯一键；迁移时必须保留异常匹配和人工合并入口。
- `Course.registrationTemplateId` 指向当前模板，但订单没有保存模板 ID/版本；新 `Enrollment` 应保存模板版本及当次 `formPayload`，不能用后续模板覆盖历史数据。
- `Order.userId` 表示下单/付款责任账号，不能替代实际参训人；目标模型应拆分 `User`、`Student`、`AccountStudent`、`Enrollment` 四类关系。
- 独立档案上线应采用“历史回填 → 新订单事务双写 → 对账 → 新读旧保留”的渐进式迁移，禁止直接删除 `Order.participants`。

## 2026-07-31 最终基线校正

- 当前仓库已存在 `User.phone`、`User.gender`、`User.email`、`User.wechatOpenId` 和 `Course.image` 字段；此前“尚未存在这些字段”的早期记录仅代表当时检查点，不再作为当前事实。
- 当前 FeatureList 已完成本轮更新：105 条标准功能、402 条原子功能；已实现标记分别为 22 条和 214 条。后续统计和任务规划以更新后的 Excel 为准。
- 当前业务数据链路已基本使用真实 API + Prisma/SQLite；仍需脱离的开发适配边界是 `mock:` 微信身份、H5 开发设备标识回退和未配置渠道时的在线支付占位。
- 本轮已生成 `project_baseline.md`、`implementation_plan.md` 及 `Docs/Summary`/`Docs/Plans` 对应文档；后续开发任务从规划 P1 开始，必须绑定 FeatureList 编号并经过迁移、双写、对账和回滚门禁。
