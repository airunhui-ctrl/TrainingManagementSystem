# 进度记录

## 2026-07-30

- 已创建本次分析任务的规划文件。
- 下一步读取 Prisma schema、后端服务和前端页面，记录可验证的数据关系。
- 已完成 Prisma schema、订单/模板/报名明细/用户管理服务、控制器、管理端模块和种子数据核对；关键发现已写入 `findings.md`。
- 已生成 `Docs/Summary/用户管理_学员管理_报名信息存储关系分析.md`，包含结论摘要、关系图、数据流、代码依据和优化建议。
- 已检查最终 Markdown 文件存在，路径和章节结构正确；任务完成。
- 当前支付目标复核：确认微信/支付宝点击调用 `createPaymentIntent` + `requestNativePayment`，原生成功后同步调用 `payOrder`；线下转账弹窗提供“复制全部”，复制订单号、金额、收款户名、开户行、账号和备注。
- 验证：C 端 H5 构建通过；后端 Jest 4 套件、10 个测试通过；后端 TypeScript 检查通过。
- 额外验证：`build:mp-weixin` 仍受现有 UniApp alpha 与 Vue 3.4.21 依赖不兼容影响，报 `isInSSRComponentSetup` 未导出；未扩大本次支付功能改动范围处理该既有依赖问题。
- 已按最新需求完善 `Docs/Summary/用户管理_学员管理_报名信息存储关系分析.md`：新增学员管理的业务意义、目标分层模型、`Student`/`AccountStudent`/`Enrollment` 设计、历史回填、去重合并、事务双写、后台/C 端改造、兼容切换、测试对账和分阶段交付步骤。

## 2026-07-31（独立学员档案文档复核）

- 对照当前 `schema.prisma`、`mvp.controller.ts`、`mvp.service.ts` 复核总结文档；确认当前学员管理仍是订单 `participants` 展开结果，不是独立学员表。
- 补充文档需要明确的实现落点：`CreateOrderDto` 兼容增加 `studentId`、订单模板版本快照、迁移幂等键、手机号冲突人工处理、事务双写、后台分页/权限和回滚验收。
- 已更新 `Docs/Summary/用户管理_学员管理_报名信息存储关系分析.md`：修正当前 `User` 字段与微信登录表述，并新增“落实到当前代码的文件与接口”“数据一致性、验收与回滚标准”两节。
- 已校验文档章节、JSON 示例和 Mermaid 关系图均能以 UTF-8 正常读取；本次只修改 Markdown 与规划记录，没有改动业务代码或数据库。

## 2026-07-31（持续目标完成度审计）

- 对照目标逐项核验：C 端导航已改为“订单”；“我的”页已有个人资料、账号与安全、密码修改、微信一键登录入口；课程图片已贯通管理端上传、后端媒体读取、首页卡片/轮播和详情 Banner；学员列表已将姓名、手机号、课程前置；报名汇总已增加课程人数图表、查看详情和已支付/未支付分区。
- 运行时发现 3100 端口原先是旧后端实例，`/auth/wechat-login` 返回 404；已停止占用 3100 的旧实例并按当前代码重启，路由日志确认新接口已注册。
- 修复 H5 本地微信登录联调：微信容器不可用时仅在开发构建回退到稳定设备标识，生产构建仍提示使用微信客户端。
- 修复报名汇总统计口径：汇总的未支付人数包含所有非“已取消”、非“已支付”的其他状态；点击详情时排除已取消订单，避免详情人数与汇总人数不一致。
- 验证通过：API/管理端/C 端构建、后端 4 个测试套件（10 个测试）、管理端 UI 静态验收、HTTP 登录/profile/wechat-login/courses/enrollment-summary、管理端和 C 端开发服务器响应。
- 记录的验证限制：课程图片 multipart 上传测试被执行审批层拒绝，未重复尝试；浏览器自动化访问本地地址被当前浏览器安全策略拒绝，因此改用 HTTP、构建和源代码静态检查完成验收。

## 2026-07-31（报名汇总视觉优化与重复修复）

