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
- 当前 FeatureList 已完成本轮更新：105 条标准功能、402 条原子功能；P1 完成后已实现标记分别为 23 条和 217 条。后续统计和任务规划以更新后的 Excel 为准。
- 当前业务数据链路已基本使用真实 API + Prisma/SQLite；仍需脱离的开发适配边界是 `mock:` 微信身份、H5 开发设备标识回退和未配置渠道时的在线支付占位。
- 本轮已生成 `project_baseline.md`、`implementation_plan.md` 及 `Docs/Summary`/`Docs/Plans` 对应文档；后续开发任务从规划 P1 开始，必须绑定 FeatureList 编号并经过迁移、双写、对账和回滚门禁。

## 2026-07-31 P1 数据模型实施

- 已在 `backend/api/prisma/schema.prisma` 新增 `Student`、`AccountStudent`、`RegistrationTemplateVersion`、`Enrollment` 及 User/Course/Order/Template 反向关系。
- 已新增 `backend/api/prisma/migrations/0002_student_domain/migration.sql`；自定义 `prisma/migrate.js` 现按 0001 → 0002 顺序执行，并将 SQLite `user_version` 提升为 5。
- P1 迁移只新增表和索引，主库 `Order.participants` 保留；主库已有 20 条订单快照，新四张表当前均为 0 行，历史回填留给 P2。
- 已在修改 schema 前生成一致性备份：`backend/api/data/training.pre-p1-20260731.db`。
- 测试数据库和当前主库均已执行迁移检查；四张新表、索引和 `user_version=5` 均存在。
- Prisma schema `validate`、后端构建和 4 个测试套件（10 项）通过；已用当前生成客户端成功查询四个新模型。完整 `prisma generate` 仍受 Windows 查询引擎文件 `EPERM rename` 环境锁影响，需在后续环境清理后重新执行完整生成命令。

## 2026-07-31 P2 历史回填与对账

- `0003_student_backfill_ops` 迁移必须纳入自定义迁移器，否则 P2 脚本缺少批次/异常表；迁移器当前将 `user_version` 提升到 6。
- 使用原生 `node:sqlite` 编写回填脚本，绕开 Prisma Client 生成文件锁问题；脚本按稳定订单游标运行，Student/AccountStudent/Enrollment 使用确定性 ID 和唯一约束保证幂等。
- dry-run 也需要维护进程内手机号候选，否则同一批次中“先出现正常手机号、后出现姓名冲突”的异常会漏报；现已用 `plannedStudentsByPhone` 补齐。
- 手机号冲突不静默合并：同一规范化手机号对应不同姓名时写 `PHONE_NAME_CONFLICT`；坏 JSON 写 `INVALID_PARTICIPANTS_JSON`；缺手机号保留可追溯档案并写 `MISSING_PHONE`。
- 主库现有 20 个订单/21 个报名人全部无异常回填；副本库异常场景验证通过。
- `prisma generate` 的 Windows EPERM 环境问题仍未解决，但不阻断本阶段：schema validate、SQLite 迁移、原生回填、后端测试和构建均可完成。

## 2026-07-31 P3 下单事务双写

- 控制器必须把 `studentId` 与 `data` 分开接收，再在服务层从历史快照中剔除 `studentId`；否则会把权限控制字段写进订单表单快照。
- Prisma transaction 内先创建订单再写履历是可回滚的：越权关系测试确认订单数和履历数均不增加。
- `RegistrationTemplateVersion` 使用 `templateId_version` 复合唯一键 upsert；Enrollment 使用 `orderId + sourceParticipantIndex` 唯一键和确定性 ID。
- 取消/退款以前只更新 Order，已补齐关联 Enrollment 状态更新为 `cancelled`，避免新旧读在状态上分叉。
- P3 测试初次失败原因已修正：测试模板需要必填 `companySize`，复用测试课程需选择测试库已关联模板且有剩余容量的课程。
- 首次运行 `prisma validate` 未设置 `DATABASE_URL` 返回 P1012；随后显式设置 `DATABASE_URL=file:./data/training.db` 重跑通过。该环境错误已解决，不再重复无环境变量命令。

## 2026-07-31 P4 学员 API 与权限

- 为避免破坏现有管理端，保留 `/admin/students` 的订单快照语义，新增 `/admin/student-profiles` 作为独立档案数据源，P5 再切换 UI。
- `Student.phoneNormalized` 不设全局唯一，匹配 API 返回候选；编辑时若命中其他 active 档案直接阻断，避免静默覆盖。
- 合并关系时若目标已有相同账号关系，源关系改为 revoked；若存在相同订单/报名序号履历则阻断事务，避免唯一键冲突和历史丢失。
- 学员列表/导出默认脱敏手机号和邮箱；管理员守卫控制资源访问，关键操作通过既有 `AuditLog` 记录。
- P4 自动化测试验证关系授权、默认关系、解除、匹配、履历、软合并和停用；下一阶段重点是管理端两个模块的数据源与交互切换。

## 2026-07-31 P5 管理端视图拆分

