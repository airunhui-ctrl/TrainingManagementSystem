import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8')
const css = readFileSync(resolve(root, 'src/styles.css'), 'utf8')
const failures = []
const check = (condition, message) => { if (!condition) failures.push(message) }

check(app.includes('className="logout-button"') && css.includes('.logout-button {'), '退出登录按钮缺少统一专用样式')
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
check(app.includes('rule-course-summary') && app.includes('rule-course-option') && !app.includes('按住 Ctrl（Windows）或 Command（Mac）可多选'), '优惠规则课程选择未改为复选下拉')

const expectedColumns = {
  courses: ['id','title','subtitle','category','date','location','instructor','status'],
  banners: ['id','title','courseId','sort','enabled','startsAt','endsAt'],
  templates: ['id','courseId','name','fields'],
  enrollments: ['courseId','courseTitle','registrationDeadline','enrollmentCount','paidCount','unpaidCount'],
  'enrollment-details': ['id','orderId','courseId','courseTitle','paymentStatus','name','phone','company'],
  orders: ['id','userId','courseId','participantCount','amount','status','paymentMethod','createdAt'],
  invoices: ['id','userId','title','taxNo','email','status','invoiceNo','createdAt'],
  students: ['id','orderId','courseTitle','paymentStatus','name','phone','company'],
  users: ['id','username','name','company','points','enabled','courseCount','previewCount'],
  payment: ['accountName','bankName','accountNo','qrCodeText','onlineWechatEnabled','onlineAlipayEnabled'],
  rules: ['id','minPeople','discountRate','enabled'],
  feedbacks: ['id','userId','category','content','status','reply','createdAt'],
  messages: ['id','title','channel','enabled','sentCount'],
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

if (failures.length) {
  console.error(failures.map((item) => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log('后台 UI 静态验收通过：退出按钮、卡片导航、卡片间距、容器边界、工具栏响应式和中文表头均有明确实现。')