- 将 `EnrollmentSummaryChart` 改为按已支付、未支付、其他状态分段的彩色进度条；总报名人数仍以轨道长度体现。
- 增加鼠标悬停和键盘聚焦提示，展示课程、总报名、各状态人数及百分比；零报名课程不再显示误导性的彩色短条，并补充窄屏布局。
- 定位截图中的重复课程根因：模块切换时旧的 `/admin/enrollments` 请求晚返回，覆盖了当前 `/admin/enrollment-summary` 数据。通过 `loadVersion` 请求版本守卫、切换模块清空旧数据并调整 effect 顺序修复。
- 管理端构建、UI 静态验收和 `git diff --check` 已通过。

## 2026-07-31（依据新截图调整分页布局）

- 将报名汇总页的列表分页移到上方数据表格紧下方，避免分页按钮被误认为控制下方图表。
- 为汇总图表增加独立分页（每页 5 门课程），图表分页与上方列表分页互不影响；图表卡片底部显示当前页和总页数。
- 已通过管理端 TypeScript/Vite 构建、UI 静态验收和 `git diff --check`。

## 2026-07-31（学员域重构与真实联动基线）

- 已使用 artifact-tool 更新 `Docs/FeatureList/培训管理系统功能清单.xlsx`：标准功能 105 项、原子功能 402 项；已实现标准功能 22 项、已实现原子功能 214 项。
- 已清除 `WEB-STU-001` 的误导性“已实现”标记，并新增 C 端已有学员/我的学员、管理端学员档案/账号关系/报名履历/迁移对账/权限脱敏，以及服务端数据模型、事务双写、Mock 脱离和首版验收功能。
- 已生成现状总结：`Docs/Summary/2026-07-31_学员域重构与真实联动项目现状总结.md`。
- 已生成后续任务规划：`Docs/Plans/2026-07-31_脱离Mock的前后端数据库联动任务规划.md`，分为 P0～P9，并为每阶段绑定 FeatureList 编号、完成标准、测试命令和同步要求。
- 已保存根目录副本：`project_baseline.md`、`implementation_plan.md`。
- Excel 校验通过：工作表、标准/原子新增行、产品统计、公式错误扫描均正常；已渲染并检查使用说明、标准功能、详细原子功能和模块统计预览。
- 本轮只完成基线、清单和规划文档，没有提前实现 `Student`/`AccountStudent`/`Enrollment`，后续开发应从规划 P1 开始，并遵守迁移、双写、对账和回滚门禁。

## 2026-07-31（学员域数据库设计方案）

- 已基于现状总结、学员关系分析和 P0–P9 规划生成 `Docs/Plans/2026-07-31_学员域数据库设计方案.md`。
- 方案覆盖目标逻辑模型、`Student`、`AccountStudent`、`Enrollment`、模板版本、订单兼容字段、合并审计、迁移批次/异常记录、索引约束、事务数据流、权限脱敏和发布验收。
- 已保存根目录副本 `database_design.md`，两份文件 SHA256 一致。
- 本次仍未修改 Prisma schema；下一步按规划 P1 实施前需先完成数据库备份和业务口径确认。

## 2026-07-31（P1 学员域数据模型实施）

- 已备份当前 SQLite 主库：`backend/api/data/training.pre-p1-20260731.db`。
- 已新增 Prisma 模型：`Student`、`AccountStudent`、`RegistrationTemplateVersion`、`Enrollment`，并补充 User/Course/Order/Template 关系。
- 已新增 `backend/api/prisma/migrations/0002_student_domain/migration.sql`，迁移器按 0001 → 0002 执行，SQLite `user_version` 更新为 5。
- FeatureList 已同步将 `WEB-DATA-001` 及 3 条原子功能标记为已实现；当前清单统计为 23 条标准功能、217 条原子功能已实现。
- 已在测试库和主库执行迁移；四张新表和索引存在且为空，主库原有 20 条 `Order.participants` 快照保留，未执行历史回填。
- 已增加迁移回归断言；后端 4 个测试套件、10 项测试和后端构建通过，Prisma schema validate 通过。
- `prisma generate` 仍受 Windows 查询引擎文件锁的 `EPERM rename` 影响；已用当前生成客户端成功查询四个新模型，环境问题已记录，未影响 schema validate、迁移和当前后端测试/构建。

