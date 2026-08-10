import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8')
const css = readFileSync(resolve(root, 'src/styles.css'), 'utf8')
const failures = []
const check = (condition, message) => { if (!condition) failures.push(message) }
const authBranchIndex = app.indexOf('if (!loggedIn) return <Login')
const selectedKeysIndex = app.indexOf('const selectedKeys = useMemo')
check(selectedKeysIndex >= 0 && authBranchIndex >= 0 && selectedKeysIndex < authBranchIndex, 'App 的条件返回不能在 selectedKeys Hook 之前')
check(app.includes('chartRows.map((item, chartIndex)') && app.includes('chartIndex'), '报名汇总图表缺少稳定的 React key')
check(app.includes('tabCacheRef') && app.includes('captureTabSnapshot') && app.includes('restoreTabState') && app.includes('rememberActiveTab'), '多页签缺少切换前快照保存和切回恢复逻辑')
check(app.includes('scrollPositionsRef') && app.includes('tableScrollRef') && app.includes("document.querySelector('.page-main .table-section .table-scroll')"), '多页签缺少列表滚动位置缓存和恢复逻辑')

check(app.includes('className="logout-button"') && css.includes('.logout-button {'), '退出登录按钮缺少统一专用样式')
check(app.includes('visitedTabs') && app.includes('visited-tabs') && app.includes('closeVisitedTab'), '管理端缺少已访问标签页的保存、切换或关闭逻辑')
check(css.includes('.visited-tabs') && css.includes('.visited-tab.active') && css.includes('.visited-tab-close'), '已访问标签页缺少活动态、横向滚动或关闭按钮样式')
check(app.includes("className={active === 'dashboard' ? 'dashboard-main' : 'page-main'}") && app.includes('compact-header'), '非工作台页面缺少与工作台分离的主容器布局')
check(/\.search-toolbar input[\s\S]*?height:\s*26px/.test(css) && /\.page-main \.search-toolbar input[\s\S]*?height:\s*24px/.test(css), '搜索区输入框/下拉框缺少紧凑尺寸')
check(css.includes('.search-toolbar input { width: 145px; min-width: 96px;') && css.includes('.search-section .search-toolbar > input:first-child { width: 165px;') && css.includes('.page-main .search-toolbar input { width: 135px; min-width: 90px;') && css.includes('.page-main .search-toolbar select { width: auto; min-width: 84px;'), '搜索区文本框和筛选下拉框缺少紧凑宽度或中等屏幕适配')
check(app.includes('header-top-row') && app.includes('className="visited-tabs"') && app.includes('module-breadcrumb') && app.includes('退出登录') && app.indexOf('header-top-row') < app.indexOf('className="visited-tabs"'), '顶部面包屑/退出登录与下方独占标签页的布局未接入')
check(app.includes('selectedRows') && app.includes('selectedKeys') && app.includes('toggleAllSelection') && app.includes('exportData'), '列表复选和筛选导出动作未完整')
check(app.includes('全选当前列表') && app.includes('onToggleSelect') && app.includes('onToggleAll') && app.includes('>导出<'), '列表复选框或导出名称未接入')
check(css.includes('.select-column') && css.includes('.select-cell') && css.includes('.selection-hint'), '列表复选框缺少紧凑样式')
const requiredOperationRoutes = [
  ['课程保存/删除', '/admin/courses'],
  ['Banner保存/删除', '/admin/banners'],
  ['报名模板保存/复制/删除', '/admin/templates'],
  ['订单审核/退款/关闭', '/admin/orders/'],
  ['开票处理/文件', '/admin/invoices/'],
  ['学员档案维护/关系/合并', '/admin/student-profiles/'],
  ['用户启停/密码重置', '/admin/users/'],
  ['优惠规则维护/删除', '/admin/discount-rules'],
  ['反馈处理', '/admin/feedbacks/'],
  ['消息维护/启停/删除', '/admin/messages'],
  ['积分调整/流水', '/admin/points/'],
  ['系统配置维护', '/admin/configs/'],
]
requiredOperationRoutes.forEach(([label, route]) => check(app.includes(route), `${label}缺少前端 API 操作入口`))
check(/\.page-main[\s\S]*?\.table-section\s*\{[\s\S]*?min-height:\s*40vh/.test(css) && css.includes('overflow: auto'), '非工作台页面缺少固定高度与表格内部滚动布局')
check(app.includes("{ name: '课程数量', value: data?.courseCount, target: 'courses' }"), '课程数量卡片未映射到课程管理')
check(app.includes("{ name: '报名人数', value: data?.enrollmentCount, target: 'enrollments' }"), '报名人数卡片未映射到报名汇总')
check(app.includes("{ name: '已支付订单', value: data?.paidCount, target: 'orders' }") && app.includes("{ name: '待开票', value: data?.pendingInvoiceCount, target: 'invoices' }"), '工作台业务卡片映射不完整')
check(/\.kpis\s*\{[\s\S]*?gap:\s*24px/.test(css), '工作台卡片没有 24px 间距')
check(/\.dashboard-stack\s*\{[^}]*gap:\s*26px/.test(css), '工作台上下区块没有明确间距')
check(/\.panel\s*\{[\s\S]*?min-width:\s*0[\s\S]*?max-width:\s*100%[\s\S]*?overflow:\s*hidden/.test(css), '面板缺少宽度和溢出约束')
check(/\.table-scroll\s*\{[\s\S]*?min-width:\s*0[\s\S]*?max-width:\s*100%[\s\S]*?overflow-x:\s*auto/.test(css), '表格滚动容器缺少内部横向滚动约束')
check(/\.list-toolbar[^}]*flex-wrap:\s*wrap/.test(css), '顶部工具栏在窄屏不能换行')
check(!app.includes("columnLabels[key] || key"), '表头仍可能回退为英文技术字段')
check(app.includes('const TEMPLATE_FIELD_PAGE_SIZE = 4') && app.includes('fieldPage') && app.includes('form.fields.slice'), '报名模板字段未按每页 4 条分页')
check(app.includes('getListFilterDefinition') && app.includes('filterMatches') && app.includes('statusFilter'), '管理列表缺少按模块字段筛选逻辑')
check((app.match(/active === 'enrollment-details' \? 'courseId'/g) || []).length >= 2, '报名明细关联课程筛选或导出未使用 courseId 参数')
check(app.includes("if (active === 'enrollment-details') return { label: '关联课程'") && app.includes("active === 'rules' || active === 'enrollment-details'"), '报名明细课程筛选选项未从完整课程列表加载')
check(app.includes('const exportPageSize = 100') && app.includes('const exportLimit = 1000') && app.includes('while (exportItems.length < targetCount'), '服务端分页模块导出未按页汇总至 1000 条上限')
check(app.includes('rule-course-summary') && app.includes('rule-course-option') && !app.includes('按住 Ctrl（Windows）或 Command（Mac）可多选'), '优惠规则课程选择未改为复选下拉')
check(app.includes('const [operationKey, setOperationKey]') && app.includes('runOperation'), '管理端操作缺少统一请求锁和错误反馈')
check(app.includes("value: 'operator'") && app.includes("['admin', 'operator'].includes(result.user.role)"), '管理端未区分 operator 角色或未允许运营人员登录')
check(app.includes("const operationKeyRef = useRef('')") && app.includes('if (operationKeyRef.current)') && app.includes('operationKeyRef.current = key') && app.includes('operationKeyRef.current === key'), '管理端请求锁仅依赖异步 state，快速重复提交仍可能并发写入')
check(app.includes('const studentOperationKey = `student:${studentId}`') && app.includes('operationKeyRef.current || operationKey') && app.includes('operationKeyRef.current = studentOperationKey') && app.includes('operationKeyRef.current === studentOperationKey'), '学员档案专用操作仍仅依赖异步 state，快速重复提交可能并发写入')
check(app.includes('Preserve the last successful response during a refresh failure') && app.includes('listError && data === null') && app.includes('className="list-refresh-error"') && css.includes('.list-refresh-error'), '管理端列表刷新失败未保留旧数据或缺少局部重试提示')
check(app.includes('busy={Boolean(operationKey)}') && app.includes('disabled={busy}') && app.includes('保存中…'), '管理端编辑弹窗缺少提交中的按钮禁用和状态提示')
check(/\.modal-actions\s*\{[^}]*position:\s*sticky[^}]*bottom:\s*-28px/.test(css) && /\.app-dialog-actions\s*\{[^}]*position:\s*sticky/.test(css), '管理端弹窗操作栏未固定在窗口底部')
check(app.includes("event.key === 'Escape'") && app.includes('document.body.style.overflow') && app.includes('previousActiveElement'), '管理端统一弹窗缺少 Escape 关闭、滚动锁定或焦点恢复')
check(app.includes('createPortal(dialog, document.body)') && /\.modal-backdrop\s*\{[^}]*z-index:\s*1000/.test(css) && /\.app-dialog-backdrop\s*\{[^}]*z-index:\s*2147483646/.test(css) && /\.app-dialog\s*\{[^}]*z-index:\s*2147483647/.test(css) && css.includes('.enrollment-participant-backdrop { z-index:1100; }'), '二次确认弹窗未通过 Portal 挂载或层级未高于所有业务弹窗')
check(app.includes('const confirmAction = async (message: string') && app.includes('requestDialog({ kind: \'confirm\'') && app.includes('确认保存对课程的修改') && app.includes('确认保存对报名模板的修改') && app.includes('确认保存对 Banner 的修改') && app.includes('确认保存系统配置'), '管理端重要保存操作缺少统一二次确认')
check(!app.includes('window.prompt(') && !app.includes('window.alert('), '管理端仍存在未统一的原生 prompt/alert 交互')
check(app.includes('确认通过订单') && app.includes('确认通过开票申请') && app.includes('确认提交这条反馈的处理回复'), '管理端审核/处理操作缺少二次确认')
check(app.includes("/admin/orders/${encodeURIComponent(item.id)}/refund") && app.includes('审核线下支付凭证'), '订单审核/退款按钮没有接入明确后端操作')
check(app.includes("/admin/invoices/${encodeURIComponent(item.id)}/process") && !app.includes('MOCK-${Date.now()}'), '开票按钮仍可能写入演示发票号码或缺少处理接口')
check(app.includes("/admin/users/${encodeURIComponent(item.id)}/enabled") && app.includes("/admin/users/${encodeURIComponent(item.id)}/reset-password"), '用户启停用/密码重置按钮没有接入后端接口')
check(app.includes("/admin/student-profiles/${encodeURIComponent(form.id)}") && app.includes('报名履历') && app.includes('授权账号'), '学员档案详情缺少资料编辑、关系或履历操作入口')
check(!app.includes("useState('admin')") && !app.includes("useState('123456')") && !app.includes('默认密码 123456'), '管理端登录页仍预填或展示默认密码')
check(app.includes('短信（待接入）') && app.includes('邮件（待接入）') && app.includes('当前仅支持站内消息'), '消息通知未明确限制尚未接入的短信/邮件渠道')
check(app.includes("['enrollments', 'enrollment-details', 'students'].includes(active)") && !app.includes('处理入口：请先核对报名资料和关联订单'), '报名明细按钮仍显示无法执行的处理入口')
check(app.includes("showAction={active !== 'audits'}") && app.includes("active === 'audits' ? () => false"), '审计日志仍显示无效的处理按钮')
check(app.includes("const detailOnlyModule = active === 'enrollment-details' || active === 'students'") && app.includes("['orders', 'invoices', 'feedbacks', 'enrollment-details', 'students'].includes(active) ? openDetail : undefined") && app.includes('onDetail={detailHandler}'), '报名明细/学员列表未接入唯一查看详情按钮')
check(app.includes('/admin/enrollment-records/${encodeURIComponent(String(item.id))}') && app.includes("active === 'enrollment-details'"), '报名明细详情未接入受保护的单条履历接口')
check(app.includes('relatedOrder: relatedOrderResult.items?.[0]') && app.includes('payment-proof'), '报名明细详情未保留关联订单和支付凭证读取')
check(app.includes('detailOnlyModule || active === \'audits\' ? () => false') && app.includes('onDetail={detailHandler}'), '详情专用模块仍可能显示重复的通用操作按钮')
check(app.includes("/admin/orders/${encodeURIComponent(item.id)}/close") && app.includes("item.status === '待支付' ? '关闭订单'") && app.includes("['待支付', '待审核', '已支付']"), '待支付订单缺少管理端关闭动作或状态门禁')
check(app.includes("['待支付', '待审核', '已支付', '已取消']"), '订单筛选仍包含服务端不会产生的已退款状态')
check(app.includes("active === 'feedbacks' ? (item: TableItem) => item.status === '待处理'") && app.includes("active === 'feedbacks' ? '回复处理'"), '已处理反馈仍可能显示可执行的回复按钮')
check(app.includes("active === 'orders' ? (item: TableItem) => ['待支付', '待审核', '已支付'].includes(String(item.status))") && app.includes("active === 'invoices' ? (item: TableItem) => item.status === '待处理'"), '订单或开票列表未按状态隐藏不可执行操作')
check(app.includes('确定删除课程') && app.includes('确定删除 Banner'), '课程或 Banner 删除缺少二次确认')
check(app.includes("/admin/student-profiles/${encodeURIComponent(item.id)}/merge") && app.includes('合并到其他档案'), '学员档案合并能力未接入管理端')
check(app.includes('/admin/student-profiles/export?${params.toString()}') && app.includes('student-profiles-masked.json') && app.includes('sensitiveFieldsMasked'), '学员档案导出未明确按筛选导出并标记脱敏状态')
check(app.includes('template-delete:') && app.includes('另存为副本') && app.includes('删除模板'), '报名模板复制/删除入口未接入')
check(app.includes("/admin/discount-rules/") && app.includes('deleteRule') && app.includes('删除规则') && app.includes('优惠规则已停用'), '优惠规则停用/删除入口未接入')
check(app.includes('conflicts') && app.includes('同门槛冲突'), '优惠规则冲突提示未接入')
check(app.includes('/admin/points/${encodeURIComponent(String(item.userId))}/ledger') && app.includes('查看流水') && app.includes('积分流水'), '积分流水查询入口未接入')
check(app.includes('auditActorFilter') && app.includes('审计开始时间') && app.includes('审计结束时间') && app.includes('&actor='), '审计日志操作者/时间筛选未接入')
check(app.includes('textToListField') && app.includes('targetUserIds: textToListField') && app.includes('targetCourseIds: textToListField'), '消息目标用户/课程未转换为后端数组参数')
check(app.includes("moduleKey === 'users' && key === 'role'") && app.includes("return '用户角色'") && app.includes("value: 'operator'") && app.includes("['admin', 'operator'].includes(result.user.role)"), '用户管理未区分 operator 角色或管理端登录未允许运营人员')
check(app.includes('目标用户 ID') && app.includes('目标课程 ID') && app.includes('开始展示时间') && app.includes('结束展示时间'), '消息目标范围或展示时间编辑字段未接入')
check(app.includes('invoiceFileStatus') && app.includes('发票文件状态'), '发票文件状态预留未在管理端展示')
check(app.includes('/admin/messages/${encodeURIComponent(messageForm.id!)}`') && app.includes('删除消息') && app.includes('阅读记录也会一并清理'), '消息删除入口未接入确认和后端接口')
check(app.includes('/admin/messages/${encodeURIComponent(String(item.id))}/enabled') && app.includes("active === 'messages' ? '启用 / 停用'"), '消息启停入口未接入后端接口')
check(app.includes('/admin/invoices/${encodeURIComponent(String(item.id))}/file') && app.includes('上传发票'), '发票文件上传入口未接入后端接口')
check(app.includes('openInvoiceFile') && app.includes('查看发票') && app.includes('apiFetchBlob(`/admin/invoices/'), '已上传发票缺少管理端受保护查看入口')
check(/invoices:\s*\[[^\]]*invoiceFileStatus/.test(app), '开票列表未展示发票文件状态')
check(app.includes('template-save:') && app.includes('banner-save:') && app.includes('message-save:') && app.includes('config-save:') && app.includes('points-adjust:') && app.includes('feedback-resolve:'), '关键管理端保存操作未统一接入请求锁')
check(app.includes('course-delete:') && app.includes('banner-delete:') && app.includes('template-delete:') && app.includes('message-delete:'), '关键管理端删除操作未统一接入请求锁')
check(app.includes('course-save:${form.id || \'new\'}') && app.includes('const saved = await runOperation('), '课程保存未接入统一请求锁和刷新错误隔离')
check(app.includes('order-review:${orderId}') && app.includes('const submitted = await runOperation('), '线下凭证审核未接入统一请求锁和刷新错误隔离')
check(app.includes('详情和列表刷新失败') && app.includes('详情刷新失败') && app.includes('列表刷新失败'), '学员档案写入后的详情/列表刷新失败未与写入结果隔离')
check(app.includes('const reloadStudentDetail = async') && app.includes('onStudentReload={reloadStudentDetail}') && app.includes('onReload={onStudentReload}') && app.includes('重新加载详情'), '学员详情刷新失败缺少直接重试入口')
check(app.includes('email.includes(\'*\') ? \'\' : email') && app.includes('if (form.phone.trim()) payload.phone') && app.includes('if (form.email.trim()) payload.email'), '学员档案编辑不能把列表脱敏手机号/邮箱拼成无效值回写')

check(app.includes("runOperation('course-image-upload'") && app.includes('runOperation(`payment-qr-upload:${channel}`') && app.includes('accept="image/*" disabled={submitting}'), '课程图片和收款码上传缺少统一请求锁或上传期间禁用')

const expectedColumns = {
  courses: ['id','title','subtitle','category','date','location','instructor','status'],
  banners: ['id','title','courseId','sort','enabled','startsAt','endsAt'],
  templates: ['id','courseId','name','fields'],
  enrollments: ['courseId','courseTitle','registrationDeadline','enrollmentCount','paidCount','unpaidCount'],
  'enrollment-details': ['id','orderId','courseId','courseTitle','paymentStatus','name','phone','company'],
  orders: ['id','userId','courseId','participantCount','amount','status','paymentMethod','createdAt'],
  invoices: ['id','userId','title','taxNo','email','status','invoiceNo','invoiceFileStatus','createdAt'],
  students: ['id','orderId','courseTitle','paymentStatus','name','phone','company'],
  users: ['id','username','name','company','points','enabled','courseCount','previewCount'],
  payment: ['accountName','bankName','accountNo','qrCodeText','onlineWechatEnabled','onlineAlipayEnabled'],
  rules: ['id','minPeople','discountRate','enabled'],
  feedbacks: ['id','userId','category','content','status','reply','createdAt'],
  messages: ['id','title','channel','enabled','readCount','targetUserIds','targetCourseIds','startsAt','endsAt'],
  points: ['userId','userName','points'],
  configs: ['key','value','description'],
  audits: ['id','actor','action','detail','createdAt'],
  dashboard: ['courseId','title','enrolled','paidOrders','previews'],
}

for (const [key, columns] of Object.entries(expectedColumns)) {
  const quoted = app.includes(`'${key}': [`)
  const plain = app.includes(`${key}: [`)
  check(quoted || plain, `${key} 模块没有明确的中文表头列定义`)
  for (const column of columns) {
    const labelPattern = new RegExp(`(?:^|[,\\s])${column}:\\s*'[^']+'`, 'm')
    check(labelPattern.test(app), `${key}.${column} 没有中文表头映射`)
  }
}

check(app.includes('StudentRelationDialog') && app.includes('requestStudentRelationSelection') && app.includes("role: 'user'") && css.includes('.student-relation-modal') && css.includes('.student-relation-option'), '学生档案授权未具备可搜索/选择账号的弹窗交互')
check(app.includes('StudentMergeDialog') && app.includes('requestStudentMergeSelection') && app.includes("status: 'active'") && app.includes('选择合并目标档案') && app.includes('student-merge-modal') && css.includes('.student-merge-backdrop'), '学员档案合并仍依赖手工输入 ID，缺少可搜索/选择目标档案交互')

if (failures.length) {
  console.error(failures.map((item) => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log('后台 UI 静态验收通过：标签页、紧凑自适应列表、内部滚动、复选导出、按钮门禁和中文表头均有明确实现。')