- 为保持旧页面兼容，新增 `/admin/enrollment-records`，没有直接改变旧 `/admin/enrollments` 汇总接口语义；管理端报名明细独立读取 Enrollment。
- 学员管理列表默认只显示 Student 主档案字段；详情再请求 `/admin/student-profiles/:id`，避免把完整关系和敏感数据塞进列表。
- 报名履历详情使用保存的 `formPayload`，不重新套用当前报名模板；模板版本和订单状态同时展示以便审计。
- 管理端构建提示已清除重复 `enrollmentCount` 标签定义；当前 Vite 构建无阻断警告。

## 2026-07-31 P6 C 端学员体验

- `/students` 返回的是当前账号 active `AccountStudent` 关系，C 端无需自行过滤其他账号学员。
- 报名页的模板字段是动态配置，不能假设所有课程都有同名字段；实现采用姓名/手机号/企业等常用 key 映射，无法识别的字段继续由用户填写。
- `studentId` 只作为订单控制字段传输，后端会从 `participants[].data` 快照中剔除并重新校验关系权限。
- 解除学员关系只撤销账号关系，不删除 `Student`、`Enrollment` 或旧订单快照，符合历史可追溯要求。
- P6 初次全量回归暴露 `mvp.controller.ts` 两个同名 `students` 方法，已将旧管理兼容接口改为 `adminStudents`；生产化 5 项回归恢复通过。
- C 端 H5 构建通过，仅保留 Sass legacy `@import` 弃用提示，不属于阻断错误。

## 2026-07-31 P7 双读对账与切换

- Enrollment.orderId 在兼容历史数据中允许为空，对账建立订单索引时必须过滤空 orderId，不能把孤立履历误归入订单。
- 订单取消是唯一必须逐条映射到 Enrollment `cancelled` 的状态；支付状态目前仍以 Order 为权威，因此对账只检查“已支付订单不能没有有效履历”，不强行改写 Enrollment.status。
- 新读切换写入 `SystemConfig(student.readMode)`，默认 legacy；切换 new 前重新执行同一份对账，差异存在时返回 400，切回 legacy 始终允许。
- 兼容接口保留旧路径和旧字段，P7 不删除 `Order.participants`，因此可在观察期内快速回退。

## 2026-07-31 P8 Mock 边界与渠道 adapter

- `frontend/client-uni/src/common/mock.ts` 没有任何 import，属于遗留演示文件；删除后业务源码扫描无静态 mock 引用。
- 微信 fake 身份只能在非生产环境使用；生产默认 real，缺少 `WECHAT_APP_ID/WECHAT_APP_SECRET` 或 code 时明确拒绝登录。
- 支付 adapter 的 `real` 模式当前只负责配置门禁和统一返回结构，未注入 SDK/签名服务时保持 `ready=false`；不会调用 `payOrder` 伪造支付成功。
- `.env.example` 只提供变量名和安全占位值，不把真实密钥写入仓库；生产 `JWT_SECRET` 仍由 `load-env.ts` 强制校验。

## 2026-07-31 P9 发布与回滚

- 全量回归最终为 7 个测试套件、16 个测试通过；生产化 API 5/5、学员域/P7 2/2、adapter 2/2。
- SQLite 主库存在 `training.db-wal`；直接复制主库文件会得到旧 schema/数据，发布备份必须先 checkpoint，再使用 `VACUUM INTO`。
- WAL-safe 备份已只读打开验证：`user_version=6`，`Order=20`、`Student=21`、`AccountStudent=21`、`Enrollment=21`。
- 回滚优先切换 `student.readMode=legacy`，再恢复构建；数据库恢复只能使用已校验 SHA256 的独立备份，不能直接覆盖线上文件。

## 2026-08-03 C 端“我的学员”独立页面需求核对

- 当前 `frontend/client-uni/src/pages/mine/mine.vue` 已调用 `/students`，支持新增、编辑、设为默认和解除关系，但学员列表仍以内嵌卡片展示，入口不在菜单中，也没有独立路由。
- 当前后端 `listAccountStudents()` 仅返回当前账号 active 关系，并按 `isDefault`、更新时间排序；接口已经提供姓名、手机号、企业、部门、职务、关系类型和默认标记，可直接支撑独立页面。
- 报名页 `setMappedStudentFields()` 已按字段别名回填姓名、手机号、性别、邮箱、企业、部门、职务；模板定义中的其他字段没有匹配别名时继续由报名人手动填写。
- 当前主库关系可能存在没有 `isDefault` 的账号学员，因此页面必须先尝试显式默认，再用账号资料匹配当前学员；匹配不到时显示空状态，不擅自写入默认关系。
- 新页面应按姓名拼音首字母分组；中文名需要前端首字母转换，拉丁字母直接大写，数字/无法识别字符归入 `#`。

## 2026-08-03 C 端独立学员页面实现结果

- 新增 `pages/students/students.vue`，复用现有 `/students`、`/students/:id`、`/students/:id/default` 和删除接口，不改变数据模型。
- 页面当前学员优先采用显式默认关系，再按账号资料匹配；当前账号 `demo` 的运行态数据返回 15 个 active 关系、0 个显式默认，因姓名/手机号/企业均未匹配而按要求显示空状态。
- 中文首字母使用 `Intl.Collator('zh-Hans-u-co-pinyin')` 与代表字比较，不使用错误的 Unicode/GBK 直接编码区间；避免中文姓名全部落入 `#`。
- H5 构建、根目录 verify、接口读取和 diff 检查均通过；仅有既存 Sass 弃用警告。