## 2026-07-31（P2 历史快照回填与对账完成）

- 新增 `0003_student_backfill_ops` 迁移：`StudentMigrationBatch` 记录批次/游标/统计，`StudentMigrationIssue` 记录逐订单逐报名人异常；SQLite `user_version=6`。
- 新增 `backend/api/prisma/backfill-student-domain.js`，支持 dry-run、批次 ID、数据库文件参数、模板版本快照、手机号规范化、断点游标和确定性 ID 幂等。
- 副本库通过 dry-run、正式回填、坏 JSON/手机号姓名冲突异常和重复运行验证；异常不会静默丢失或错误合并。
- 主库回填完成：20 个订单、21 个报名人、21 个 Student、21 个 AccountStudent、21 个 Enrollment，异常 0、订单/课程对账差异 0；同批次复跑新增 0。
- FeatureList 已更新：`WEB-STU-007`、`WEB-DATA-003` 及 7 条原子功能打勾，统计为 25/105 标准、224/402 原子。
- 测试通过：`backend/api/test/backfill.spec.ts`；下一阶段 P3 开始改造下单 DTO 和事务双写。

## 2026-07-31（P3 下单事务双写完成）

- `CreateOrderDto` 支持每个报名人的可选 `studentId`，旧版 `participants[].data` 请求保持兼容。
- `MvpService.createOrder()` 已在同一 Prisma transaction 内写入订单快照、模板版本、Student、AccountStudent、Enrollment 和课程人数；确定性 ID/唯一键避免重复履历。
- 已有学员复用要求当前账号存在 active 关系；越权、冲突或容量失败会整体回滚，不留下订单半成品。
- 取消/退款同步关联 Enrollment 为 `cancelled`；订单快照保留原始表单数据。
- FeatureList 已同步 `WEB-DATA-002` 和 4 条原子功能，统计为 26/105 标准、228/402 原子。
- 后端全量测试 5 套件、12 项通过，Nest 构建通过；下一阶段进入 P4 学员 API、权限、合并和审计。

## 2026-07-31（P4 学员 API 与权限完成）

- 新增 `/admin/student-profiles` 学员档案分页、详情、编辑、启用/停用和脱敏导出接口；旧 `/admin/students` 订单快照接口保留。
- 新增账号关系授权、解除、默认报名人维护；新增跨课程 Enrollment 履历查询、手机号/姓名/公司匹配候选和软合并接口。
- 合并事务检测重复履历，关系/履历迁移和源档案 `mergedIntoId/status=merged` 同步提交；冲突时整体回滚。
- 列表/导出默认脱敏敏感字段，关键查看/编辑/授权/解除/合并/导出动作写入 AuditLog。
- FeatureList 已更新：`WEB-STU-003`～`WEB-STU-008` 和 21 条原子功能完成；统计为 32/105 标准、245/402 原子。
- `backend/api/test/student-api.spec.ts` 及后端全量 5 套件、12 项测试和 Nest 构建通过；下一阶段 P5 开始管理端页面拆分。

## 2026-07-31（P5 管理端档案/报名明细拆分完成）

- 管理端学员管理切换到 `/admin/student-profiles`；报名明细切换到 `/admin/enrollment-records`，分别对应 Student 和 Enrollment 数据源。
- 学员档案详情展示授权账号、状态和履历统计；报名履历详情展示模板 ID/版本、订单支付状态、责任账号和 `formPayload` 快照。
- 旧 `/admin/students`、`/admin/enrollments` 接口保留，汇总页面继续兼容；管理端加载版本守卫未移除。
- FeatureList 已更新：`WEB-ENR-002`、`WEB-ENR-003` 和 8 条原子功能完成；统计为 34/105 标准、253/402 原子。
- 管理端 Vite 构建和新报名明细查询测试通过；下一阶段进入 P6 C 端“我的学员”和报名选择。

## 2026-07-31（P6 C 端学员体验完成）

- C 端报名页新增账号学员选择：支持默认学员自动回填、已有学员复用、临时填写和逐报名人切换；提交会携带可选 `studentId`。
- C 端“我的”页新增独立学员管理区：支持新增、编辑、设置默认报名人和解除关系，解除不删除历史报名。
- 修复后端控制器重复方法名 `students`，管理端兼容接口改名为 `adminStudents`，恢复 TypeScript 编译与生产化回归。
- FeatureList 已更新：`MP-ENR-007`、`MP-ME-007` 及 7 条原子功能完成；统计为 36/105 标准、260/402 原子。
- 验证通过：`pnpm.cmd --dir frontend/client-uni build:h5`、`pnpm.cmd --dir frontend/admin-react build`、`pnpm.cmd --dir backend/api build`、`pnpm.cmd --dir backend/api test -- --runInBand test/production.spec.ts`。
- 下一阶段 P7：双读对账、切换开关、旧读回退和观察期报告。

## 2026-07-31（P7 双读对账与切换完成）

- 新增 `/admin/student-domain/reconciliation`，核对旧订单快照、Enrollment 数量/取消状态、课程有效报名数和已支付订单履历。
- 新增 `/admin/student-domain/read-mode`，默认 `legacy`；切换 `new` 前执行无差异门禁，`legacy` 可回退且不改数据。
- `/admin/enrollments`、`/admin/students` 兼容接口支持按模式选择旧读/新读。
- FeatureList 已更新：`WEB-DATA-004` 和 3 条原子功能完成；统计为 37/105 标准、263/402 原子。
- `student-api.spec.ts` P7 测试 2/2、Nest 构建通过。
- 下一阶段 P8：Mock 脱离、环境变量模板和微信/支付 adapter 门禁。

## 2026-07-31（P8 Mock 边界与渠道 adapter 完成）

- 删除未引用 `frontend/client-uni/src/common/mock.ts`；业务页面扫描不再发现静态 demo 数据依赖。
- 新增 `backend/api/src/channel-adapters.ts`，微信登录生产必须 real 配置，支付未配置只返回 `ready=false` 的明确禁用结果。
- 新增三端 `.env.example`，统一 API、数据库、JWT、上传目录和渠道配置。
- FeatureList 已更新：`WEB-DATA-005` 和 4 条原子功能完成；统计为 38/105 标准、267/402 原子。
- 测试/构建通过：adapter 2/2、生产化 API 5/5、Nest、管理端 Vite、C 端 H5。
- 下一阶段 P9：端到端回归、发布清单、备份和回滚演练。

## 2026-07-31（P9 首版回归、发布与回滚完成）

- 全量后端测试 7 套件/16 项通过；生产化 API、学员域、adapter、迁移和回填均覆盖。
- Nest、管理端 Vite、C 端 H5、Prisma schema validate、mock 扫描和 `git diff --check` 全部通过。
- 发现并修正 SQLite WAL 直接复制备份缺失问题，改用 checkpoint + `VACUUM INTO` 生成 `training.pre-p9-20260731-wal-safe-2.db`，版本 6、数据量 20/21/21/21 一致。
- 发布与回滚证据清单：`Docs/Summary/2026-07-31_P9_首版发布与回滚验收清单.md`。
- FeatureList 已更新：`WEB-DATA-006` 和 3 条原子功能完成；统计为 39/105 标准、270/402 原子。
- P0～P9 规划项全部完成；上线前仍需部署方提供真实微信/支付签名服务配置。

## 2026-08-03 C 端独立“我的学员”页面优化启动

- 已确认报名模板自动回填范围与其他字段手动填写边界。
- 已确认现有学员 API 和账号关系数据可复用，无需新增数据库表或破坏 `Order.participants`。
- 已创建本阶段计划；待实现独立页面、入口位置、当前学员匹配和姓名首字母分组。

## 2026-08-03 C 端独立“我的学员”页面优化完成

- 新增 `frontend/client-uni/src/pages/students/students.vue` 和页面路由。
- “我的”页将“我的学员”入口放到“账号与安全”下方、“我的积分”上方，移除原内嵌学员列表及其重复维护弹窗。
- 页面按显式默认、账号手机号/姓名/企业匹配当前学员；无匹配时展示空状态；其他 active 学员按中文拼音首字母分组。
- 报名页原有字段回填逻辑保持不变：常用字段自动回填，模板其他字段继续手动填写。
- 验证通过：`pnpm.cmd run build:client`、`pnpm.cmd run verify`、`git diff --check`；运行态 `/students` 返回 15 个 active 学员关系。

## 2026-08-03 单机服务器部署方案

- 已核对生产入口、构建产物和端口：API `3100`、管理端 `dist`、C 端 H5 `dist/build/h5`。
- 已确认当前 H5/管理端资源使用绝对 `/assets`，部署方案采用两个域名/独立 Nginx server 块，避免 `/admin`、`/h5` 子路径资源冲突。
- 已新增 `Docs/Summary/2026-08-03_单机服务器部署指南.md` 和 `Docs/Plans/2026-08-03_单机部署实施方案.md`。
- 已记录 SQLite 单实例约束、WAL-safe 备份、systemd、Nginx、首次验收和 P9 回滚门禁；未在未授权情况下连接或修改远程服务器。

## 2026-08-03 C 端登录页简化

- 登录页字段文案由“演示账号”改为“账号”，账号和密码初始值均为空，取消自动填充。
- 删除微信一键登录按钮、快捷账号入口和“MVP 演示密码统一为 123456”提示；同步清理“账号与安全”中的微信绑定提示。
- 登录页改为简洁卡片布局，保留账号密码登录、密码显示/隐藏和原有登录接口。
- `pnpm.cmd --dir frontend/client-uni build:h5`、`pnpm.cmd run verify`、`git diff --check` 通过；本地 H5 视觉复核确认输入框为空且上述文案已从构建产物移除。

## 2026-08-03 注册/找回密码与生产化准备

- 后端新增 `POST /api/auth/register`、`/api/auth/password-reset/request`、`/api/auth/password-reset/confirm`，验证码按哈希保存，支持过期、错误次数限制、一次性使用和旧刷新令牌吊销。
- C 端登录页新增“立即注册”“忘记密码”入口，并新增注册页、找回密码页；开发环境可显示 `devCode`，生产环境不返回验证码。
- 新增 `PasswordResetChallenge` Prisma 模型、`0004_password_reset` SQLite 迁移和密码找回 webhook/fake/disabled 配置模板。
- 新增 `backend/api/test/auth-registration-reset.spec.ts`，注册、重复账号、密码找回、挑战复用和未知账号不泄漏测试 3/3 通过；后端构建通过。
- Prisma Client 重新生成受 Windows 查询引擎文件被运行中 Node 进程占用影响（EPERM），现有生成客户端已含新模型，待停止占用 3100 的旧服务后再执行 `db:generate` 作为环境清理步骤。
- 当前生产化仍需真实微信登录场景、商户支付渠道、短信/邮件找回渠道和目标 PostgreSQL/MySQL 实例信息；个人微信/支付宝收款码不能替代商户支付接口。
- 最终验证：`pnpm.cmd run build:client`、管理端构建、根目录 `verify` 和 `git diff --check` 通过；C 端仅有既存 Sass 弃用警告。
- 全量后端 Jest 在 5 分钟内无输出并超时，未收到断言失败；新增注册/找回密码专项测试已独立 3/3 通过。由于 3100 仍有运行中的 Node 服务，未擅自停止服务重跑 Prisma generate。
- 内测数据库已执行 `pnpm.cmd --dir backend/api db:migrate`，`user_version=7` 且 `PasswordResetChallenge` 表存在；随后仅重启占用 3100 的旧 API 实例，新 `/api/auth/password-reset/request` 已返回 201，5174/5185 前端服务未中断。

## 2026-08-04 注册/找回密码完善与真实支付安全门禁

- 新增 `PaymentTransaction` 模型和 `0005_payment_transactions` 迁移，内测库升级到 `user_version=8`；重新生成 Prisma Client 成功。
- 在线支付不再允许客户端调用 `/orders/:id/pay` 直接改为已支付；新增支付状态查询、微信/支付宝回调入口、订单号/金额校验、回调验签后幂等入账。
- 补充微信支付 v3 H5/Native 下单签名、支付宝 WAP 下单签名、微信 AES-GCM 回调解密和支付宝 RSA2 回调验签代码；未配置真实商户参数时仍明确返回不可用。
- C 端报名页和订单页改为发起支付意图、跳转/调用原生支付并轮询服务端状态，不再显示伪造二维码或依据前端点击宣称支付成功。
- 新增 `payment-integrity.spec.ts`；注册/找回密码、支付安全门禁专项测试 4/4，通过生产化 API 5/5，后端/C 端/管理端构建和 `verify` 通过。
- 真实渠道仍需用户在服务器环境变量注入商户号、AppID、证书、私钥、公钥、HTTPS 回调地址；个人收款码仍只用于线下凭证审核。
## 2026-08-04 项目现状核验与后续执行清单

- 已核验仓库代码、Docs/Summary、Docs/Plans、Prisma schema 和 SQLite 实例，结论写入 `Docs/Summary/2026-08-04_项目现状核验与内测到生产执行清单.md`。
- 只读查询确认 SQLite `user_version=8`；User=12、Course=6、Order=21、Student=22、AccountStudent=22、Enrollment=22，PaymentTransaction=0、PasswordResetChallenge=0。
- 明确区分“代码已实现”和“真实业务未实测”：学员档案 P1-P9 需要业务场景闭环；微信/支付宝需要商户渠道和 HTTPS 回调，个人收款码仅适用于线下凭证审核。
- 当前优先级确定为：P10 学员档案场景验收 → P11 PostgreSQL 测试迁移 → P12 支付沙箱/小额回调验收 → P13 生产切换。
## 2026-08-04 PostgreSQL 配置边界修复

- 用户确认目标为 PostgreSQL、H5+小程序、内部测试验证码；服务器为内网地址，尚无域名。
- 发现并修复 `PrismaService` 将 PostgreSQL/MySQL `DATABASE_URL` 当作 SQLite 文件路径的缺口。
- 为 SQLite migrate/seed 增加 PostgreSQL/MySQL URL 保护，避免误执行 SQLite 流程。
- 新增 `backend/api/prisma/prepare-postgresql.cjs`、`export-postgresql.cjs`、`import-postgresql.cjs` 及对应 npm scripts，用于生成 PostgreSQL schema/migration、导出 SQLite 快照和导入对账。
- 新增 `Docs/Summary/2026-08-04_内测环境配置与数据库实例说明.md`，说明数据库实例字段、内网无域名对支付回调的限制以及用户仍需提供的信息。
## 2026-08-04 微信小程序 JSAPI 支付补齐

- 发现用户已选择小程序，但原支付适配器只有微信 H5/Native；新增 JSAPI 下单、`openid` 读取和小程序 `requestPayment` 参数签名。
- 微信登录接口支持 `mini_program`、`h5`、`official_account` 场景；默认小程序 `code2Session`，H5/公众号走网页 OAuth。
- 新增 `backend/api/test/payment-jsapi.spec.ts`；API 构建、注册/找回密码和支付专项测试通过。
## 2026-08-04 完成度审计与回归

- 后端全量 Jest：11 个测试套件、25 项通过。
- API 构建、C 端 H5 构建、管理端构建、根目录 `verify` 和 `git diff --check` 通过；仅保留 Sass/Vite 弃用提示。
- 本轮仍未执行远程服务器写入、PostgreSQL 安装或真实商户支付，因为服务器系统/数据库实例/公网回调信息尚未确认。
## 2026-08-04 SQLite → PostgreSQL 导出导入工具

- 新增只读 `export-postgresql.cjs`：导出 `user_version`、24 张业务表、行数和 SHA-256；已在当前 SQLite 上实际验证，导出数据包含 User=12、Order=21、Student=22、Enrollment=22 等计数。
- 新增 `import-postgresql.cjs`：要求 PostgreSQL `DATABASE_URL` 和已生成 PostgreSQL Client，按外键依赖顺序导入并回报源/目标行数。
- 发现 `.mjs` 与 CommonJS `require` 冲突，已统一改为 `.cjs` 并通过 Node 语法检查和 SQLite 导出验证。
- 当前未执行 PostgreSQL 导入，因为服务器实例和连接信息尚未确认，避免误连或覆盖未知数据库。
- 导入安全策略已固定：刷新令牌和找回密码挑战不迁移，切库后强制重新登录。
## 2026-08-04 服务器 SSH 探测

- `192.168.0.162:22` 可达，但无 SSH 公钥认证，未尝试密码登录，也未执行远程写入。
- 新增 `Docs/runtime/check-postgres-server.sh`，用于服务器本地输出非敏感的系统、Node、PostgreSQL、服务和端口信息。

## 2026-08-04 服务器基础信息回传

- 收到服务器终端信息：Ubuntu 24.04 系列、Node.js v22.22.1；`psql` 客户端未安装。
- 已更新 PostgreSQL 内测环境说明、任务计划和发现记录。
- 当前仍未执行远程安装或写入；等待 PostgreSQL 服务状态、监听端口和数据库列表的非敏感输出。

## 2026-08-04 个人收款码线下支付闭环

- 管理端支付设置新增微信/支付宝收款码上传。
- C 端报名账单和订单支付记录弹窗展示个人收款码，并保留凭证上传与管理端审核状态机。
- 后端新增收款码图片安全存储、公开读取接口和服务层测试；API、管理端、C 端构建通过，专项测试通过。
- 在线微信/支付宝仍需商户号、应用密钥、证书和公网 HTTPS 回调，个人收款码不能替代。

## 2026-08-04 渠道配置自检

- 新增管理员只读接口 `/api/admin/integration-readiness`，用于服务器注入密钥后检查缺项、HTTPS 回调和找回密码渠道状态。
- 自检不返回密钥值；生产模式下 fake/disabled 适配器不会被标记为可上线。
- 管理端新增“渠道自检”页面，展示同一自检结果；管理端构建通过。

## 2026-08-04 PostgreSQL 初始化脚本

- 新增 Ubuntu 24.04 PostgreSQL 初始化脚本，支持安装服务、创建 `training_app`/`training_management`、交互式设置密码和输出无密码连接模板。
- 脚本未在当前 Windows 环境远程执行；需要用户在 `192.168.0.162` 服务器本地运行并回传非敏感检查结果。
- 新增带确认门槛的 SQLite → PostgreSQL 测试迁移脚本；尚未执行真实迁移，避免在未知实例或未确认维护窗口下写入。
## 2026-08-04 本地到服务器部署手册

- 已核对旧单机部署文档、Plans、PostgreSQL 初始化/迁移/自检脚本、package scripts、API 环境变量和支付回调路由。
- 已确认下一份文档需要覆盖：本地发布、Windows 上传、服务器初始化、PostgreSQL 实例、迁移对账、systemd、Nginx、无域名限制、真实支付配置、P10-P13 顺序、回滚和用户回传清单。
- 已写入 `Docs/Summary/2026-08-04_本地到服务器部署及PostgreSQL与真实支付配置实施手册.md`，并完成 UTF-8、敏感信息、旧 `rsync`/图片说明和 `git diff --check` 检查。
- 根据用户服务器截图补充了 `/opt/training-management` 直接目录部署、缺少 `Docs/runtime` 时的补传步骤，以及 JWT_SECRET 暴露后的轮换提醒。
- 发现的部署错误：手册中的 `/opt/training-management/current` 是推荐版本软链接路径，不是用户当前服务器已经存在的目录；已记录并修正文档。
- 初步评估 Docker：当前项目尚无 Docker 配置且未使用 Redis；建议采用 Compose 容器化 API/PostgreSQL/Nginx，Redis 暂不加入，数据库和上传文件必须使用持久化卷。
- 已按用户确认落地 Docker Compose：PostgreSQL 16、API migration、NestJS API、管理端和 H5；新增 `Dockerfile.api`、`Dockerfile.web`、`docker-compose.yml`、Nginx 配置、`.dockerignore`、`.env.docker.example` 和 Docker 部署方案。
- 已更新 README Docker 快速入口；Compose 静态配置和 `pnpm.cmd run verify` 通过。本地 Docker daemon 未运行，未伪造镜像构建通过结论，需在服务器执行真实 build。
- 当前阻塞仍在服务器侧：等待用户执行 PostgreSQL 初始化并回传非敏感自检结果。
