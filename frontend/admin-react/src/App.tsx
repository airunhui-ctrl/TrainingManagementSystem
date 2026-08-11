import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { adminLogin, apiFetch, apiFetchBlob, apiUpload, API_BASE_URL } from './api'
import { authStorage } from './auth'

type Module = { key: string; label: string; endpoint?: string; editable?: boolean }
type NavGroup = { key: string; label: string; icon: string; moduleKeys: string[] }
type TableItem = Record<string, any>
type TabSnapshot = Record<string, any>
type RowActionLabel = string | ((item: TableItem) => string)
type CourseOption = { id: string; title: string }
type TemplateOption = { id: string; name: string; locked?: boolean }
type TemplateField = { key: string; label: string; type: 'text' | 'phone' | 'select' | 'radio' | 'checkbox'; required: boolean; options?: string[] }
type TemplateForm = { id?: string; name: string; fields: TemplateField[] }
type BannerForm = { id?: string; title: string; courseId: string; sort: string; enabled: boolean; startsAt: string; endsAt: string }
type PaymentForm = { accountName: string; bankName: string; accountNo: string; qrCodeText: string; wechatQrImage: string; alipayQrImage: string; onlineWechatEnabled: boolean; onlineAlipayEnabled: boolean }
type RuleForm = { id?: string; minPeople: string; discountRate: string; courseIds: string; enabled: boolean }
type MessageForm = { id?: string; title: string; content: string; channel: string; enabled: boolean; targetUserIds: string; targetCourseIds: string; startsAt: string; endsAt: string }
type ConfigForm = { key: string; value: string; description: string }
type PointsForm = { userId: string; userName: string; points: string; reason: string }
type FeedbackForm = { id: string; reply: string }
type StudentProfileForm = { id: string; name: string; phone: string; email: string; company: string; department: string; position: string }
type ReviewState = { order: TableItem; proof: TableItem; imageUrl: string }
type EnrollmentSummaryDetailState = { summary: TableItem; items: TableItem[] }
type PointLedgerDetailState = { user: TableItem; items: TableItem[]; page: number; pageSize: number; total: number }
type DialogRequest = { kind: 'confirm' | 'prompt'; title: string; message: string; value: string; placeholder: string; confirmLabel: string; danger?: boolean }
type StudentRelationSelection = { userId: string; username: string; userName: string; relationType: string }
type StudentMergeSelection = { targetId: string; targetName: string }
type CourseForm = {
  id?: string
  title: string
  subtitle: string
  category: string
  date: string
  courseStartAt: string
  courseEndAt: string
  location: string
  instructor: string
  price: string
  originalPrice: string
  specialPrice: string
  capacity: string
  enrolled: string
  status: string
  registrationDeadline: string
  registrationTemplateId: string
  allowMultiParticipant: boolean
  description: string
  descriptionRichText: string
  image: string
}

const emptyCourseForm = (): CourseForm => ({
  title: '', subtitle: '', category: '01', date: '', courseStartAt: '', courseEndAt: '', location: '', instructor: '',
  price: '', originalPrice: '', specialPrice: '', capacity: '30', enrolled: '0', status: '报名中',
  registrationDeadline: '', registrationTemplateId: '', allowMultiParticipant: true, description: '', descriptionRichText: '', image: '',
})

const courseCategoryFallback: FilterOption[] = [
  { value: '01', label: '综合管理' },
  { value: '02', label: '人才管理' },
  { value: '03', label: '经营管理' },
  { value: '04', label: '组织效能' },
  { value: '05', label: '绩效管理' },
  { value: '06', label: '组织发展' },
  { value: '07', label: '数字化学习' },
]

const modules: Module[] = [
  { key: 'dashboard', label: '工作台' },
  { key: 'banners', label: 'Banner 管理', endpoint: '/admin/banners', editable: true },
  { key: 'courses', label: '课程管理', endpoint: '/admin/courses', editable: true },
  { key: 'templates', label: '报名模板', endpoint: '/admin/templates', editable: true },
  { key: 'enrollments', label: '报名汇总', endpoint: '/admin/enrollment-summary' },
  { key: 'enrollment-details', label: '报名明细', endpoint: '/admin/enrollment-records' },
  { key: 'orders', label: '订单与支付', endpoint: '/admin/orders' },
  { key: 'invoices', label: '开票管理', endpoint: '/admin/invoices' },
  { key: 'students', label: '学员管理', endpoint: '/admin/student-profiles' },
  { key: 'users', label: '用户管理', endpoint: '/admin/users' },
  { key: 'readiness', label: '渠道自检', endpoint: '/admin/integration-readiness' },
  { key: 'payment', label: '支付设置', endpoint: '/admin/payment-settings', editable: true },
  { key: 'rules', label: '运营优惠', endpoint: '/admin/discount-rules', editable: true },
  { key: 'feedbacks', label: '反馈管理', endpoint: '/admin/feedbacks' },
  { key: 'messages', label: '消息通知', endpoint: '/admin/messages' },
  { key: 'points', label: '积分管理', endpoint: '/admin/points' },
  { key: 'configs', label: '系统配置', endpoint: '/admin/configs' },
  { key: 'audits', label: '操作审计', endpoint: '/admin/audits' },
]
const navGroups: NavGroup[] = [
  { key: 'content', label: '内容与课程', icon: '课', moduleKeys: ['banners', 'courses', 'templates'] },
  { key: 'business', label: '报名与交易', icon: '业', moduleKeys: ['enrollments', 'enrollment-details', 'orders', 'invoices'] },
  { key: 'users', label: '用户与运营', icon: '人', moduleKeys: ['students', 'users', 'rules', 'feedbacks', 'messages', 'points'] },
  { key: 'system', label: '系统管理', icon: '设', moduleKeys: ['readiness', 'payment', 'configs', 'audits'] },
]
const serverPagedModules = new Set(['courses', 'orders', 'invoices', 'users', 'feedbacks', 'enrollment-details', 'students'])
const PAGE_SIZE = 5
const VISITED_TABS_STORAGE_KEY = 'training-management-admin-visited-tabs'
const COURSE_DRAFT_STORAGE_KEY = 'training-management-admin-course-draft'

const defaultTemplateFields = [
  { key: 'name', label: '姓名', type: 'text', required: true },
  { key: 'phone', label: '手机号', type: 'phone', required: true },
  { key: 'department', label: '部门', type: 'radio', required: false, options: ['研发', '运营', '市场'] },
  { key: 'needs', label: '培训诉求', type: 'checkbox', required: false, options: ['技能提升', '管理提升', '组织发展'] },
]
const emptyTemplateForm = (): TemplateForm => ({ name: '', fields: defaultTemplateFields.map(field => ({ ...field, options: field.options ? [...field.options] : undefined })) as TemplateField[] })
const emptyBannerForm = (sort = '1'): BannerForm => ({ title: '', courseId: '', sort, enabled: true, startsAt: '', endsAt: '' })
const emptyPaymentForm = (): PaymentForm => ({ accountName: '', bankName: '', accountNo: '', qrCodeText: '', wechatQrImage: '', alipayQrImage: '', onlineWechatEnabled: true, onlineAlipayEnabled: true })
const emptyRuleForm = (): RuleForm => ({ minPeople: '2', discountRate: '0.9', courseIds: '', enabled: true })
const emptyMessageForm = (): MessageForm => ({ title: '', content: '', channel: '站内消息', enabled: true, targetUserIds: '', targetCourseIds: '', startsAt: '', endsAt: '' })
const listFieldToText = (value: unknown) => Array.isArray(value) ? value.map(String).join(', ') : String(value || '')
const textToListField = (value: string) => [...new Set(value.split(/[,，\n]/).map(item => item.trim()).filter(Boolean))]
const dateToLocalInput = (value: unknown) => { const source = String(value || '').trim(); if (!source) return ''; const date = new Date(source); if (!Number.isFinite(date.getTime())) return source.slice(0, 16); const pad = (item: number) => String(item).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}` }
const normalizeCourseDateTime = (value: unknown) => {
  const source = String(value || '').trim()
  const match = source.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/)
  return match ? `${match[1]}T${match[2]}` : dateToLocalInput(source)
}
const parseCourseSchedule = (value: unknown) => {
  const matches = String(value || '').match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/g) || []
  return { start: normalizeCourseDateTime(matches[0] || ''), end: normalizeCourseDateTime(matches[1] || '') }
}
const formatCourseSchedule = (start: string, end: string) => {
  const format = (value: string) => value.trim().replace('T', ' ')
  if (start && end) return `${format(start)} - ${format(end)}`
  return format(start || end)
}
const readCourseDraft = (): Partial<CourseForm> | null => {
  if (typeof window === 'undefined') return null
  try {
    const draft = JSON.parse(window.localStorage.getItem(COURSE_DRAFT_STORAGE_KEY) || 'null')
    return draft && typeof draft === 'object' && !draft.id ? draft as Partial<CourseForm> : null
  } catch { return null }
}
const removeCourseDraft = () => { try { window.localStorage.removeItem(COURSE_DRAFT_STORAGE_KEY) } catch { /* ignore unavailable storage */ } }
const emptyConfigForm = (): ConfigForm => ({ key: '', value: '', description: '' })
const emptyPointsForm = (): PointsForm => ({ userId: '', userName: '', points: '0', reason: '' })
const emptyFeedbackForm = (): FeedbackForm => ({ id: '', reply: '' })
const emptyStudentProfileForm = (): StudentProfileForm => ({ id: '', name: '', phone: '', email: '', company: '', department: '', position: '' })
const getInitialVisitedTabs = () => {
  const fallback = ['dashboard']
  if (typeof window === 'undefined') return fallback
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(VISITED_TABS_STORAGE_KEY) || 'null')
    if (!Array.isArray(stored)) return fallback
    const validKeys = new Set(modules.map(item => item.key))
    const tabs = stored.filter((item): item is string => typeof item === 'string' && validKeys.has(item))
    return ['dashboard', ...tabs.filter(item => item !== 'dashboard').filter((item, index, list) => list.indexOf(item) === index)]
  } catch {
    return fallback
  }
}

function ModalCloseButton({ onClick, disabled = false, label = '关闭弹窗' }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return <button type="button" className="modal-close" aria-label={label} title={label} disabled={disabled} onClick={onClick}>×</button>
}

const columnLabels: Record<string, string> = {
  id: '编号', courseId: '课程编号', orderId: '订单编号', userId: '用户编号', username: '用户账号', userName: '用户名称', accountUserId: '所属账号编号', accountUsername: '所属账号', accountUserName: '账号用户',
  title: '标题', subtitle: '副标题', name: '姓名', templateName: '模板名称', courseIds: '课程编号', courseNames: '适用课程', registrationTemplateName: '报名模板', category: '分类', content: '内容', description: '说明',
  date: '上课时间', startsAt: '开始时间', endsAt: '结束时间', createdAt: '创建时间', updatedAt: '更新时间',
  processedAt: '处理时间', repliedAt: '回复时间', registeredAt: '注册时间', lastActiveAt: '最近活跃', registrationDeadline: '报名截止时间',
  location: '上课地点', instructor: '讲师', company: '公司', companySize: '企业规模', role: '职务', phone: '手机号', email: '邮箱',
  price: '课程价格', originalPrice: '课程原价', specialPrice: '课程特价', capacity: '课程名额', enrolled: '已报名人数', seatsLeft: '剩余名额',
  participantCount: '报名人数', enrollmentCount: '报名人数', paidCount: '已支付人数', unpaidCount: '未支付人数',
  originalAmount: '原始金额', discount: '优惠金额', amount: '实付金额', minPeople: '最低人数', discountRate: '折扣比例',
  status: '状态', paymentStatus: '支付状态', paymentMethod: '支付方式', paymentChannel: '支付渠道', paymentProof: '支付凭证',
  courseTitle: '课程名称', courseCount: '关联课程数', previewCount: '预览次数', paidOrders: '已支付订单', previews: '预览次数',
  allowMultiParticipant: '支持多人报名', enabled: '启用状态', sort: '排序', fields: '表单字段', points: '积分',
  taxNo: '纳税人识别号', invoiceNo: '发票号码', invoiceFileStatus: '发票文件状态', remark: '备注', reply: '回复内容', channel: '通知渠道', sentCount: '发送数量', readCount: '已读人数', targetUserIds: '目标用户', targetCourseIds: '目标课程',
  key: '配置项', value: '配置值', actor: '操作人', action: '操作类型', detail: '操作详情',
  accountName: '收款户名', bankName: '开户银行', accountNo: '银行账号', qrCodeText: '收款码',
  onlineWechatEnabled: '微信支付', onlineAlipayEnabled: '支付宝支付', conflicts: '冲突规则',
  paymentProofStatus: '凭证状态', originalName: '原始文件名', mimeType: '文件类型', size: '文件大小', path: '访问路径', reviewedAt: '审核时间', department: '部门', position: '职务', orderStatus: '订单状态', templateId: '模板编号', templateVersion: '模板版本', formPayload: '报名表单快照', cancelledAt: '取消时间',
}

const moduleColumns: Record<string, string[]> = {
  courses: ['id', 'title', 'subtitle', 'category', 'date', 'location', 'instructor', 'registrationTemplateName', 'status'],
  banners: ['id', 'title', 'courseTitle', 'sort', 'enabled', 'startsAt', 'endsAt'],
  templates: ['id', 'courseIds', 'courseNames', 'name', 'courseCount', 'fields'],
  enrollments: ['courseId', 'courseTitle', 'registrationDeadline', 'enrollmentCount', 'paidCount', 'unpaidCount'],
  'enrollment-details': ['name', 'phone', 'courseTitle', 'company', 'department', 'position', 'status', 'orderStatus', 'orderId', 'accountUsername', 'registeredAt', 'id'],
  students: ['name', 'phone', 'company', 'department', 'position', 'status', 'enrollmentCount', 'updatedAt', 'id'],
  orders: ['id', 'userId', 'courseId', 'participantCount', 'amount', 'status', 'paymentMethod', 'createdAt'],
  invoices: ['id', 'userId', 'title', 'taxNo', 'email', 'status', 'invoiceNo', 'invoiceFileStatus', 'invoiceFileName', 'createdAt'],
  users: ['id', 'username', 'name', 'role', 'enabled', 'registeredAt', 'lastActiveAt', 'courseCount', 'previewCount', 'points'],
  rules: ['id', 'minPeople', 'discountRate', 'courseIds', 'conflicts', 'enabled'],
  feedbacks: ['id', 'userId', 'category', 'content', 'status', 'reply', 'createdAt'],
  payment: ['accountName', 'bankName', 'accountNo', 'qrCodeText', 'onlineWechatEnabled', 'onlineAlipayEnabled'],
  readiness: [],
  messages: ['id', 'title', 'channel', 'enabled', 'readCount', 'targetUserIds', 'targetCourseIds', 'startsAt', 'endsAt'],
  points: ['userId', 'userName', 'points'],
  configs: ['key', 'value', 'description'],
  audits: ['id', 'actor', 'action', 'detail', 'createdAt'],
  dashboard: ['courseId', 'title', 'enrolled', 'paidOrders', 'previews'],
}

type FilterOption = { value: string; label: string }
type ListFilterDefinition = { label: string; field: string; options: FilterOption[] }

const uniqueFilterOptions = (items: TableItem[], field: string, labelField?: string): FilterOption[] => {
  const values = new Map<string, string>()
  items.forEach(item => {
    const value = String(item[field] ?? '')
    if (value) values.set(value, String(labelField ? item[labelField] ?? value : value))
  })
  return Array.from(values, ([value, label]) => ({ value, label }))
}

const getListFilterDefinition = (active: string, items: TableItem[], courseOptions: CourseOption[]): ListFilterDefinition | null => {
  if (active === 'courses') return { label: '课程状态', field: 'status', options: ['待发布', '报名中', '名额紧张', '已结束', '已下架'].map(value => ({ value, label: value })) }
  if (active === 'banners') return { label: '启用状态', field: 'enabled', options: [{ value: 'true', label: '已启用' }, { value: 'false', label: '已停用' }] }
  if (active === 'templates') return { label: '适用课程', field: 'courseIds', options: courseOptions.map(course => ({ value: course.id, label: course.title })) }
  if (active === 'enrollments') return { label: '关联课程', field: 'courseId', options: uniqueFilterOptions(items, 'courseId', 'courseTitle') }
  if (active === 'enrollment-details') return { label: '关联课程', field: 'courseId', options: courseOptions.length ? courseOptions.map(course => ({ value: course.id, label: course.title })) : uniqueFilterOptions(items, 'courseId', 'courseTitle') }
  if (active === 'students') return { label: '档案状态', field: 'status', options: ['active', 'inactive', 'merged'].map(value => ({ value, label: value === 'active' ? '启用' : value === 'inactive' ? '停用' : '已合并' })) }
  if (active === 'orders') return { label: '订单状态', field: 'status', options: ['待支付', '待审核', '已支付', '已取消'].map(value => ({ value, label: value })) }
  if (active === 'invoices') return { label: '开票状态', field: 'status', options: ['待处理', '已开票', '已驳回'].map(value => ({ value, label: value })) }
  if (active === 'users') return { label: '用户角色', field: 'role', options: [{ value: 'user', label: '普通用户' }, { value: 'operator', label: '运营人员' }, { value: 'admin', label: '平台管理员' }] }
  if (active === 'rules') return { label: '启用状态', field: 'enabled', options: [{ value: 'true', label: '已启用' }, { value: 'false', label: '已停用' }] }
  if (active === 'feedbacks') return { label: '处理状态', field: 'status', options: ['待处理', '已处理'].map(value => ({ value, label: value })) }
  if (active === 'messages') return { label: '通知渠道', field: 'channel', options: uniqueFilterOptions(items, 'channel') }
  return null
}

const filterMatches = (item: TableItem, field: string, expected: string) => {
  if (field === 'enabled') return String(item.enabled !== false) === expected
  if (Array.isArray(item[field])) return item[field].map(String).includes(expected)
  return String(item[field] ?? '') === expected
}
const selectionKey = (item: TableItem) => String(item.id ?? item.courseId ?? item.orderId ?? item.userId ?? item.username ?? item.name ?? '')

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const plainTextToRichText = (value: string) => value.trim() ? `<p>${escapeHtml(value.trim()).replace(/\r?\n/g, '<br />')}</p>` : '<p><br /></p>'
const richTextToPlainText = (value: string) => value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p\s*>|<\/div\s*>|<\/h[1-6]\s*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
const assetUrl = (value: unknown) => {
  const source = String(value || '').trim()
  if (!source) return ''
  if (/^(data:|https?:\/\/)/i.test(source)) return source
  const path = source.startsWith('/api') ? source.slice(4) : source.startsWith('/') ? source : `/${source}`
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`
}

function Login({ done }: { done: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const login = async () => {
    try {
      const result = await adminLogin(username, password)
      if (!['admin', 'operator'].includes(result.user.role)) throw new Error()
      authStorage.setTokens(result.accessToken, result.refreshToken)
      done()
    } catch { setError('账号或密码错误') }
  }
  return <main className="login"><form className="login-card" onSubmit={event => { event.preventDefault(); login() }}><b>六</b><h1>六边形培训管理端</h1><p>运营管理工作台</p><input value={username} onChange={event => setUsername(event.target.value)} placeholder="请输入管理账号" autoComplete="username" /><input value={password} onChange={event => setPassword(event.target.value)} type="password" placeholder="请输入密码" autoComplete="current-password" /><button className="primary" type="submit">登录管理端</button>{error && <small>{error}</small>}</form></main>
}

function AdminDialog({ request, onClose, onSubmit }: { request: DialogRequest; onClose: (value: boolean | string | null) => void; onSubmit: (value: boolean | string) => void }) {
  const [value, setValue] = useState(request.value)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setValue(request.value)
    const previousActiveElement = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    const closeValue = request.kind === 'confirm' ? false : null
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose(closeValue)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    const focusTimer = request.kind === 'prompt' ? window.setTimeout(() => inputRef.current?.focus(), 0) : undefined
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (focusTimer !== undefined) window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      previousActiveElement?.focus?.()
    }
  }, [request])
  const dialog = <div className="app-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(request.kind === 'confirm' ? false : null) }}>
    <section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" aria-describedby="app-dialog-message">
      <div className="app-dialog-head"><h2 id="app-dialog-title">{request.title}</h2><button type="button" className="modal-close" aria-label="关闭" onClick={() => onClose(request.kind === 'confirm' ? false : null)}>×</button></div>
      <p id="app-dialog-message" className="app-dialog-message">{request.message}</p>
      {request.kind === 'prompt' && <input ref={inputRef} className="app-dialog-input" value={value} onChange={event => setValue(event.target.value)} placeholder={request.placeholder} onKeyDown={event => { if (event.key === 'Enter') onSubmit(value) }} />}
      <div className="app-dialog-actions"><button type="button" onClick={() => onClose(request.kind === 'confirm' ? false : null)}>取消</button><button type="button" className={request.danger ? 'danger-button' : 'primary'} onClick={() => onSubmit(request.kind === 'confirm' ? true : value)}>{request.confirmLabel}</button></div>
    </section>
  </div>
  // Mount confirmations at the document root so they are above every edit/detail modal.
  return typeof document === 'undefined' ? null : createPortal(dialog, document.body)
}

function App() {
  const [loggedIn, setLoggedIn] = useState(Boolean(authStorage.get()))
  const [active, setActive] = useState('dashboard')
  const [data, setData] = useState<any>(null)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [visitedTabs, setVisitedTabs] = useState<string[]>(getInitialVisitedTabs)
  const [courseOptions, setCourseOptions] = useState<CourseOption[]>([])
  const [templateOptions, setTemplateOptions] = useState<TemplateOption[]>([])
  const [courseCategoryOptions, setCourseCategoryOptions] = useState<FilterOption[]>([])
  const [notice, setNotice] = useState('')
  const [dialogRequest, setDialogRequest] = useState<DialogRequest | null>(null)
  const [tableKeyword, setTableKeyword] = useState('')
  const [queryKeyword, setQueryKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [auditActionFilter, setAuditActionFilter] = useState('')
  const [auditActorFilter, setAuditActorFilter] = useState('')
  const [auditFrom, setAuditFrom] = useState('')
  const [auditTo, setAuditTo] = useState('')
  const [page, setPage] = useState(1)
  const [courseModalOpen, setCourseModalOpen] = useState(false)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [templateForm, setTemplateForm] = useState<TemplateForm>(emptyTemplateForm)
  const [templateLocked, setTemplateLocked] = useState(false)
  const [bannerModalOpen, setBannerModalOpen] = useState(false)
  const [bannerForm, setBannerForm] = useState<BannerForm>(emptyBannerForm)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(emptyPaymentForm)
  const [ruleModalOpen, setRuleModalOpen] = useState(false)
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRuleForm)
  const [messageModalOpen, setMessageModalOpen] = useState(false)
  const [messageForm, setMessageForm] = useState<MessageForm>(emptyMessageForm)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [configForm, setConfigForm] = useState<ConfigForm>(emptyConfigForm)
  const [pointsModalOpen, setPointsModalOpen] = useState(false)
  const [pointsForm, setPointsForm] = useState<PointsForm>(emptyPointsForm)
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false)
  const [feedbackForm, setFeedbackForm] = useState<FeedbackForm>(emptyFeedbackForm)
  const [studentEditModalOpen, setStudentEditModalOpen] = useState(false)
  const [studentProfileForm, setStudentProfileForm] = useState<StudentProfileForm>(emptyStudentProfileForm)
  const [reviewState, setReviewState] = useState<ReviewState | null>(null)
  const [reviewRemark, setReviewRemark] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [courseForm, setCourseForm] = useState<CourseForm>(emptyCourseForm)
  const [courseSubmitting, setCourseSubmitting] = useState(false)
  const courseInitialFormRef = useRef<CourseForm>(emptyCourseForm())
  const [operationKey, setOperationKey] = useState('')
  // React state updates are asynchronous; use a ref as the authoritative
  // same-tick guard so two rapid submits cannot both pass the busy check.
  const operationKeyRef = useRef('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [openNavGroup, setOpenNavGroup] = useState('')
  const loadVersion = useRef(0)
  const tabCacheRef = useRef<Record<string, TabSnapshot>>({})
  const scrollPositionsRef = useRef<Record<string, { top: number; left: number }>>({})
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<{ module: string; item: TableItem; proof?: TableItem | null; relatedOrder?: TableItem; intent?: 'view' | 'process' } | null>(null)
  const [enrollmentSummaryDetail, setEnrollmentSummaryDetail] = useState<EnrollmentSummaryDetailState | null>(null)
  const [pointLedgerDetail, setPointLedgerDetail] = useState<PointLedgerDetailState | null>(null)
  const [selectedRows, setSelectedRows] = useState<TableItem[]>([])
  const [studentRelationStudentId, setStudentRelationStudentId] = useState<string | null>(null)
  const [studentMergeSourceId, setStudentMergeSourceId] = useState<string | null>(null)
  const current = useMemo(() => modules.find(item => item.key === active)!, [active])
  const activeNavGroup = useMemo(() => navGroups.find(group => group.moduleKeys.includes(active)), [active])
  const dialogResolverRef = useRef<((value: boolean | string | null) => void) | null>(null)
  const studentRelationResolverRef = useRef<((value: StudentRelationSelection | null) => void) | null>(null)
  const studentMergeResolverRef = useRef<((value: StudentMergeSelection | null) => void) | null>(null)

  const flash = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 1800) }
  const finishDialog = (value: boolean | string | null) => {
    const resolve = dialogResolverRef.current
    dialogResolverRef.current = null
    setDialogRequest(null)
    resolve?.(value)
  }
  const requestDialog = (request: DialogRequest) => new Promise<boolean | string | null>(resolve => {
    if (dialogResolverRef.current) { resolve(request.kind === 'confirm' ? false : null); return }
    dialogResolverRef.current = resolve
    setDialogRequest(request)
  })
  const confirmAction = async (message: string, title = '操作确认', danger = false) => Boolean(await requestDialog({ kind: 'confirm', title, message, value: '', placeholder: '', confirmLabel: '确定', danger }))
  const promptAction = async (message: string, defaultValue = '', title = '请输入') => {
    const result = await requestDialog({ kind: 'prompt', title, message, value: defaultValue, placeholder: '请输入内容', confirmLabel: '确定' })
    return typeof result === 'string' ? result : null
  }
  const finishStudentRelationSelection = (value: StudentRelationSelection | null) => {
    const resolve = studentRelationResolverRef.current
    studentRelationResolverRef.current = null
    setStudentRelationStudentId(null)
    resolve?.(value)
  }
  const requestStudentRelationSelection = (studentId: string) => new Promise<StudentRelationSelection | null>(resolve => {
    if (studentRelationResolverRef.current) { resolve(null); return }
    studentRelationResolverRef.current = resolve
    setStudentRelationStudentId(studentId)
  })
  const finishStudentMergeSelection = (value: StudentMergeSelection | null) => {
    const resolve = studentMergeResolverRef.current
    studentMergeResolverRef.current = null
    setStudentMergeSourceId(null)
    resolve?.(value)
  }
  const requestStudentMergeSelection = (studentId: string) => new Promise<StudentMergeSelection | null>(resolve => {
    if (studentMergeResolverRef.current) { resolve(null); return }
    studentMergeResolverRef.current = resolve
    setStudentMergeSourceId(studentId)
  })
  const captureTabSnapshot = (): TabSnapshot => ({
    data, tableKeyword, queryKeyword, statusFilter, auditActionFilter, auditActorFilter, auditFrom, auditTo, page,
    courseModalOpen, templateModalOpen, templateForm, bannerModalOpen, bannerForm, paymentModalOpen, paymentForm,
    ruleModalOpen, ruleForm, messageModalOpen, messageForm, configModalOpen, configForm, pointsModalOpen, pointsForm,
    feedbackModalOpen, feedbackForm, studentEditModalOpen, studentProfileForm, reviewState, reviewRemark,
    courseForm, selectedDetail, enrollmentSummaryDetail, pointLedgerDetail, selectedRows,
  })
  const rememberActiveTab = () => {
    tabCacheRef.current[active] = captureTabSnapshot()
    if (tableScrollRef.current) scrollPositionsRef.current[active] = { top: tableScrollRef.current.scrollTop, left: tableScrollRef.current.scrollLeft }
  }
  const resetTabState = () => {
    loadVersion.current += 1
    setData(null); setListLoading(false); setListError(''); setCourseModalOpen(false); setTemplateModalOpen(false); setBannerModalOpen(false); setPaymentModalOpen(false); setRuleModalOpen(false); setMessageModalOpen(false); setConfigModalOpen(false); setPointsModalOpen(false); setFeedbackModalOpen(false); setStudentEditModalOpen(false)
    setCourseForm(emptyCourseForm()); setTemplateForm(emptyTemplateForm()); setBannerForm(emptyBannerForm()); setPaymentForm(emptyPaymentForm()); setRuleForm(emptyRuleForm()); setMessageForm(emptyMessageForm()); setConfigForm(emptyConfigForm()); setPointsForm(emptyPointsForm()); setFeedbackForm(emptyFeedbackForm()); setStudentProfileForm(emptyStudentProfileForm())
    setSelectedDetail(null); setEnrollmentSummaryDetail(null); setPointLedgerDetail(null); setReviewState(null); setReviewRemark(''); setSelectedRows([]); setTableKeyword(''); setQueryKeyword(''); setStatusFilter(''); setAuditActionFilter(''); setAuditActorFilter(''); setAuditFrom(''); setAuditTo(''); setPage(1); setReviewSubmitting(false); setCourseSubmitting(false); setOperationKey('')
  }
  const restoreTabState = (snapshot?: TabSnapshot) => {
    if (!snapshot) { resetTabState(); return }
    loadVersion.current += 1
    setData(snapshot.data ?? null); setListLoading(false); setListError(''); setCourseModalOpen(Boolean(snapshot.courseModalOpen)); setTemplateModalOpen(Boolean(snapshot.templateModalOpen)); setBannerModalOpen(Boolean(snapshot.bannerModalOpen)); setPaymentModalOpen(Boolean(snapshot.paymentModalOpen)); setRuleModalOpen(Boolean(snapshot.ruleModalOpen)); setMessageModalOpen(Boolean(snapshot.messageModalOpen)); setConfigModalOpen(Boolean(snapshot.configModalOpen)); setPointsModalOpen(Boolean(snapshot.pointsModalOpen)); setFeedbackModalOpen(Boolean(snapshot.feedbackModalOpen)); setStudentEditModalOpen(Boolean(snapshot.studentEditModalOpen))
    setCourseForm(snapshot.courseForm || emptyCourseForm()); setTemplateForm(snapshot.templateForm || emptyTemplateForm()); setBannerForm(snapshot.bannerForm || emptyBannerForm()); setPaymentForm(snapshot.paymentForm || emptyPaymentForm()); setRuleForm(snapshot.ruleForm || emptyRuleForm()); setMessageForm(snapshot.messageForm || emptyMessageForm()); setConfigForm(snapshot.configForm || emptyConfigForm()); setPointsForm(snapshot.pointsForm || emptyPointsForm()); setFeedbackForm(snapshot.feedbackForm || emptyFeedbackForm()); setStudentProfileForm(snapshot.studentProfileForm || emptyStudentProfileForm())
    setSelectedDetail(snapshot.selectedDetail ?? null); setEnrollmentSummaryDetail(snapshot.enrollmentSummaryDetail ?? null); setPointLedgerDetail(snapshot.pointLedgerDetail ?? null); setReviewState(snapshot.reviewState ?? null); setReviewRemark(snapshot.reviewRemark || ''); setSelectedRows(Array.isArray(snapshot.selectedRows) ? snapshot.selectedRows : []); setTableKeyword(snapshot.tableKeyword || ''); setQueryKeyword(snapshot.queryKeyword || ''); setStatusFilter(snapshot.statusFilter || ''); setAuditActionFilter(snapshot.auditActionFilter || ''); setAuditActorFilter(snapshot.auditActorFilter || ''); setAuditFrom(snapshot.auditFrom || ''); setAuditTo(snapshot.auditTo || ''); setPage(Number(snapshot.page) || 1); setReviewSubmitting(false); setCourseSubmitting(false); setOperationKey('')
  }
  const navigate = (moduleKey: string) => {
    if (moduleKey !== active) rememberActiveTab()
    setVisitedTabs(currentTabs => currentTabs.includes(moduleKey) ? currentTabs : [...currentTabs, moduleKey])
    setActive(moduleKey)
    setSidebarOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const logout = () => {
    authStorage.clear()
    tabCacheRef.current = {}
    scrollPositionsRef.current = {}
    setVisitedTabs(['dashboard'])
    try { window.sessionStorage.removeItem(VISITED_TABS_STORAGE_KEY) } catch { /* ignore */ }
    setLoggedIn(false)
  }
  const closeVisitedTab = (moduleKey: string) => {
    if (moduleKey === 'dashboard') return
    const index = visitedTabs.indexOf(moduleKey)
    if (index < 0) return
    const nextTabs = visitedTabs.filter(item => item !== moduleKey)
    delete tabCacheRef.current[moduleKey]
    delete scrollPositionsRef.current[moduleKey]
    setVisitedTabs(nextTabs.includes('dashboard') ? nextTabs : ['dashboard', ...nextTabs])
    if (active === moduleKey) setActive(nextTabs[index - 1] || nextTabs[index] || 'dashboard')
  }
  const runOperation = async (key: string, action: () => Promise<any>, success: string | ((result: any) => string)) => {
    if (operationKeyRef.current) {
      flash('另一个操作正在处理中，请稍候')
      return false
    }
    operationKeyRef.current = key
    setOperationKey(key)
    try {
      const result = await action()
      flash(typeof success === 'function' ? success(result) : success)
      try {
        await load(1, queryKeyword, statusFilter)
      } catch {
        // The write already succeeded; keep that result distinct from a
        // subsequent list-refresh failure and let the list error state offer
        // an explicit retry instead of reporting a false write failure.
        flash('操作已完成，但列表刷新失败，请点击“重新加载”')
      }
      return true
    } catch (error) {
      flash(error instanceof Error ? error.message : '操作失败，请稍后重试')
      return false
    } finally {
      if (operationKeyRef.current === key) {
        operationKeyRef.current = ''
        setOperationKey('')
      }
    }
  }
  const load = async (targetPage = page, keyword = queryKeyword, status = statusFilter) => {
    const version = ++loadVersion.current
    const commit = (value: any) => { if (version === loadVersion.current) setData(value) }
    if (version === loadVersion.current) { setListLoading(true); setListError('') }
    try {
      if (active === 'dashboard') { commit(await apiFetch('/admin/dashboard')); return }
      if (current.endpoint) {
        const serverFilterParam = active === 'enrollment-details' ? 'courseId' : active === 'courses' || active === 'orders' || active === 'invoices' || active === 'feedbacks' || active === 'students' ? 'status' : active === 'users' ? 'role' : ''
        const filterQuery = serverFilterParam && status ? `&${serverFilterParam}=${encodeURIComponent(status)}` : ''
        const params = serverPagedModules.has(active)
          ? `?keyword=${encodeURIComponent(keyword)}${filterQuery}&page=${targetPage}&pageSize=${PAGE_SIZE}`
          : active === 'audits' ? `?keyword=${encodeURIComponent(keyword)}${auditActionFilter ? `&action=${encodeURIComponent(auditActionFilter)}` : ''}${auditActorFilter ? `&actor=${encodeURIComponent(auditActorFilter)}` : ''}${auditFrom ? `&from=${encodeURIComponent(auditFrom)}` : ''}${auditTo ? `&to=${encodeURIComponent(auditTo)}` : ''}` : ''
        if (active === 'courses') {
          const [courseData, templateData] = await Promise.all([
            apiFetch(current.endpoint + params),
            apiFetch<{ items?: TableItem[] }>('/admin/templates'),
          ])
          commit(courseData)
          if (version === loadVersion.current) setTemplateOptions(Array.isArray(templateData?.items) ? templateData.items.map(item => ({ id: String(item.id), name: String(item.name || item.id), locked: item.locked === true })) : [])
        } else if (active === 'banners' || active === 'templates' || active === 'rules' || active === 'enrollment-details') {
          const [moduleData, courseData] = await Promise.all([
            apiFetch(`${current.endpoint}${params}`),
            apiFetch<{ items?: CourseOption[] }>('/admin/courses?page=1&pageSize=100'),
          ])
          commit(moduleData)
          if (version === loadVersion.current) setCourseOptions(Array.isArray(courseData?.items) ? courseData.items.map(item => ({ id: String(item.id), title: String(item.title) })) : [])
        } else {
          commit(await apiFetch(`${current.endpoint}${params}`))
        }
      }
    } catch (error) {
      if (version === loadVersion.current) {
        // Preserve the last successful response during a refresh failure. The
        // user can still inspect the list and retry instead of mistaking a
        // transient network/database error for an empty module.
        setListError(error instanceof Error ? error.message : '列表加载失败，请稍后重试')
      }
      throw error
    } finally {
      if (version === loadVersion.current) setListLoading(false)
    }
  }
  const requestLoad = (targetPage = page, keyword = queryKeyword, status = statusFilter) => {
    void load(targetPage, keyword, status).catch(() => undefined)
  }

  useEffect(() => {
    restoreTabState(tabCacheRef.current[active])
  }, [active])
  useEffect(() => {
    try { window.sessionStorage.setItem(VISITED_TABS_STORAGE_KEY, JSON.stringify(visitedTabs)) } catch { /* 浏览器禁用存储时仍保留当前会话标签 */ }
  }, [visitedTabs])
  useEffect(() => { if (loggedIn) load().catch((error) => flash(error instanceof Error ? error.message : '加载失败，请重新登录')) }, [active, loggedIn, page, queryKeyword, statusFilter, auditActionFilter, auditActorFilter, auditFrom, auditTo])
  useEffect(() => {
    if (!loggedIn || courseCategoryOptions.length) return
    apiFetch<{ items?: Array<{ code: string; label: string }> }>('/admin/course-categories')
      .then(result => {
        const items = Array.isArray(result?.items) ? result.items.map(item => ({ value: String(item.code), label: String(item.label) })).filter(item => item.value && item.label) : []
        if (items.length) setCourseCategoryOptions(items)
      })
      .catch(() => undefined)
  }, [loggedIn, courseCategoryOptions.length])
  useEffect(() => {
    tableScrollRef.current = document.querySelector('.page-main .table-section .table-scroll') as HTMLDivElement | null
    const position = scrollPositionsRef.current[active]
    if (!position) return
    const frame = window.requestAnimationFrame(() => tableScrollRef.current?.scrollTo({ top: position.top, left: position.left }))
    return () => window.cancelAnimationFrame(frame)
  }, [active, data])
  useEffect(() => { if (activeNavGroup) setOpenNavGroup(activeNavGroup.key) }, [activeNavGroup])

  const openCourseEditor = (item?: TableItem) => {
    const categoryCode = (value: unknown) => {
      const raw = String(value || '').trim()
      const options = courseCategoryOptions.length ? courseCategoryOptions : courseCategoryFallback
      const matched = options.find(option => option.value === raw || option.label === raw)
      return matched?.value || raw
    }
    const nextForm = item ? {
      id: item.id,
      title: String(item.title || ''), subtitle: String(item.subtitle || ''), category: categoryCode(item.categoryCode || item.category || ''),
      date: String(item.date || ''), ...(() => { const schedule = parseCourseSchedule(item.date); return { courseStartAt: schedule.start, courseEndAt: schedule.end } })(), location: String(item.location || ''), instructor: String(item.instructor || ''),
      price: String(item.price ?? ''), originalPrice: String(item.originalPrice ?? item.price ?? ''), specialPrice: String(item.specialPrice ?? ''),
      capacity: String(item.capacity ?? 30), enrolled: String(item.enrolled ?? 0), status: String(item.status || '报名中'),
      registrationDeadline: dateToLocalInput(item.registrationDeadline), registrationTemplateId: String(item.registrationTemplateId || templateOptions[0]?.id || ''), allowMultiParticipant: item.allowMultiParticipant !== false,
      description: String(item.description || ''), descriptionRichText: String(item.descriptionRichText || plainTextToRichText(String(item.description || ''))), image: String(item.image || ''),
    } : (() => {
      const draft = readCourseDraft()
      const base = { ...emptyCourseForm(), ...draft }
      const schedule = parseCourseSchedule(base.date)
      return {
        ...base,
        category: categoryCode(base.category || ''),
        courseStartAt: base.courseStartAt || schedule.start,
        courseEndAt: base.courseEndAt || schedule.end,
        registrationTemplateId: base.registrationTemplateId || templateOptions[0]?.id || '',
      }
    })()
    courseInitialFormRef.current = { ...nextForm }
    setCourseForm(nextForm)
    setCourseModalOpen(true)
  }

  const updateCourseField = <K extends keyof CourseForm>(key: K, value: CourseForm[K]) => setCourseForm(currentForm => ({ ...currentForm, [key]: value }))
  const saveCourseDraft = () => {
    if (courseForm.id) return flash('编辑中的课程无需保存草稿；请直接保存课程或取消关闭')
    try {
      window.localStorage.setItem(COURSE_DRAFT_STORAGE_KEY, JSON.stringify(courseForm))
      flash('课程草稿已保存，关闭后重新打开仍可恢复')
    } catch { flash('当前浏览器无法保存课程草稿') }
  }
  const resetCourse = async () => {
    const hasContent = Object.entries(courseForm).some(([key, value]) => key !== 'category' && key !== 'status' && key !== 'capacity' && key !== 'enrolled' && Boolean(String(value || '').trim()))
    if (hasContent && !await confirmAction('确定清空当前课程表单吗？已填写但未保存的内容将被清除。', '重置课程表单', true)) return
    const nextForm = courseForm.id ? { ...courseInitialFormRef.current } : { ...emptyCourseForm(), registrationTemplateId: templateOptions[0]?.id || '' }
    setCourseForm(nextForm)
    if (!courseForm.id) removeCourseDraft()
    flash('课程表单已重置')
  }
  const uploadCourseImage = async (file: File) => {
    if (!file.type.startsWith('image/')) return flash('请选择图片文件')
    if (file.size > 5 * 1024 * 1024) return flash('课程图片不能超过 5MB')
    await runOperation('course-image-upload', async () => {
      const result = await apiUpload<{ url: string }>('/admin/uploads/course-image', file)
      updateCourseField('image', result.url)
      return result
    }, '课程图片已上传')
  }
  const uploadPaymentQr = async (channel: 'wechat' | 'alipay', file: File) => {
    if (!file.type.startsWith('image/')) return flash('请选择图片文件')
    if (file.size > 5 * 1024 * 1024) return flash('收款码图片不能超过 5MB')
    await runOperation(`payment-qr-upload:${channel}`, async () => {
      const result = await apiUpload<{ url: string }>(`/admin/uploads/payment-qr/${channel}`, file)
      setPaymentForm(current => ({ ...current, [channel === 'wechat' ? 'wechatQrImage' : 'alipayQrImage']: result.url }))
      return result
    }, `${channel === 'wechat' ? '微信' : '支付宝'}收款码已上传`)
  }

  const openTemplateEditor = (item?: TableItem) => {
    const fields = Array.isArray(item?.fields) ? item.fields : defaultTemplateFields
    setTemplateForm({ id: item?.id ? String(item.id) : undefined, name: String(item?.name || ''), fields: fields.map((field: any) => ({ key: String(field.key || ''), label: String(field.label || ''), type: field.type || 'text', required: field.required === true, options: Array.isArray(field.options) ? field.options.map(String) : [] })) })
    setTemplateLocked(item?.locked === true)
    setTemplateModalOpen(true)
  }
  const nextBannerSort = () => String(Math.max(0, ...(Array.isArray(data?.items) ? data.items.map((item: TableItem) => Number(item.sort) || 0) : [])) + 1)
  const openBannerEditor = (item?: TableItem) => { setBannerForm(item ? { id: String(item.id), title: String(item.title || ''), courseId: String(item.courseId || ''), sort: String(item.sort ?? 0), enabled: item.enabled !== false, startsAt: dateToLocalInput(item.startsAt), endsAt: dateToLocalInput(item.endsAt) } : { ...emptyBannerForm(nextBannerSort()), courseId: courseOptions[0]?.id || '' }); setBannerModalOpen(true) }
  const openPaymentEditor = (item?: TableItem) => { setPaymentForm({ ...emptyPaymentForm(), ...(item || {}) }); setPaymentModalOpen(true) }
  const openRuleEditor = (item?: TableItem) => { setRuleForm(item ? { id: String(item.id), minPeople: String(item.minPeople ?? 2), discountRate: String(item.discountRate ?? 0.9), courseIds: Array.isArray(item.courseIds) ? item.courseIds.join(', ') : '', enabled: item.enabled !== false } : emptyRuleForm()); setRuleModalOpen(true) }
  const openMessageEditor = (item?: TableItem) => { setMessageForm(item ? { id: String(item.id), title: String(item.title || ''), content: String(item.content || ''), channel: String(item.channel || '站内消息'), enabled: item.enabled !== false, targetUserIds: listFieldToText(item.targetUserIds), targetCourseIds: listFieldToText(item.targetCourseIds), startsAt: dateToLocalInput(item.startsAt), endsAt: dateToLocalInput(item.endsAt) } : emptyMessageForm()); setMessageModalOpen(true) }
  const openConfigEditor = (item?: TableItem) => { setConfigForm(item ? { key: String(item.key || ''), value: String(item.value || ''), description: String(item.description || '') } : emptyConfigForm()); setConfigModalOpen(true) }
  const openPointsEditor = (item?: TableItem) => { setPointsForm(item ? { userId: String(item.userId || ''), userName: String(item.userName || ''), points: '0', reason: '' } : emptyPointsForm()); setPointsModalOpen(true) }
  const openPointLedger = async (item: TableItem) => {
    try {
      const result = await apiFetch<{ user: TableItem; items: TableItem[]; page: number; pageSize: number; total: number }>(`/admin/points/${encodeURIComponent(String(item.userId))}/ledger?page=1&pageSize=20`)
      setPointLedgerDetail(result)
    } catch (error) { flash(error instanceof Error ? error.message : '积分流水加载失败') }
  }
  const openFeedbackEditor = (item: TableItem) => { setFeedbackForm({ id: String(item.id || ''), reply: String(item.reply || '') }); setFeedbackModalOpen(true) }
  const openStudentEditor = (item: TableItem) => {
    const phone = String(item.phone || '').trim()
    const email = String(item.email || '').trim()
    // List endpoints intentionally return masked sensitive fields. Never turn
    // a masked value into a shorter, invalid value and send it back on save.
    // The editor asks for a new complete value only when the operator wants
    // to change the sensitive field; leaving it blank preserves the current
    // value on the server.
    setStudentProfileForm({ id: String(item.id || ''), name: String(item.name || ''), phone: /^\d{3}\*+\d{2,4}$/.test(phone) ? '' : phone, email: email.includes('*') ? '' : email, company: String(item.company || ''), department: String(item.department || ''), position: String(item.position || '') })
    setStudentEditModalOpen(true)
  }
  const saveStudentProfile = async () => {
    const form = studentProfileForm
    if (!form.id || !form.name.trim()) return flash('学员姓名不能为空')
    if (form.phone.trim() && !/^1\d{10}$/.test(form.phone.trim())) return flash('请输入有效的 11 位手机号')
    if (!await confirmAction(`确认保存学员档案“${form.name.trim()}”吗？保存后会更新后续报名回填资料。`)) return
    const payload: Record<string, string> = { name: form.name.trim(), company: form.company.trim(), department: form.department.trim(), position: form.position.trim() }
    if (form.phone.trim()) payload.phone = form.phone.trim()
    if (form.email.trim()) payload.email = form.email.trim()
    const saved = await operateStudentDetail(form.id, () => apiFetch(`/admin/student-profiles/${encodeURIComponent(form.id)}`, { method: 'PATCH', body: JSON.stringify(payload) }), '学员档案已更新')
    if (!saved) return
    setStudentEditModalOpen(false)
    setStudentProfileForm(emptyStudentProfileForm())
  }
  const updateTemplateField = (index: number, patch: Partial<TemplateField>) => setTemplateForm(current => ({ ...current, fields: current.fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field) }))
  const removeTemplateField = async (index: number) => {
    const field = templateForm.fields[index]
    if (!field) return
    if (!await confirmAction(`确定删除字段“${field.label || field.key}”吗？删除后需要保存模板才会生效。`, '删除模板字段', true)) return
    setTemplateForm(current => ({ ...current, fields: current.fields.filter((_, fieldIndex) => fieldIndex !== index) }))
  }
  const saveTemplate = async () => {
    const fields = templateForm.fields.map(field => ({ ...field, key: field.key.trim(), label: field.label.trim(), options: ['select', 'radio', 'checkbox'].includes(field.type) ? (field.options || []).map(option => option.trim()).filter(Boolean) : undefined }))
    if (!templateForm.name.trim() || !fields.length || fields.some(field => !field.key || !field.label)) return flash('请完整填写报名模板名称和字段')
    if (new Set(fields.map(field => field.key)).size !== fields.length) return flash('字段标识不能重复')
    if (fields.some(field => ['select', 'radio', 'checkbox'].includes(field.type) && !field.options?.length)) return flash('选择类字段至少需要一个选项')
    if (!await confirmAction(`${templateForm.id ? '确认保存对报名模板的修改' : '确认创建报名模板'}“${templateForm.name.trim()}”吗？`)) return
    const saved = await runOperation(`template-save:${templateForm.id || 'new'}`, () => apiFetch(templateForm.id ? `/admin/templates/${templateForm.id}` : '/admin/templates', { method: templateForm.id ? 'PATCH' : 'POST', body: JSON.stringify({ name: templateForm.name.trim(), fields }) }), '报名模板已保存')
    if (saved) { setTemplateModalOpen(false); setTemplateForm(emptyTemplateForm()) }
  }
  const copyTemplate = async () => {
    const name = await promptAction('请输入副本模板名称：', `${templateForm.name.trim() || '报名模板'}（副本）`, '复制报名模板')
    if (name === null || !name.trim()) return
    if (!await confirmAction(`确认创建报名模板副本“${name.trim()}”吗？`)) return
    const copied = await runOperation('template-copy', () => apiFetch('/admin/templates', { method: 'POST', body: JSON.stringify({ name: name.trim(), fields: templateForm.fields }) }), '报名模板副本已创建')
    if (copied) { setTemplateModalOpen(false); setTemplateForm(emptyTemplateForm()) }
  }
  const deleteTemplate = async () => {
    if (!templateForm.id) return
    if (!await confirmAction(`确定删除报名模板“${templateForm.name || templateForm.id}”吗？正在使用或已有报名历史的模板不可删除。`, '删除报名模板', true)) return
    const deleted = await runOperation(`template-delete:${templateForm.id}`, () => apiFetch(`/admin/templates/${encodeURIComponent(templateForm.id!)}`, { method: 'DELETE' }), '报名模板已删除')
    if (deleted) { setTemplateModalOpen(false); setTemplateForm(emptyTemplateForm()) }
  }
  const saveBanner = async () => {
    if (!bannerForm.title.trim() || !bannerForm.courseId.trim()) return flash('请填写 Banner 标题并选择关联课程')
    if (!await confirmAction(`${bannerForm.id ? '确认保存对 Banner 的修改' : '确认创建 Banner'}“${bannerForm.title.trim()}”吗？`)) return
    const saved = await runOperation(`banner-save:${bannerForm.id || 'new'}`, () => apiFetch('/admin/banners', { method: 'POST', body: JSON.stringify({ ...bannerForm, title: bannerForm.title.trim(), courseId: bannerForm.courseId.trim(), sort: bannerForm.id ? Number(bannerForm.sort || 0) : Number(nextBannerSort()) }) }), 'Banner 已保存')
    if (saved) { setBannerModalOpen(false); setBannerForm(emptyBannerForm()) }
  }
  const savePayment = async () => {
    if (!paymentForm.accountName.trim() || !paymentForm.bankName.trim() || !paymentForm.accountNo.trim()) return flash('请填写完整收款信息')
    if (!await confirmAction('确认保存收款设置吗？保存后会影响 C 端线下支付提示信息。')) return
    const saved = await runOperation('payment-settings-save', () => apiFetch('/admin/payment-settings', { method: 'PATCH', body: JSON.stringify(paymentForm) }), '支付设置已保存')
    if (saved) setPaymentModalOpen(false)
  }
  const saveRule = async () => {
    const minPeople = Number(ruleForm.minPeople)
    const discountRate = Number(ruleForm.discountRate)
    if (!Number.isInteger(minPeople) || minPeople < 1 || !Number.isFinite(discountRate) || discountRate < 0 || discountRate > 1) return flash('请填写有效的人数门槛和 0~1 折扣比例')
    if (!await confirmAction(`确认保存优惠规则（${minPeople} 人，${discountRate} 折）吗？`)) return
    const saved = await runOperation(`rule-save:${ruleForm.id || 'new'}`, () => apiFetch('/admin/discount-rules', { method: 'POST', body: JSON.stringify({ id: ruleForm.id, minPeople, discountRate, courseIds: ruleForm.courseIds.split(',').map(item => item.trim()).filter(Boolean), enabled: ruleForm.enabled }) }), result => Array.isArray(result?.conflicts) && result.conflicts.length ? `优惠规则已保存，存在同门槛冲突：${result.conflicts.join('、')}` : '优惠规则已保存')
    if (saved) setRuleModalOpen(false)
  }
  const deleteRule = async () => { const ruleId = ruleForm.id; if (!ruleId) return; if (!await confirmAction(`确定删除优惠规则“${ruleId}”吗？删除后新订单不再使用该规则，历史订单金额不会改变。`, '删除优惠规则', true)) return; const deleted = await runOperation(`rule-delete:${ruleId}`, () => apiFetch(`/admin/discount-rules/${encodeURIComponent(ruleId)}`, { method: 'DELETE' }), '优惠规则已删除'); if (deleted) { setRuleModalOpen(false); setRuleForm(emptyRuleForm()) } }
  const deleteBanner = async () => { if (!bannerForm.id) return; if (!await confirmAction(`确定删除 Banner“${bannerForm.title || bannerForm.id}”吗？删除后 C 端将不再展示该 Banner。`, '删除 Banner', true)) return; const deleted = await runOperation(`banner-delete:${bannerForm.id}`, () => apiFetch(`/admin/banners/${encodeURIComponent(bannerForm.id!)}`, { method: 'DELETE' }), 'Banner 已删除'); if (deleted) { setBannerModalOpen(false); setBannerForm(emptyBannerForm()) } }

  const saveMessage = async () => {
    if (!messageForm.title.trim() || !messageForm.content.trim()) return flash('请填写消息标题和内容')
    if (!await confirmAction(`${messageForm.id ? '确认保存对消息的修改' : '确认发布消息'}“${messageForm.title.trim()}”吗？`)) return
    const saved = await runOperation(`message-save:${messageForm.id || 'new'}`, () => apiFetch(messageForm.id ? `/admin/messages/${messageForm.id}` : '/admin/messages', { method: messageForm.id ? 'PATCH' : 'POST', body: JSON.stringify({ ...messageForm, title: messageForm.title.trim(), content: messageForm.content.trim(), targetUserIds: textToListField(messageForm.targetUserIds), targetCourseIds: textToListField(messageForm.targetCourseIds), startsAt: messageForm.startsAt.trim(), endsAt: messageForm.endsAt.trim() }) }), '消息已保存')
    if (saved) { setMessageModalOpen(false); setMessageForm(emptyMessageForm()) }
  }
  const deleteMessage = async () => { if (!messageForm.id) return; if (!await confirmAction(`确定删除消息“${messageForm.title || messageForm.id}”吗？删除后用户将无法查看该消息，阅读记录也会一并清理。`, '删除消息', true)) return; const deleted = await runOperation(`message-delete:${messageForm.id}`, () => apiFetch(`/admin/messages/${encodeURIComponent(messageForm.id!)}`, { method: 'DELETE' }), '消息已删除'); if (deleted) { setMessageModalOpen(false); setMessageForm(emptyMessageForm()) } }
  const saveConfig = async () => {
    if (!configForm.key.trim() || !configForm.value.trim()) return flash('请填写配置键和值')
    if (!await confirmAction(`确认保存系统配置“${configForm.key.trim()}”吗？`)) return
    const saved = await runOperation(`config-save:${configForm.key.trim()}`, () => apiFetch(`/admin/configs/${encodeURIComponent(configForm.key.trim())}`, { method: 'PUT', body: JSON.stringify({ value: configForm.value.trim(), description: configForm.description.trim() }) }), '系统配置已保存')
    if (saved) { setConfigModalOpen(false); setConfigForm(emptyConfigForm()) }
  }
  const savePoints = async () => {
    const points = Number(pointsForm.points)
    if (!pointsForm.userId || !Number.isInteger(points) || points === 0 || !pointsForm.reason.trim()) return flash('请输入非零整数积分和调整原因')
    if (!await confirmAction(`确认给 ${pointsForm.userName || pointsForm.userId} 调整 ${points > 0 ? '+' : ''}${points} 积分吗？`)) return
    const saved = await runOperation(`points-adjust:${pointsForm.userId}`, () => apiFetch(`/admin/points/${encodeURIComponent(pointsForm.userId)}/adjust`, { method: 'POST', body: JSON.stringify({ points, reason: pointsForm.reason.trim() }) }), '积分已调整')
    if (saved) { setPointsModalOpen(false); setPointsForm(emptyPointsForm()) }
  }
  const saveFeedback = async () => {
    if (!feedbackForm.id || !feedbackForm.reply.trim()) return flash('请填写回复内容')
    if (!await confirmAction('确认提交这条反馈的处理回复吗？提交后将不能再次处理。')) return
    const saved = await runOperation(`feedback-resolve:${feedbackForm.id}`, () => apiFetch(`/admin/feedbacks/${encodeURIComponent(feedbackForm.id)}/resolve`, { method: 'POST', body: JSON.stringify({ reply: feedbackForm.reply.trim() }) }), '反馈已处理')
    if (saved) { setFeedbackModalOpen(false); setFeedbackForm(emptyFeedbackForm()) }
  }

  const closeReview = () => {
    if (reviewState?.imageUrl) URL.revokeObjectURL(reviewState.imageUrl)
    setReviewState(null)
    setReviewRemark('')
  }

  const openOrderReview = async (item: TableItem) => {
    try {
      const proof = await apiFetch<TableItem | null>(`/admin/orders/${encodeURIComponent(item.id)}/payment-proof`)
      if (!proof) return flash('该订单暂无可审核的支付凭证')
      let imageUrl = ''
      if (String(proof.mimeType || '').startsWith('image/')) {
        imageUrl = URL.createObjectURL(await apiFetchBlob(`/admin/orders/${encodeURIComponent(item.id)}/payment-proof/file`))
      }
      setReviewRemark(String(proof.remark || ''))
      setReviewState({ order: item, proof, imageUrl })
    } catch (error) { flash(error instanceof Error ? error.message : '加载支付凭证失败') }
  }

  const submitOrderReview = async (approved: boolean) => {
    if (!reviewState || reviewSubmitting) return
    const remark = reviewRemark.trim()
    if (!approved && !remark) return flash('驳回凭证时请填写原因')
    if (!await confirmAction(approved ? `确认通过订单 ${reviewState.order.id} 的线下支付凭证吗？` : `确认驳回订单 ${reviewState.order.id} 的线下支付凭证吗？`)) return
    setReviewSubmitting(true)
    try {
      const orderId = reviewState.order.id
      const submitted = await runOperation(
        `order-review:${orderId}`,
        () => apiFetch(`/admin/orders/${encodeURIComponent(orderId)}/review`, { method: 'POST', body: JSON.stringify({ approved, remark: remark || '审核通过' }) }),
        approved ? '支付凭证已审核通过' : '支付凭证已驳回',
      )
      if (submitted) closeReview()
    } finally { setReviewSubmitting(false) }
  }

  const saveCourse = async () => {
    if (courseSubmitting || operationKey) return
    const form = courseForm
    const numericFields = { price: Number(form.price), originalPrice: Number(form.originalPrice), specialPrice: form.specialPrice === '' ? null : Number(form.specialPrice), capacity: Number(form.capacity), enrolled: Number(form.enrolled) }
    const scheduleDate = formatCourseSchedule(form.courseStartAt, form.courseEndAt)
    if (!form.title.trim() || !form.category.trim() || !form.courseStartAt.trim() || !form.courseEndAt.trim() || !form.location.trim() || !form.instructor.trim()) return flash('请完整填写课程标题、开始/结束时间、地点和讲师')
    if (new Date(form.courseStartAt).getTime() >= new Date(form.courseEndAt).getTime()) return flash('课程结束时间必须晚于开始时间')
    if (!form.registrationTemplateId.trim()) return flash('请先选择报名模板；没有模板时请先到“报名模板”创建')
    if ([numericFields.price, numericFields.originalPrice, numericFields.capacity, numericFields.enrolled].some(value => !Number.isFinite(value)) || (numericFields.specialPrice !== null && !Number.isFinite(numericFields.specialPrice))) return flash('请填写有效的价格、名额和报名人数')
    if (numericFields.capacity < numericFields.enrolled) return flash('课程名额不能少于已报名人数')
    if (!await confirmAction(`${form.id ? '确认保存对课程的修改' : '确认创建课程'}“${form.title.trim()}”吗？`)) return
    setCourseSubmitting(true)
    try {
      const descriptionRichText = form.descriptionRichText.trim() || plainTextToRichText(form.description)
      const payload = { ...form, title: form.title.trim(), subtitle: form.subtitle.trim(), category: form.category.trim(), date: scheduleDate, location: form.location.trim(), instructor: form.instructor.trim(), registrationDeadline: form.registrationDeadline.trim() || null, description: richTextToPlainText(descriptionRichText), descriptionRichText, ...numericFields }
      const saved = await runOperation(
        `course-save:${form.id || 'new'}`,
        () => apiFetch(form.id ? `/admin/courses/${form.id}` : '/admin/courses', { method: form.id ? 'PATCH' : 'POST', body: JSON.stringify(payload) }),
        form.id ? '课程已更新' : '课程已创建',
      )
      if (saved) { removeCourseDraft(); setCourseModalOpen(false); setCourseForm(emptyCourseForm()) }
    } finally { setCourseSubmitting(false) }
  }

  const deleteCourse = async () => {
    if (!courseForm.id || operationKey) return
    if (!await confirmAction(`确定删除课程“${courseForm.title || courseForm.id}”吗？已有报名或订单的课程不建议删除。`, '删除课程', true)) return
    const deleted = await runOperation(`course-delete:${courseForm.id}`, () => apiFetch(`/admin/courses/${encodeURIComponent(courseForm.id!)}`, { method: 'DELETE' }), '课程已删除')
    if (deleted) { setCourseModalOpen(false); setCourseForm(emptyCourseForm()) }
  }

  const uploadInvoiceFile = async (item: TableItem) => {
    if (item.status !== '已开票' || item.invoiceFileStatus === '已上传') return flash('当前开票记录不需要上传文件')
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/pdf,image/png,image/jpeg'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      // runOperation already reloads the active list after a successful write;
      // avoid a second uncoordinated request that could race the first one.
      void runOperation(`invoice-file:${item.id}`, () => apiUpload(`/admin/invoices/${encodeURIComponent(String(item.id))}/file`, file), '电子发票文件已上传')
    }
    input.click()
  }

  const openInvoiceFile = async (item: TableItem) => {
    if (item.status !== '已开票' || item.invoiceFileStatus !== '已上传') return flash('当前开票记录暂无可查看的电子发票')
    try {
      const blob = await apiFetchBlob(`/admin/invoices/${encodeURIComponent(String(item.id))}/file`)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.target = '_blank'
      anchor.rel = 'noopener'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) { flash(error instanceof Error ? error.message : '电子发票读取失败') }
  }

  const operate = async (item: TableItem) => {
    if (active === 'orders') {
      if (item.status === '待审核') return openOrderReview(item)
      if (item.status === '已支付') {
        if (!await confirmAction(`确定要退款订单 ${item.id} 吗？该操作会回退课程名额并取消关联报名履历。`, '确认退款订单', true)) return
        await runOperation(`refund:${item.id}`, () => apiFetch(`/admin/orders/${encodeURIComponent(item.id)}/refund`, { method: 'POST' }), '订单已退款，课程名额已回退')
        return
      }
      if (item.status === '待支付') {
        if (!await confirmAction(`确定关闭待支付订单 ${item.id} 吗？该操作会释放课程名额，且不可恢复。`, '关闭待支付订单', true)) return
        await runOperation(`close-order:${item.id}`, () => apiFetch(`/admin/orders/${encodeURIComponent(item.id)}/close`, { method: 'POST' }), '待支付订单已关闭，课程名额已回退')
        return
      }
      else return flash('只有待审核订单可以审核支付凭证')
    } else if (active === 'invoices') {
      if (item.status === '已开票' && item.invoiceFileStatus === '待上传') return uploadInvoiceFile(item)
      if (item.status === '已开票' && item.invoiceFileStatus === '已上传') return openInvoiceFile(item)
      if (item.status !== '待处理') return flash('只有待处理的开票申请或待上传发票文件可以操作')
      const invoiceNo = await promptAction('请输入已开具的发票号码；若暂不具备发票号码，请取消并使用“驳回”：', '', '填写发票号码')
      if (invoiceNo === null) return
      if (!invoiceNo.trim()) return flash('开票通过必须填写发票号码')
      if (!await confirmAction(`确认通过开票申请 ${item.id} 吗？发票号码：${invoiceNo.trim()}`)) return
      await runOperation(`invoice:${item.id}`, () => apiFetch(`/admin/invoices/${encodeURIComponent(item.id)}/process`, { method: 'POST', body: JSON.stringify({ approved: true, invoiceNo: invoiceNo.trim() }) }), '开票申请已通过')
      return
    } else if (active === 'users') {
      if (!await confirmAction(`确定重置用户 ${item.username || item.id} 的密码吗？重置后旧登录令牌会失效。`, '重置用户密码', true)) return
      await runOperation(`reset-password:${item.id}`, () => apiFetch<{ username?: string; resetPassword?: string }>(`/admin/users/${encodeURIComponent(item.id)}/reset-password`, { method: 'POST' }), result => `用户 ${result.username || item.username || item.id} 密码已重置为 ${result.resetPassword || '临时密码'}`)
      return
    }
    else if (active === 'banners') return openBannerEditor(item)
    else if (active === 'courses') return openCourseEditor(item)
    else if (active === 'enrollments') return openEnrollmentSummaryDetail(item)
    else if (active === 'templates') return openTemplateEditor(item)
    else if (active === 'rules') return openRuleEditor(item)
    else if (active === 'payment') return openPaymentEditor(item)
    else if (active === 'enrollment-details' || active === 'students') return openDetail(item, 'view')
    else if (active === 'feedbacks') return openFeedbackEditor(item)
    else if (active === 'messages') return openMessageEditor(item)
    else if (active === 'configs') return openConfigEditor(item)
    else if (active === 'points') return openPointsEditor(item)
    else return flash('已打开详情视图')
    flash('操作成功'); load()
  }

  const secondaryOperate = async (item: TableItem) => {
    if (active === 'users') {
      const nextEnabled = !item.enabled
      if (!await confirmAction(`确定要${nextEnabled ? '启用' : '禁用'}用户 ${item.username || item.id} 吗？${nextEnabled ? '' : '禁用后该用户将不能继续登录。'}`, nextEnabled ? '启用用户' : '禁用用户', !nextEnabled)) return
      await runOperation(`user-enabled:${item.id}`, () => apiFetch(`/admin/users/${encodeURIComponent(item.id)}/enabled`, { method: 'POST', body: JSON.stringify({ enabled: nextEnabled }) }), nextEnabled ? '用户已启用' : '用户已禁用')
      return
    } else if (active === 'banners') {
      if (!await confirmAction(`确定要${item.enabled === false ? '启用' : '停用'} Banner“${item.title || item.id}”吗？`, item.enabled === false ? '启用 Banner' : '停用 Banner', item.enabled !== false)) return
      await runOperation(`banner-enabled:${item.id}`, () => apiFetch('/admin/banners', { method: 'POST', body: JSON.stringify({ ...item, enabled: !item.enabled }) }), item.enabled === false ? 'Banner 已启用' : 'Banner 已停用')
      return
    } else if (active === 'invoices') {
      if (item.status === '已开票' && item.invoiceFileStatus === '已上传') return openInvoiceFile(item)
      if (item.status !== '待处理') return flash('只有待处理的开票申请可以驳回')
      const rejectReason = await promptAction(`请输入驳回开票申请 ${item.id} 的理由：`, String(item.rejectReason || ''), '填写驳回理由')
      if (rejectReason === null || !rejectReason.trim()) return flash('驳回开票申请必须填写理由')
      if (!await confirmAction(`确定驳回开票申请 ${item.id} 吗？用户将看到该驳回理由。`, '驳回开票申请', true)) return
      await runOperation(`invoice-reject:${item.id}`, () => apiFetch(`/admin/invoices/${encodeURIComponent(item.id)}/process`, { method: 'POST', body: JSON.stringify({ approved: false, invoiceNo: '', rejectReason: rejectReason.trim() }) }), '开票申请已驳回')
      return
    } else if (active === 'rules') {
      const enabled = item.enabled === false
      if (!await confirmAction(`确定要${enabled ? '启用' : '停用'}优惠规则 ${item.id} 吗？`, enabled ? '启用优惠规则' : '停用优惠规则', !enabled)) return
      await runOperation(`rule-enabled:${item.id}`, () => apiFetch('/admin/discount-rules', { method: 'POST', body: JSON.stringify({ id: item.id, minPeople: Number(item.minPeople), discountRate: Number(item.discountRate), courseIds: Array.isArray(item.courseIds) ? item.courseIds : [], enabled }) }), enabled ? '优惠规则已启用' : '优惠规则已停用')
      return
    } else if (active === 'messages') {
      const enabled = item.enabled === false
      if (!await confirmAction(`确定要${enabled ? '启用' : '停用'}消息“${item.title || item.id}”吗？`, enabled ? '启用消息' : '停用消息', !enabled)) return
      await runOperation(`message-enabled:${item.id}`, () => apiFetch(`/admin/messages/${encodeURIComponent(String(item.id))}/enabled`, { method: 'POST', body: JSON.stringify({ enabled }) }), enabled ? '消息已启用' : '消息已停用')
      return
    } else if (active === 'points') {
      await openPointLedger(item)
      return
    }
    else return
  }

  const openDetail = async (item: TableItem, intent: 'view' | 'process' = 'view') => {
    if (active === 'students') {
      try {
        const [profile, enrollmentResult] = await Promise.all([
          apiFetch<TableItem>(`/admin/student-profiles/${encodeURIComponent(item.id)}`),
          apiFetch<{ items?: TableItem[] }>(`/admin/student-profiles/${encodeURIComponent(item.id)}/enrollments`),
        ])
        setSelectedDetail({ module: active, item: { ...profile, enrollments: enrollmentResult.items || [] }, intent })
      } catch (error) { flash(error instanceof Error ? error.message : '学员档案加载失败') }
      return
    }
    if (active === 'enrollment-details') {
      try {
        const record = await apiFetch<TableItem>(`/admin/enrollment-records/${encodeURIComponent(String(item.id))}`)
        const [proof, relatedOrderResult] = await Promise.all([
          apiFetch<TableItem | null>(`/admin/orders/${encodeURIComponent(String(record.orderId))}/payment-proof`).catch(() => null),
          apiFetch<{ items?: TableItem[] }>(`/admin/orders?keyword=${encodeURIComponent(String(record.orderId))}&page=1&pageSize=1`).catch(() => ({ items: [] })),
        ])
        setSelectedDetail({ module: active, item: record, proof, relatedOrder: relatedOrderResult.items?.[0], intent })
      } catch (error) { flash(error instanceof Error ? error.message : '报名履历详情加载失败') }
      return
    }
    let proof: TableItem | null | undefined
    let relatedOrder: TableItem | undefined
    const orderId = active === 'orders' ? item.id : item.orderId
    if (orderId) {
      proof = await apiFetch<TableItem | null>(`/admin/orders/${orderId}/payment-proof`).catch(() => null)
      if (active === 'enrollment-details' || active === 'students') {
        const result = await apiFetch<{ items: TableItem[] }>(`/admin/orders?keyword=${encodeURIComponent(orderId)}&page=1&pageSize=1`).catch(() => ({ items: [] }))
        relatedOrder = result.items?.[0]
      }
    }
    setSelectedDetail({ module: active, item, proof, relatedOrder, intent })
  }

  const refreshStudentDetail = async (studentId: string) => {
    const [profile, enrollmentResult] = await Promise.all([
      apiFetch<TableItem>(`/admin/student-profiles/${encodeURIComponent(studentId)}`),
      apiFetch<{ items?: TableItem[] }>(`/admin/student-profiles/${encodeURIComponent(studentId)}/enrollments`),
    ])
    const completeProfile = { ...profile, enrollments: enrollmentResult.items || [] }
    setSelectedDetail(currentDetail => currentDetail?.module === 'students' ? { ...currentDetail, item: completeProfile } : currentDetail)
    return completeProfile
  }

  const reloadStudentDetail = async (studentId: string) => {
    try {
      await refreshStudentDetail(studentId)
      flash('学员详情已重新加载')
    } catch (error) {
      flash(error instanceof Error ? error.message : '学员详情加载失败，请重试')
    }
  }

  const operateStudentDetail = async (studentId: string, action: () => Promise<any>, success: string) => {
    const studentOperationKey = `student:${studentId}`
    if (operationKeyRef.current || operationKey) {
      flash('另一个操作正在处理中，请稍候')
      return false
    }
    operationKeyRef.current = studentOperationKey
    setOperationKey(studentOperationKey)
    try {
      await action()
      let detailRefreshFailed = false
      let listRefreshFailed = false
      try { await refreshStudentDetail(studentId) } catch { detailRefreshFailed = true }
      try { await load(1, queryKeyword, statusFilter) } catch { listRefreshFailed = true }
      if (detailRefreshFailed && listRefreshFailed) flash('操作已完成，但详情和列表刷新失败，请分别点击重试')
      else if (detailRefreshFailed) flash('操作已完成，但详情刷新失败，请点击“重新加载详情”')
      else if (listRefreshFailed) flash('操作已完成，但列表刷新失败，请点击“重新加载”')
      else flash(success)
      return true
    } catch (error) {
      flash(error instanceof Error ? error.message : '学员档案操作失败')
      return false
    } finally {
      if (operationKeyRef.current === studentOperationKey) {
        operationKeyRef.current = ''
        setOperationKey('')
      }
    }
  }

  const toggleStudentStatus = async (item: TableItem) => {
    const nextStatus = item.status === 'active' ? 'inactive' : 'active'
    if (!await confirmAction(`确定要${nextStatus === 'active' ? '启用' : '停用'}学员档案“${item.name || item.id}”吗？`, nextStatus === 'active' ? '启用学员档案' : '停用学员档案', nextStatus !== 'active')) return
    await operateStudentDetail(String(item.id), () => apiFetch(`/admin/student-profiles/${encodeURIComponent(item.id)}/status`, { method: 'POST', body: JSON.stringify({ status: nextStatus }) }), nextStatus === 'active' ? '学员档案已启用' : '学员档案已停用')
  }

  const setStudentDefaultRelation = async (studentId: string, userId: string) => {
    if (!await confirmAction('确定将该账号设置为此学员的默认报名账号吗？')) return
    await operateStudentDetail(studentId, () => apiFetch(`/admin/student-profiles/${encodeURIComponent(studentId)}/relationships/${encodeURIComponent(userId)}/default`, { method: 'POST' }), '默认报名账号已更新')
  }

  const revokeStudentRelation = async (studentId: string, userId: string, username: string) => {
    if (!await confirmAction(`确定解除账号 ${username || userId} 与该学员的关系吗？历史报名记录不会删除。`, '解除学员账号关系', true)) return
    await operateStudentDetail(studentId, () => apiFetch(`/admin/student-profiles/${encodeURIComponent(studentId)}/relationships/${encodeURIComponent(userId)}`, { method: 'DELETE' }), '学员账号关系已解除')
  }

  const grantStudentRelation = async (studentId: string) => {
    const selection = await requestStudentRelationSelection(studentId)
    if (!selection) return
    if (!await confirmAction(`确认授权账号 ${selection.username || selection.userId} 与该学员档案建立关系吗？`, '授权学员账号')) return
    await operateStudentDetail(studentId, () => apiFetch(`/admin/student-profiles/${encodeURIComponent(studentId)}/relationships`, { method: 'POST', body: JSON.stringify({ userId: selection.userId, relationType: selection.relationType.trim() || '代理报名' }) }), '学员账号关系已授权')
  }

  const mergeStudentProfile = async (item: TableItem) => {
    if (item.status === 'merged') return flash('该学员档案已经合并')
    const selection = await requestStudentMergeSelection(String(item.id))
    if (!selection) return
    if (!await confirmAction(`确定将“${item.name || item.id}”合并到档案 ${selection.targetName || selection.targetId} 吗？该操作会迁移报名履历并标记当前档案为已合并。`, '合并学员档案', true)) return
    const merged = await operateStudentDetail(String(item.id), () => apiFetch(`/admin/student-profiles/${encodeURIComponent(item.id)}/merge`, { method: 'POST', body: JSON.stringify({ targetId: selection.targetId }) }), '学员档案已合并')
    if (merged) setSelectedDetail(null)
  }

  const openEnrollmentSummaryDetail = async (summary: TableItem) => {
    try {
      const result = await apiFetch<{ items: TableItem[] }>('/admin/enrollments')
      // 汇总接口将“已取消”排除在有效报名人数外，详情也保持同一统计口径。
      const items = (result.items || []).filter(item => String(item.courseId) === String(summary.courseId) && item.paymentStatus !== '已取消')
      setEnrollmentSummaryDetail({ summary, items })
    } catch (error) { flash(error instanceof Error ? error.message : '报名详情加载失败') }
  }

  // Keep every App hook before the authentication branch so login/logout does
  // not change the hook order and blank the management page at runtime.
  const selectedKeys = useMemo(() => new Set(selectedRows.map(selectionKey)), [selectedRows])

  if (!loggedIn) return <Login done={() => setLoggedIn(true)} />
  const items = Array.isArray(data?.items) ? data.items : data ? [data] : []
  const filterDefinition = getListFilterDefinition(active, items, courseOptions)
  const filteredItems = serverPagedModules.has(active)
    ? items
    : items.filter((item: TableItem) => {
      const matchesKeyword = !tableKeyword.trim() || JSON.stringify(item).toLowerCase().includes(tableKeyword.trim().toLowerCase())
      const matchesField = !filterDefinition || !statusFilter || filterMatches(item, filterDefinition.field, statusFilter)
      return matchesKeyword && matchesField
    })
  const totalItems = serverPagedModules.has(active) ? Number(data?.total || 0) : filteredItems.length
  const pagedItems = serverPagedModules.has(active) ? filteredItems : filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const auditActionOptions = active === 'audits' ? Array.from(new Set([...(Array.isArray(data?.actions) ? data.actions : []), auditActionFilter].filter(Boolean))).sort() : []
  const actionLabel: RowActionLabel = ['enrollments', 'enrollment-details', 'students'].includes(active) ? '查看详情' : active === 'invoices' ? ((item: TableItem) => item.status === '已开票' ? '上传发票' : '开票通过') : ['courses', 'templates', 'banners', 'payment', 'rules', 'messages', 'configs', 'points'].includes(active) ? (active === 'templates' ? '编辑模板' : active === 'points' ? '调整积分' : '编辑') : active === 'orders' ? ((item: TableItem) => item.status === '待审核' ? '审核凭证' : item.status === '已支付' ? '退款' : item.status === '待支付' ? '关闭订单' : '查看详情') : active === 'users' ? '重置密码' : active === 'feedbacks' ? '回复处理' : '处理'
  const secondaryActionLabel: RowActionLabel | undefined = active === 'users' || active === 'banners' ? '启用 / 禁用' : active === 'invoices' ? ((item: TableItem) => item.status === '待处理' ? '驳回' : '查看发票') : active === 'rules' || active === 'messages' ? '启用 / 停用' : active === 'points' ? '查看流水' : undefined
  const detailOnlyModule = active === 'enrollment-details' || active === 'students'
  const detailHandler = ['orders', 'invoices', 'feedbacks', 'enrollment-details', 'students'].includes(active) ? openDetail : undefined
  const canOperate = active === 'orders' ? (item: TableItem) => ['待支付', '待审核', '已支付'].includes(String(item.status)) : active === 'invoices' ? (item: TableItem) => item.status === '待处理' || (item.status === '已开票' && item.invoiceFileStatus === '待上传') : active === 'feedbacks' ? (item: TableItem) => item.status === '待处理' : detailOnlyModule || active === 'audits' ? () => false : undefined
  const canSecondary = active === 'invoices' ? (item: TableItem) => item.status === '待处理' || (item.status === '已开票' && item.invoiceFileStatus === '已上传') : undefined
  const selectable = active !== 'audits' && active !== 'readiness'
  const toggleRowSelection = (item: TableItem, checked: boolean) => {
    const key = selectionKey(item)
    setSelectedRows(currentRows => {
      if (checked) {
        const existing = currentRows.findIndex(row => selectionKey(row) === key)
        if (existing >= 0) return currentRows.map((row, index) => index === existing ? item : row)
        return [...currentRows, item]
      }
      return currentRows.filter(row => selectionKey(row) !== key)
    })
  }
  const toggleAllSelection = (rows: TableItem[], checked: boolean) => {
    if (!checked) {
      const visibleKeys = new Set(rows.map(selectionKey))
      setSelectedRows(currentRows => currentRows.filter(item => !visibleKeys.has(selectionKey(item))))
      return
    }
    setSelectedRows(currentRows => {
      const merged = new Map(currentRows.map(item => [selectionKey(item), item]))
      rows.forEach(item => merged.set(selectionKey(item), item))
      return Array.from(merged.values())
    })
  }
  const downloadJson = (payload: unknown, filename: string) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url)
  }
  const exportData = async () => {
    try {
      const filterField = filterDefinition?.field || 'status'
      if (active === 'students' && !selectedRows.length) {
        const params = new URLSearchParams({ limit: '1000' })
        if (queryKeyword) params.set('keyword', queryKeyword)
        if (statusFilter) params.set('status', statusFilter)
        const result = await apiFetch<{ items: TableItem[]; total: number; truncated?: boolean; sensitiveFieldsMasked?: boolean }>(`/admin/student-profiles/export?${params.toString()}`)
        downloadJson({ exportedAt: new Date().toISOString(), scope: 'filtered', sensitiveFieldsMasked: result.sensitiveFieldsMasked !== false, total: result.total, truncated: result.truncated === true, items: result.items || [] }, 'student-profiles-masked.json')
        flash(result.truncated ? '导出已完成，但超过 1000 条，结果已截断' : `已导出 ${result.items?.length || 0} 条脱敏学员档案`)
        return
      }
      let exportItems = selectedRows
      let total = selectedRows.length
      let truncated = false
      if (!selectedRows.length) {
        if (serverPagedModules.has(active)) {
          const serverFilterParam = active === 'enrollment-details' ? 'courseId' : ['courses', 'orders', 'invoices', 'feedbacks', 'students'].includes(active) ? 'status' : active === 'users' ? 'role' : ''
          const filterQuery = serverFilterParam && statusFilter ? `&${serverFilterParam}=${encodeURIComponent(statusFilter)}` : ''
          const exportPageSize = 100
          const exportLimit = 1000
          const firstResult = await apiFetch<{ items?: TableItem[]; total?: number }>(`${current.endpoint}?keyword=${encodeURIComponent(queryKeyword)}${filterQuery}&page=1&pageSize=${exportPageSize}`)
          exportItems = Array.isArray(firstResult?.items) ? [...firstResult.items] : []
          total = Number(firstResult?.total || exportItems.length)
          const targetCount = Math.min(total, exportLimit)
          let exportPage = 1
          while (exportItems.length < targetCount && exportPage < Math.ceil(exportLimit / exportPageSize)) {
            exportPage += 1
            const pageResult = await apiFetch<{ items?: TableItem[]; total?: number }>(`${current.endpoint}?keyword=${encodeURIComponent(queryKeyword)}${filterQuery}&page=${exportPage}&pageSize=${exportPageSize}`)
            const pageItems = Array.isArray(pageResult?.items) ? pageResult.items : []
            if (!pageItems.length) break
            exportItems.push(...pageItems)
          }
          exportItems = exportItems.slice(0, exportLimit)
          truncated = total > exportItems.length
        } else {
          exportItems = filteredItems
          total = exportItems.length
        }
      }
      downloadJson({ exportedAt: new Date().toISOString(), module: active, scope: selectedRows.length ? 'selected' : 'filtered', filters: { keyword: queryKeyword, [filterField]: statusFilter }, total, truncated, selectedCount: selectedRows.length, items: exportItems }, `${active}-${selectedRows.length ? 'selected' : 'filtered'}.json`)
      flash(truncated ? `已导出 ${exportItems.length} 条，超过 1000 条的数据已截断` : `已导出 ${exportItems.length} 条${selectedRows.length ? '勾选' : '筛选'}数据`)
    } catch (error) {
      flash(error instanceof Error ? error.message : '导出数据失败')
    }
  }
  const createAction = ['courses', 'templates', 'banners', 'payment', 'rules', 'messages', 'configs', 'points'].includes(active) ? (
    active === 'courses' ? <button className="primary" onClick={() => openCourseEditor()}>新增课程</button> :
    active === 'templates' ? <button className="primary" onClick={() => openTemplateEditor()}>新增模板</button> :
    active === 'banners' ? <button className="primary" onClick={() => openBannerEditor()}>新增 Banner</button> :
    active === 'payment' ? <button className="primary" onClick={() => openPaymentEditor(data || undefined)}>编辑支付设置</button> :
    active === 'rules' ? <button className="primary" onClick={() => openRuleEditor()}>新增规则</button> :
    active === 'messages' ? <button className="primary" onClick={() => openMessageEditor()}>新增消息</button> :
    active === 'configs' ? <button className="primary" onClick={() => openConfigEditor()}>新增配置</button> :
    <button className="primary" onClick={() => openPointsEditor()}>调整积分</button>
  ) : null

  return <div className={`admin-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className={`admin-sidebar ${sidebarOpen ? 'is-open' : ''} ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
      <div className="brand"><b>六</b><strong>六边形培训</strong><button className="sidebar-close" type="button" aria-label="关闭导航" onClick={() => setSidebarOpen(false)}>×</button><button className="sidebar-toggle" type="button" aria-label={sidebarCollapsed ? '展开侧边栏' : '收缩侧边栏'} title={sidebarCollapsed ? '展开侧边栏' : '收缩侧边栏'} onClick={() => setSidebarCollapsed(value => !value)}><span className="sidebar-toggle-glyph" aria-hidden="true" /></button></div>
      <div className="sidebar-caption">管理导航</div>
      <nav className="sidebar-nav">
        <button className={`nav-home ${active === 'dashboard' ? 'active' : ''}`} title="工作台" onClick={() => navigate('dashboard')}><span className="nav-item-icon">⌂</span><span className="nav-child-label">工作台</span></button>
        {navGroups.map(group => {
          const isOpen = openNavGroup === group.key
          const hasActiveChild = group.moduleKeys.includes(active)
          return <section className={`nav-group ${isOpen ? 'is-open' : ''} ${hasActiveChild ? 'has-active' : ''}`} key={group.key}>
            <button className="nav-group-toggle" type="button" aria-expanded={isOpen} onClick={() => setOpenNavGroup(isOpen ? '' : group.key)}><span className="nav-group-title"><span className="nav-group-icon">{group.icon}</span><span className="nav-group-label">{group.label}</span></span><span className="nav-group-chevron" aria-hidden="true">⌄</span></button>
            <div className="nav-group-items">{group.moduleKeys.map(moduleKey => { const item = modules.find(module => module.key === moduleKey)!; return <button key={item.key} title={item.label} className={active === item.key ? 'active' : ''} onClick={() => navigate(item.key)}><span className="nav-child-icon">{item.label.slice(0, 1)}</span><span className="nav-child-label">{item.label}</span></button> })}</div>
          </section>
        })}
      </nav>
    </aside>
    {sidebarOpen && <button className="sidebar-backdrop" type="button" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}
    <main className={active === 'dashboard' ? 'dashboard-main' : 'page-main'}>
      <header className={active === 'dashboard' ? 'dashboard-header' : 'compact-header'}>
        <div className="header-top-row">
          <div className="header-main"><button className="menu-toggle" type="button" aria-label="打开导航" onClick={() => setSidebarOpen(true)}>☰</button>{active === 'dashboard' && <div><h1>{current.label}</h1><p>培训管理系统 · 数据持久化运行</p></div>}</div>
          {active !== 'dashboard' && <nav className="module-breadcrumb" aria-label="页面导航"><span>六边形培训管理端</span><b>/</b><span>{activeNavGroup?.label || '管理导航'}</span><b>/</b><strong>{current.label}</strong></nav>}
          <button className="logout-button" type="button" title="退出登录" onClick={logout}>退出登录</button>
        </div>
        <nav className="visited-tabs" aria-label="已访问页面标签" role="tablist">
          {visitedTabs.map(tabKey => {
            const label = tabKey === 'dashboard' ? '首页' : modules.find(item => item.key === tabKey)?.label || tabKey
            return <div className={`visited-tab ${active === tabKey ? 'active' : ''}`} key={tabKey}>
              <button type="button" role="tab" aria-selected={active === tabKey} title={`切换到${label}`} onClick={() => navigate(tabKey)}>{label}</button>
              {tabKey !== 'dashboard' && <button type="button" className="visited-tab-close" aria-label={`关闭${label}标签`} title={`关闭${label}`} onClick={() => closeVisitedTab(tabKey)}>×</button>}
            </div>
          })}
        </nav>
      </header>
      {active === 'dashboard' ? <Dashboard data={data} loading={listLoading} error={listError} onRetry={() => { void load().catch(() => undefined) }} onNavigate={navigate} /> : <section className="panel data-panel list-page">
        {active === 'readiness' ? <IntegrationReadinessPanel data={data} loading={listLoading} error={listError} onRefresh={() => { void load().catch(() => undefined) }} /> : <>
        <section className="list-section search-section" aria-label="搜索条件">
          <div className="search-toolbar">
            <input value={tableKeyword} onChange={event => { setTableKeyword(event.target.value); setPage(1) }} onKeyDown={event => { if (event.key === 'Enter') { setPage(1); setQueryKeyword(tableKeyword.trim()); requestLoad(1, tableKeyword.trim(), statusFilter) } }} placeholder="搜索当前列表" />
            {filterDefinition && <select aria-label={`${filterDefinition.label}筛选`} value={statusFilter} onChange={event => { setPage(1); setStatusFilter(event.target.value) }}><option value="">{filterDefinition.label}：全部</option>{filterDefinition.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}
            {active === 'audits' && <select aria-label="审计操作类型筛选" value={auditActionFilter} onChange={event => { setAuditActionFilter(event.target.value); setPage(1) }}><option value="">操作类型：全部</option>{auditActionOptions.map(action => <option key={action} value={action}>{action}</option>)}</select>}
            {active === 'audits' && <><input aria-label="审计操作者筛选" value={auditActorFilter} onChange={event => setAuditActorFilter(event.target.value)} placeholder="操作者" /><input aria-label="审计开始时间" type="datetime-local" value={auditFrom} onChange={event => setAuditFrom(event.target.value)} /><input aria-label="审计结束时间" type="datetime-local" value={auditTo} onChange={event => setAuditTo(event.target.value)} /></>}
            <div className="search-actions"><button className="reset-button" onClick={() => { setTableKeyword(''); setQueryKeyword(''); setStatusFilter(''); setAuditActionFilter(''); setAuditActorFilter(''); setAuditFrom(''); setAuditTo(''); setPage(1); requestLoad(1, '', '') }}>重置</button><button className="query-button" onClick={() => { setPage(1); setQueryKeyword(tableKeyword.trim()); requestLoad(1, tableKeyword.trim(), statusFilter) }}>查询</button></div>
          </div>
        </section>
        <section className="list-section action-section" aria-label="功能操作">
          <div className="action-toolbar"><button onClick={exportData}>导出</button>{selectedRows.length > 0 && <span className="selection-hint">已勾选 {selectedRows.length} 条</span>}{createAction}</div>
        </section>
      {selectedDetail && <DetailPanel detail={selectedDetail} onClose={() => setSelectedDetail(null)} onStudentEdit={openStudentEditor} onStudentStatus={toggleStudentStatus} onStudentGrant={grantStudentRelation} onStudentDefault={setStudentDefaultRelation} onStudentRevoke={revokeStudentRelation} onStudentMerge={mergeStudentProfile} onStudentReload={reloadStudentDetail} busy={Boolean(operationKey)} />}
         <section className="list-section table-section" aria-label="数据列表">
           {listLoading ? <ListState kind="loading" message="正在加载数据…" /> : listError && data === null ? <ListState kind="error" message={listError} onRetry={() => { void load(1, queryKeyword, statusFilter).catch(() => undefined) }} /> : <>{listError && <div className="list-refresh-error" role="alert"><span>刷新失败：{listError}</span><button type="button" className="query-button" onClick={() => { void load(1, queryKeyword, statusFilter).catch(() => undefined) }}>重新加载</button></div>}<DataTable moduleKey={active} items={pagedItems} onOperate={operate} onDetail={detailHandler} actionLabel={actionLabel} canOperate={canOperate} secondaryActionLabel={secondaryActionLabel} onSecondary={secondaryActionLabel ? secondaryOperate : undefined} canSecondary={canSecondary} showAction={active !== 'audits'} selectable={selectable} selectedKeys={selectedKeys} onToggleSelect={toggleRowSelection} onToggleAll={toggleAllSelection} busy={Boolean(operationKey)} /></>}
         </section>
         {!listLoading && !listError && <div className="list-footer"><div className="pagination"><span>共 {totalItems} 条，第 {Math.min(page, totalPages)} / {totalPages} 页（每页 {PAGE_SIZE} 条）</span><div><button disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>上一页</button><button disabled={page >= totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>下一页</button></div></div></div>}
         {active === 'enrollments' && !listLoading && !listError && <EnrollmentSummaryChart items={items} />}
         </>}
       </section>}
      {courseModalOpen && <CourseModal form={courseForm} templates={templateOptions} categories={courseCategoryOptions} submitting={courseSubmitting} onChange={updateCourseField} onUploadImage={uploadCourseImage} onPrompt={promptAction} onNotify={flash} onClose={() => setCourseModalOpen(false)} onSaveDraft={saveCourseDraft} onReset={resetCourse} onSave={saveCourse} onDelete={deleteCourse} />}
      {templateModalOpen && <TemplateModal form={templateForm} onChange={setTemplateForm} onFieldChange={updateTemplateField} onFieldRemove={removeTemplateField} onClose={() => setTemplateModalOpen(false)} onSave={saveTemplate} onCopy={copyTemplate} onDelete={deleteTemplate} busy={Boolean(operationKey)} locked={templateLocked} />}
      {bannerModalOpen && <BannerModal form={bannerForm} courses={courseOptions} onChange={setBannerForm} onClose={() => setBannerModalOpen(false)} onSave={saveBanner} onDelete={deleteBanner} busy={Boolean(operationKey)} />}
      {paymentModalOpen && <PaymentModal form={paymentForm} onChange={setPaymentForm} onUploadQr={uploadPaymentQr} onClose={() => setPaymentModalOpen(false)} onSave={savePayment} busy={Boolean(operationKey)} />}
      {ruleModalOpen && <RuleModal form={ruleForm} courses={courseOptions} onChange={setRuleForm} onClose={() => setRuleModalOpen(false)} onSave={saveRule} onDelete={deleteRule} busy={Boolean(operationKey)} />}
      {pointLedgerDetail && <PointLedgerModal detail={pointLedgerDetail} onClose={() => setPointLedgerDetail(null)} />}
       {messageModalOpen && <MessageModal form={messageForm} onChange={setMessageForm} onClose={() => setMessageModalOpen(false)} onSave={saveMessage} onDelete={deleteMessage} busy={Boolean(operationKey)} />}
      {configModalOpen && <ConfigModal form={configForm} onChange={setConfigForm} onClose={() => setConfigModalOpen(false)} onSave={saveConfig} busy={Boolean(operationKey)} />}
      {pointsModalOpen && <PointsModal form={pointsForm} onChange={setPointsForm} onClose={() => setPointsModalOpen(false)} onSave={savePoints} busy={Boolean(operationKey)} />}
      {feedbackModalOpen && <FeedbackModal form={feedbackForm} onChange={setFeedbackForm} onClose={() => setFeedbackModalOpen(false)} onSave={saveFeedback} busy={Boolean(operationKey)} />}
      {studentEditModalOpen && <StudentProfileModal form={studentProfileForm} onChange={setStudentProfileForm} onClose={() => setStudentEditModalOpen(false)} onSave={saveStudentProfile} busy={Boolean(operationKey)} />}
      {enrollmentSummaryDetail && <EnrollmentSummaryDetailPanel detail={enrollmentSummaryDetail} onClose={() => setEnrollmentSummaryDetail(null)} />}
      {reviewState && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeReview() }}>
        <section className="detail-modal review-modal modal-with-footer" role="dialog" aria-modal="true" aria-labelledby="review-modal-title">
          <div className="detail-head"><div><h3 id="review-modal-title">审核线下支付凭证</h3><p>订单 {reviewState.order.id} · {reviewState.order.courseTitle || reviewState.order.courseId || '培训订单'}</p></div><ModalCloseButton onClick={closeReview} disabled={reviewSubmitting} label="关闭凭证审核" /></div>
          <div className="modal-scroll review-scroll">
            <div className="review-meta"><span>凭证文件：{reviewState.proof.originalName || '支付凭证'}</span><span>状态：{reviewState.proof.status || 'pending'}</span><span>{reviewState.proof.mimeType || '-'} · {reviewState.proof.size || 0} bytes</span></div>
            {reviewState.imageUrl ? <img className="payment-proof-preview" src={reviewState.imageUrl} alt="线下支付凭证预览" /> : <p className="detail-muted">当前凭证不是可直接预览的图片，请通过接口下载后核验。</p>}
            <label className="review-remark-field">审核备注<textarea value={reviewRemark} onChange={event => setReviewRemark(event.target.value)} placeholder="通过可填写到账信息；驳回时必须填写原因" /></label>
          </div>
          <div className="modal-actions"><button type="button" onClick={closeReview} disabled={reviewSubmitting}>取消</button><button type="button" className="danger-button" onClick={() => submitOrderReview(false)} disabled={reviewSubmitting}>驳回凭证</button><button type="button" className="primary" onClick={() => submitOrderReview(true)} disabled={reviewSubmitting}>{reviewSubmitting ? '提交中…' : '审核通过'}</button></div>
        </section>
      </div>}
      {studentRelationStudentId && <StudentRelationDialog studentId={studentRelationStudentId} busy={Boolean(operationKey)} onClose={() => finishStudentRelationSelection(null)} onSubmit={finishStudentRelationSelection} />}
      {studentMergeSourceId && <StudentMergeDialog sourceId={studentMergeSourceId} busy={Boolean(operationKey)} onClose={() => finishStudentMergeSelection(null)} onSubmit={finishStudentMergeSelection} />}
      {dialogRequest && <AdminDialog request={dialogRequest} onClose={finishDialog} onSubmit={finishDialog} />}
      {notice && <div className="notice">{notice}</div>}
    </main>
  </div>
}

function StudentRelationDialog({ studentId, busy, onClose, onSubmit }: { studentId: string; busy: boolean; onClose: () => void; onSubmit: (value: StudentRelationSelection) => void }) {
  const [keyword, setKeyword] = useState('')
  const [users, setUsers] = useState<TableItem[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [relationType, setRelationType] = useState('代理报名')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({ role: 'user', page: '1', pageSize: '20' })
        if (keyword.trim()) params.set('keyword', keyword.trim())
        const result = await apiFetch<{ items?: TableItem[] }>(`/admin/users?${params.toString()}`)
        if (alive) setUsers(Array.isArray(result.items) ? result.items.filter(item => item.enabled !== false) : [])
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : '账号列表加载失败，请重试')
      } finally {
        if (alive) setLoading(false)
      }
    }, 180)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [keyword, reloadKey])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  const selectedUser = users.find(item => String(item.id) === selectedUserId)
  const submit = () => {
    if (!selectedUser) { setError('请先选择一个账号'); return }
    onSubmit({ userId: String(selectedUser.id), username: String(selectedUser.username || selectedUser.id), userName: String(selectedUser.name || ''), relationType })
  }
  const dialog = <div className="modal-backdrop student-relation-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="student-relation-modal" role="dialog" aria-modal="true" aria-labelledby="student-relation-title">
      <div className="modal-head"><div><h2 id="student-relation-title">授权学员账号</h2><p>为学员档案 {studentId} 选择可代报名的系统账号</p></div><button type="button" className="modal-close" aria-label="关闭" disabled={busy} onClick={onClose}>×</button></div>
      <label className="student-relation-search">搜索账号<input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="输入账号、姓名、手机号或公司" autoFocus /></label>
      <div className="student-relation-list" aria-live="polite">
        {loading ? <p className="detail-muted">正在加载账号…</p> : error ? <div className="student-relation-error"><span>{error}</span><button type="button" onClick={() => setReloadKey(value => value + 1)}>重试</button></div> : users.length ? users.map(user => {
          const id = String(user.id)
          const active = id === selectedUserId
          return <button type="button" className={`student-relation-option ${active ? 'is-selected' : ''}`} key={id} onClick={() => setSelectedUserId(id)}>
            <span><b>{user.name || user.username || id}</b><small>{user.username || id}{user.company ? ` · ${user.company}` : ''}</small></span><strong>{active ? '已选择' : '选择'}</strong>
          </button>
        }) : <p className="detail-muted">没有找到可授权的启用账号</p>}
      </div>
      <label className="student-relation-type">关系类型<select value={relationType} onChange={event => setRelationType(event.target.value)}><option value="代理报名">代理报名</option><option value="本人">本人</option><option value="企业管理员">企业管理员</option></select></label>
      <div className="modal-actions"><button type="button" onClick={onClose} disabled={busy}>取消</button><button type="button" className="primary" onClick={submit} disabled={busy || loading || !selectedUser}>{busy ? '处理中…' : '继续授权'}</button></div>
    </section>
  </div>
  return typeof document === 'undefined' ? null : createPortal(dialog, document.body)
}

function StudentMergeDialog({ sourceId, busy, onClose, onSubmit }: { sourceId: string; busy: boolean; onClose: () => void; onSubmit: (value: StudentMergeSelection) => void }) {
  const [keyword, setKeyword] = useState('')
  const [profiles, setProfiles] = useState<TableItem[]>([])
  const [selectedTargetId, setSelectedTargetId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({ status: 'active', page: '1', pageSize: '20' })
        if (keyword.trim()) params.set('keyword', keyword.trim())
        const result = await apiFetch<{ items?: TableItem[] }>(`/admin/student-profiles?${params.toString()}`)
        if (alive) setProfiles((result.items || []).filter(item => String(item.id) !== sourceId && item.status !== 'merged'))
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : '学员档案加载失败，请重试')
      } finally {
        if (alive) setLoading(false)
      }
    }, 180)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [keyword, reloadKey, sourceId])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  const selectedTarget = profiles.find(item => String(item.id) === selectedTargetId)
  const submit = () => {
    if (!selectedTarget) { setError('请先选择要保留的目标档案'); return }
    onSubmit({ targetId: String(selectedTarget.id), targetName: String(selectedTarget.name || selectedTarget.id) })
  }
  const dialog = <div className="modal-backdrop student-merge-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="student-merge-modal" role="dialog" aria-modal="true" aria-labelledby="student-merge-title">
      <div className="modal-head"><div><h2 id="student-merge-title">选择合并目标档案</h2><p>当前档案：{sourceId}。请选择要保留的活动学员档案。</p></div><button type="button" className="modal-close" aria-label="关闭" disabled={busy} onClick={onClose}>×</button></div>
      <label className="student-relation-search">搜索目标档案<input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="输入姓名、手机号、公司或档案 ID" autoFocus /></label>
      <div className="student-relation-list" aria-live="polite">
        {loading ? <p className="detail-muted">正在加载学员档案…</p> : error ? <div className="student-relation-error"><span>{error}</span><button type="button" onClick={() => setReloadKey(value => value + 1)}>重试</button></div> : profiles.length ? profiles.map(profile => {
          const id = String(profile.id)
          const active = id === selectedTargetId
          return <button type="button" className={`student-relation-option ${active ? 'is-selected' : ''}`} key={id} onClick={() => setSelectedTargetId(id)}>
            <span><b>{profile.name || id}</b><small>{id}{profile.phone ? ` · ${profile.phone}` : ''}{profile.company ? ` · ${profile.company}` : ''}</small></span><strong>{active ? '已选择' : '选择'}</strong>
          </button>
        }) : <p className="detail-muted">没有找到可作为目标的活动档案</p>}
      </div>
      <div className="modal-actions"><button type="button" onClick={onClose} disabled={busy}>取消</button><button type="button" className="danger-button" onClick={submit} disabled={busy || loading || !selectedTarget}>{busy ? '处理中…' : '继续合并'}</button></div>
    </section>
  </div>
  return typeof document === 'undefined' ? null : createPortal(dialog, document.body)
}

function CourseModal({ form, templates, categories, submitting, onChange, onUploadImage, onPrompt, onNotify, onClose, onSaveDraft, onReset, onSave, onDelete }: { form: CourseForm; templates: TemplateOption[]; categories: FilterOption[]; submitting: boolean; onChange: <K extends keyof CourseForm>(key: K, value: CourseForm[K]) => void; onUploadImage: (file: File) => Promise<void>; onPrompt: (message: string, defaultValue?: string, title?: string) => Promise<string | null>; onNotify: (message: string) => void; onClose: () => void; onSaveDraft: () => void; onReset: () => void; onSave: () => void; onDelete: () => void }) {
  const updateSchedule = (key: 'courseStartAt' | 'courseEndAt', value: string) => {
    const nextStart = key === 'courseStartAt' ? value : form.courseStartAt
    const nextEnd = key === 'courseEndAt' ? value : form.courseEndAt
    onChange(key, value)
    onChange('date', formatCourseSchedule(nextStart, nextEnd))
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (!submitting && event.target === event.currentTarget) onClose() }}>
    <section className="course-modal" role="dialog" aria-modal="true" aria-labelledby="course-modal-title">
      <div className="modal-head"><div><h2 id="course-modal-title">{form.id ? '编辑课程' : '新增课程'}</h2><p>维护课程基础信息、排课信息、价格和报名规则</p></div><button type="button" className="modal-close" disabled={submitting} onClick={onClose} aria-label="关闭">×</button></div>
      <div className="course-form-grid">
        <label>课程标题<input value={form.title} onChange={event => onChange('title', event.target.value)} placeholder="请输入课程标题" /></label>
        <label>课程副标题<input value={form.subtitle} onChange={event => onChange('subtitle', event.target.value)} placeholder="请输入课程副标题" /></label>
        <label>课程分类<select value={form.category} onChange={event => onChange('category', event.target.value)}>{[...(categories.length ? categories : courseCategoryFallback), ...(categories.some(option => option.value === form.category) ? [] : [{ value: form.category, label: `${form.category}（历史分类）` }])].map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small className="field-hint">分类来自系统数字字典，选择后展示标准名称</small></label>
        <label>课程状态<select value={form.status} onChange={event => onChange('status', event.target.value)}><option value="待发布">待发布</option><option value="报名中">报名中</option><option value="名额紧张">名额紧张</option><option value="已结束">已结束</option><option value="已下架">已下架</option></select></label>
        <label>关联报名模板<select required value={form.registrationTemplateId} onChange={event => onChange('registrationTemplateId', event.target.value)}><option value="">请选择已创建的报名模板</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select><small className="field-hint">一个课程必须选择一个模板；同一模板可复用于多个课程</small></label>
        <div className="wide-field course-schedule-field"><span className="form-label">上课时间</span><div className="course-schedule-grid"><label>课程开始时间<input type="datetime-local" required value={form.courseStartAt} onChange={event => updateSchedule('courseStartAt', event.target.value)} /></label><label>课程结束时间<input type="datetime-local" required value={form.courseEndAt} onChange={event => updateSchedule('courseEndAt', event.target.value)} /></label></div><small className="field-hint">点击日期输入框右侧日历图标选择开始和结束时间；保存时将自动生成课程时间段。</small><div className="course-date-summary">当前时间段：{form.courseStartAt && form.courseEndAt ? formatCourseSchedule(form.courseStartAt, form.courseEndAt) : '请选择完整的开始和结束时间'}</div></div>
        <label>上课地点<input value={form.location} onChange={event => onChange('location', event.target.value)} placeholder="请输入上课地点" /></label>
        <label>讲师<input value={form.instructor} onChange={event => onChange('instructor', event.target.value)} placeholder="请输入讲师" /></label>
<label className="wide-field course-image-field">课程图片<input type="file" accept="image/*" disabled={submitting} onChange={event => { const file = event.target.files?.[0]; if (file) void onUploadImage(file); event.target.value = '' }} /><small className="field-hint">用于 C 端首页课程卡片、首页轮播和课程详情顶部；建议上传 16:9 图片，单张不超过 5MB。</small>{form.image && <img className="course-image-preview" src={assetUrl(form.image)} alt="课程图片预览" />}</label>
        <label>课程原价<input type="number" min="0" value={form.originalPrice} onChange={event => onChange('originalPrice', event.target.value)} /></label>
        <label>课程售价<input type="number" min="0" value={form.price} onChange={event => onChange('price', event.target.value)} /></label>
        <label>课程特价<input type="number" min="0" value={form.specialPrice} onChange={event => onChange('specialPrice', event.target.value)} placeholder="可选" /></label>
        <label>课程名额<input type="number" min="0" value={form.capacity} onChange={event => onChange('capacity', event.target.value)} /></label>
        <label>已报名人数<input type="number" min="0" value={form.enrolled} readOnly aria-readonly="true" /><small className="field-hint">由报名、取消报名和退款自动维护，不可手动修改</small></label>
        <label>报名截止时间<input type="datetime-local" value={form.registrationDeadline} onChange={event => onChange('registrationDeadline', event.target.value)} /><small className="field-hint">可选；点击日历图标选择截止日期和时间</small></label>
        <label className="checkbox-field modal-checkbox"><input type="checkbox" checked={form.allowMultiParticipant} onChange={event => onChange('allowMultiParticipant', event.target.checked)} /><span>支持多人报名</span></label>
        <div className="wide-field rich-text-field"><label>课程简介</label><RichTextEditor value={form.descriptionRichText} onChange={value => onChange('descriptionRichText', value)} onPrompt={onPrompt} onNotify={onNotify} /></div>
      </div>
      <div className="modal-actions"><button type="button" onClick={onClose} disabled={submitting}>取消</button><button type="button" onClick={onReset} disabled={submitting}>重置</button>{!form.id && <button type="button" onClick={onSaveDraft} disabled={submitting}>保存草稿</button>}{form.id && <button type="button" className="danger-button" onClick={onDelete} disabled={submitting}>删除课程</button>}<button type="button" className="primary" onClick={onSave} disabled={submitting}>{submitting ? '保存中…' : '保存课程'}</button></div>
    </section>
  </div>
}

function CourseSearchPicker({ value, courses, disabled, onChange }: { value: string; courses: CourseOption[]; disabled?: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = courses.find(course => course.id === value)
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = courses.filter(course => !normalizedQuery || `${course.id} ${course.title}`.toLowerCase().includes(normalizedQuery))
  return <div className="course-search-picker">
    <button type="button" className="course-picker-summary" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)}><span>{selected?.title || (value ? value : '请选择关联课程')}</span><b aria-hidden="true">⌄</b></button>
    {open && <div className="course-picker-menu" role="listbox" aria-label="搜索并选择关联课程">
      <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="输入课程名称或编号搜索" aria-label="搜索课程" />
      <div className="course-picker-results">{filtered.length ? filtered.map(course => <button type="button" role="option" aria-selected={course.id === value} className={course.id === value ? 'course-picker-option is-selected' : 'course-picker-option'} key={course.id} onClick={() => { onChange(course.id); setQuery(''); setOpen(false) }}><span>{course.title}</span><small>{course.id}</small></button>) : <p className="course-picker-empty">没有匹配的课程</p>}</div>
      {value && <button type="button" className="course-picker-clear" onClick={() => { onChange(''); setQuery(''); setOpen(false) }}>清除关联课程</button>}
    </div>}
  </div>
}

function BannerModal({ form, courses, onChange, onClose, onSave, onDelete, busy = false }: { form: BannerForm; courses: CourseOption[]; onChange: (form: BannerForm) => void; onClose: () => void; onSave: () => void; onDelete: () => void; busy?: boolean }) {
  return <SimpleModal title={form.id ? '编辑 Banner' : '新增 Banner'} description="配置宣传位内容、关联课程和展示时间" onClose={onClose} busy={busy}>
    <div className="course-form-grid"><label>Banner 标题<input disabled={busy} value={form.title} onChange={event => onChange({ ...form, title: event.target.value })} placeholder="请输入宣传位标题" /></label><label>关联课程<CourseSearchPicker value={form.courseId} courses={courses} disabled={busy} onChange={courseId => onChange({ ...form, courseId })} /><small className="field-hint">点击后输入课程名称或编号搜索，再选择对应课程</small></label><label>排序<span className="field-hint">新增 Banner 默认排在现有列表末尾</span><input type="number" min="0" value={form.sort} disabled={busy || !form.id} onChange={event => onChange({ ...form, sort: event.target.value })} /></label><label className="checkbox-field modal-checkbox"><input type="checkbox" disabled={busy} checked={form.enabled} onChange={event => onChange({ ...form, enabled: event.target.checked })} /><span>启用展示</span></label><label>开始时间<input type="datetime-local" disabled={busy} value={form.startsAt} onChange={event => onChange({ ...form, startsAt: event.target.value })} /><small className="field-hint">可选；点击日历图标选择开始时间</small></label><label>结束时间<input type="datetime-local" disabled={busy} value={form.endsAt} onChange={event => onChange({ ...form, endsAt: event.target.value })} /><small className="field-hint">可选；点击日历图标选择结束时间</small></label></div>
    <div className="modal-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button>{form.id && <button type="button" className="danger-button" disabled={busy} onClick={onDelete}>删除 Banner</button>}<button type="button" className="primary" disabled={busy} onClick={onSave}>{busy ? '保存中…' : '保存 Banner'}</button></div>
  </SimpleModal>
}

function IntegrationReadinessPanel({ data, loading, error, onRefresh }: { data: any; loading: boolean; error: string; onRefresh: () => void }) {
  if (loading) return <div className="readiness-panel"><ListState kind="loading" message="正在检查渠道配置…" /></div>
  if (error) return <div className="readiness-panel"><ListState kind="error" message={error} onRetry={onRefresh} /></div>
  const channels = data?.channels || {}
  const entries = [
    { key: 'wechatLogin', label: '微信登录', value: channels.wechatLogin },
    { key: 'wechatPayment', label: `微信支付（${String(channels.wechatPayment?.product || 'h5').toUpperCase()}）`, value: channels.wechatPayment },
    { key: 'alipayPayment', label: '支付宝支付（WAP）', value: channels.alipayPayment },
    { key: 'passwordReset', label: '找回密码渠道', value: data?.passwordReset },
  ]
  const status = (value: any) => value?.productionSafe ? { label: '生产可用', className: 'readiness-ready' } : value?.configured ? { label: '内测可用', className: 'readiness-test' } : { label: '未配置', className: 'readiness-missing' }
  return <section className="readiness-panel">
    <div className="readiness-head"><div><h2>渠道与找回密码配置自检</h2><p>只展示配置状态和缺失项，不会显示任何密钥内容。</p></div><button type="button" className="query-button" onClick={onRefresh}>重新检查</button></div>
    <div className="readiness-grid">{entries.map(entry => { const state = status(entry.value); return <article className="readiness-card" key={entry.key}><div className="readiness-card-head"><h3>{entry.label}</h3><span className={state.className}>{state.label}</span></div><div className="readiness-meta"><span>适配器：{String(entry.value?.adapter || entry.value?.mode || '-')}</span>{entry.value?.callbackHttps !== undefined && <span>回调 HTTPS：{entry.value.callbackHttps ? '是' : '否'}</span>}{entry.value?.returnUrlHttps !== undefined && <span>返回 HTTPS：{entry.value.returnUrlHttps ? '是' : '否'}</span>}</div>{Array.isArray(entry.value?.missing) && entry.value.missing.length ? <div className="readiness-missing-list"><b>缺少配置</b>{entry.value.missing.map((item: string) => <code key={item}>{item}</code>)}</div> : <p className="readiness-ok">当前没有发现缺失项。</p>}</article> })}</div>
    <div className="readiness-foot"><span>检查时间：{data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : '尚未检查'}</span><span>生产在线支付必须使用商户配置和公网 HTTPS 回调；个人收款码仅用于线下凭证审核。</span></div>
  </section>
}

function PaymentModal({ form, onChange, onUploadQr, onClose, onSave, busy = false }: { form: PaymentForm; onChange: (form: PaymentForm) => void; onUploadQr: (channel: 'wechat' | 'alipay', file: File) => void; onClose: () => void; onSave: () => void; busy?: boolean }) {
  const qrField = (channel: 'wechat' | 'alipay', label: string, value: string) => <label className="wide-field course-image-field">{label}收款码图片<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void onUploadQr(channel, file); event.target.value = '' }} /><small className="field-hint">用于个人收款码线下转账；上传后 C 端会展示，支付仍需上传凭证并由管理端审核。</small>{value && <img className="course-image-preview payment-qr-preview" src={value.startsWith('http') ? value : `${API_BASE_URL.replace(/\/api\/?$/, '')}${value}`} alt={`${label}收款码预览`} />}</label>
  return <SimpleModal title="支付设置" description="维护对公转账和个人收款码的线下支付信息；在线支付需另行配置商户渠道" onClose={onClose} busy={busy}>
    <div className="course-form-grid"><label>收款户名<input disabled={busy} value={form.accountName} onChange={event => onChange({ ...form, accountName: event.target.value })} /></label><label>开户银行<input disabled={busy} value={form.bankName} onChange={event => onChange({ ...form, bankName: event.target.value })} /></label><label>银行账号<input disabled={busy} value={form.accountNo} onChange={event => onChange({ ...form, accountNo: event.target.value })} /></label><label>转账备注/收款码文本<input disabled={busy} value={form.qrCodeText} onChange={event => onChange({ ...form, qrCodeText: event.target.value })} /></label>{qrField('wechat', '微信', form.wechatQrImage)}{qrField('alipay', '支付宝', form.alipayQrImage)}<label className="checkbox-field modal-checkbox"><input type="checkbox" disabled={busy} checked={form.onlineWechatEnabled} onChange={event => onChange({ ...form, onlineWechatEnabled: event.target.checked })} /><span>启用微信在线支付（需商户配置）</span></label><label className="checkbox-field modal-checkbox"><input type="checkbox" disabled={busy} checked={form.onlineAlipayEnabled} onChange={event => onChange({ ...form, onlineAlipayEnabled: event.target.checked })} /><span>启用支付宝在线支付（需商户配置）</span></label></div>
    <div className="modal-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="button" className="primary" disabled={busy} onClick={onSave}>{busy ? '保存中…' : '保存支付设置'}</button></div>
  </SimpleModal>
}

function RuleModal({ form, courses, onChange, onClose, onSave, onDelete, busy = false }: { form: RuleForm; courses: CourseOption[]; onChange: (form: RuleForm) => void; onClose: () => void; onSave: () => void; onDelete?: () => void; busy?: boolean }) {
  const [coursePickerOpen, setCoursePickerOpen] = useState(false)
  const selectedIds = form.courseIds.split(',').map(item => item.trim()).filter(Boolean)
  const selectedNames = selectedIds.map(id => courses.find(course => course.id === id)?.title || id)
  const toggleCourse = (courseId: string) => {
    const nextIds = selectedIds.includes(courseId) ? selectedIds.filter(id => id !== courseId) : [...selectedIds, courseId]
    onChange({ ...form, courseIds: nextIds.join(', ') })
  }
  return <SimpleModal title={form.id ? '编辑优惠规则' : '新增优惠规则'} description="配置人数阶梯、折扣比例和适用课程范围" onClose={onClose} busy={busy}>
    <div className="course-form-grid"><label>最低报名人数<input type="number" min="1" value={form.minPeople} onChange={event => onChange({ ...form, minPeople: event.target.value })} /></label><label>折扣比例<input type="number" min="0" max="1" step="0.01" value={form.discountRate} onChange={event => onChange({ ...form, discountRate: event.target.value })} /><small className="field-hint">例如 0.9 表示 9 折；不选择课程表示适用全部课程</small></label><div className="wide-field rule-course-picker-field"><span className="form-label">适用课程（可多选）</span><div className="rule-course-picker"><button type="button" className="rule-course-summary" aria-haspopup="listbox" aria-expanded={coursePickerOpen} onClick={() => setCoursePickerOpen(value => !value)}><span>{selectedNames.length ? selectedNames.join('、') : '全部课程（未指定适用范围）'}</span><b aria-hidden="true">⌄</b></button>{coursePickerOpen && <div className="rule-course-menu" role="listbox" aria-label="选择适用课程">{courses.map(course => <label key={course.id} className="rule-course-option"><input type="checkbox" checked={selectedIds.includes(course.id)} onChange={() => toggleCourse(course.id)} /><span>{course.title}</span></label>)}<button type="button" className="rule-course-done" onClick={() => setCoursePickerOpen(false)}>完成选择</button></div>}</div><small className="field-hint">点击课程前的勾选框即可多选；已选课程会显示在上方文本框中。不选择表示适用全部课程。</small></div><label className="checkbox-field modal-checkbox"><input type="checkbox" checked={form.enabled} onChange={event => onChange({ ...form, enabled: event.target.checked })} /><span>启用规则</span></label></div>
    <div className="modal-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button>{form.id && onDelete && <button type="button" className="danger-button" disabled={busy} onClick={onDelete}>删除规则</button>}<button type="button" className="primary" disabled={busy} onClick={onSave}>{busy ? '保存中…' : '保存优惠规则'}</button></div>
  </SimpleModal>
}

function MessageModal({ form, onChange, onClose, onSave, onDelete, busy = false }: { form: MessageForm; onChange: (form: MessageForm) => void; onClose: () => void; onSave: () => void; onDelete?: () => void; busy?: boolean }) {
  const legacyChannel = form.channel && form.channel !== '站内消息' ? form.channel : ''
  return <SimpleModal title={form.id ? '编辑消息' : '新增消息'} description="维护站内通知、目标范围、展示时间和阅读状态" onClose={onClose} busy={busy}>
    <div className="course-form-grid"><label>消息标题<input value={form.title} onChange={event => onChange({ ...form, title: event.target.value })} placeholder="例如：课程报名提醒" /></label><label>通知渠道<select value={form.channel} onChange={event => onChange({ ...form, channel: event.target.value })}><option value="站内消息">站内消息</option>{legacyChannel && <option value={legacyChannel}>{legacyChannel}（历史记录，暂不可继续使用）</option>}<option disabled>短信（待接入）</option><option disabled>邮件（待接入）</option></select><small className="field-hint">当前仅支持站内消息；短信、邮件待接入真实投递服务。</small></label><label className="wide-field">消息内容<textarea value={form.content} onChange={event => onChange({ ...form, content: event.target.value })} placeholder="请输入通知内容" /></label><label>目标用户 ID<span className="field-hint">可选，多个用逗号或换行分隔；留空表示不按用户限制</span><input value={form.targetUserIds} onChange={event => onChange({ ...form, targetUserIds: event.target.value })} placeholder="例如：u-demo, u-operator" /></label><label>目标课程 ID<span className="field-hint">可选，多个用逗号或换行分隔；报名该课程的用户可见</span><input value={form.targetCourseIds} onChange={event => onChange({ ...form, targetCourseIds: event.target.value })} placeholder="例如：course-1, course-2" /></label><label>开始展示时间<span className="field-hint">可选，支持 ISO 时间</span><input type="datetime-local" value={form.startsAt} onChange={event => onChange({ ...form, startsAt: event.target.value })} /></label><label>结束展示时间<span className="field-hint">可选，支持 ISO 时间</span><input type="datetime-local" value={form.endsAt} onChange={event => onChange({ ...form, endsAt: event.target.value })} /></label><label className="checkbox-field modal-checkbox"><input type="checkbox" checked={form.enabled} onChange={event => onChange({ ...form, enabled: event.target.checked })} /><span>启用消息</span></label></div>
    <div className="modal-actions"><button type="button" onClick={onClose} disabled={busy}>取消</button>{form.id && onDelete && <button type="button" className="danger-button" onClick={onDelete} disabled={busy}>删除消息</button>}<button type="button" className="primary" onClick={onSave} disabled={busy}>保存消息</button></div>
  </SimpleModal>
}

function ConfigModal({ form, onChange, onClose, onSave, busy = false }: { form: ConfigForm; onChange: (form: ConfigForm) => void; onClose: () => void; onSave: () => void; busy?: boolean }) {
  return <SimpleModal title={form.key ? '编辑系统配置' : '新增系统配置'} description="使用结构化字段维护系统运行参数，不再直接编辑 JSON" onClose={onClose} busy={busy}>
    <div className="course-form-grid"><label>配置键<input value={form.key} disabled={Boolean(form.key)} onChange={event => onChange({ ...form, key: event.target.value })} placeholder="例如：supportPhone" /></label><label>配置值<input value={form.value} onChange={event => onChange({ ...form, value: event.target.value })} placeholder="请输入配置值" /></label><label className="wide-field">配置说明<textarea value={form.description} onChange={event => onChange({ ...form, description: event.target.value })} placeholder="说明该配置的用途" /></label></div>
    <div className="modal-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="button" className="primary" disabled={busy} onClick={onSave}>{busy ? '保存中…' : '保存配置'}</button></div>
  </SimpleModal>
}

function PointsModal({ form, onChange, onClose, onSave, busy = false }: { form: PointsForm; onChange: (form: PointsForm) => void; onClose: () => void; onSave: () => void; busy?: boolean }) {
  return <SimpleModal title="调整用户积分" description="通过积分变更记录维护用户积分，正数增加、负数扣减" onClose={onClose} busy={busy}>
    <div className="course-form-grid"><label>用户编号<input value={form.userId} onChange={event => onChange({ ...form, userId: event.target.value })} placeholder="例如：user-demo" /></label><label>用户名称<input value={form.userName} disabled /></label><label>积分变更<input type="number" step="1" value={form.points} onChange={event => onChange({ ...form, points: event.target.value })} /></label><label className="wide-field">调整原因<textarea value={form.reason} onChange={event => onChange({ ...form, reason: event.target.value })} placeholder="例如：线下活动奖励" /></label></div>
    <div className="modal-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="button" className="primary" disabled={busy} onClick={onSave}>{busy ? '保存中…' : '保存积分调整'}</button></div>
  </SimpleModal>
}

function PointLedgerModal({ detail, onClose }: { detail: PointLedgerDetailState; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="point-ledger-title">
      <div className="detail-head"><div><h3 id="point-ledger-title">积分流水</h3><p>{detail.user.userName || detail.user.name || detail.user.username || detail.user.id} · 当前积分 {detail.user.points ?? 0}</p></div><ModalCloseButton onClick={onClose} label="关闭积分流水" /></div>
      {detail.items.length ? <div className="table-scroll"><table><thead><tr><th>时间</th><th>变更积分</th><th>原因</th><th>流水编号</th></tr></thead><tbody>{detail.items.map(item => <tr key={item.id}><td>{formatValue(item.createdAt)}</td><td className={Number(item.points) >= 0 ? 'points-positive' : 'points-negative'}>{Number(item.points) >= 0 ? '+' : ''}{item.points}</td><td>{item.reason || '-'}</td><td>{item.id}</td></tr>)}</tbody></table></div> : <p className="detail-muted">暂无积分流水</p>}
    </section>
  </div>
}

function FeedbackModal({ form, onChange, onClose, onSave, busy = false }: { form: FeedbackForm; onChange: (form: FeedbackForm) => void; onClose: () => void; onSave: () => void; busy?: boolean }) {
  return <SimpleModal title="回复反馈" description="填写处理结果后，反馈状态将更新为已处理" onClose={onClose} busy={busy}>
    <label className="wide-field">回复内容<textarea value={form.reply} onChange={event => onChange({ ...form, reply: event.target.value })} placeholder="请输入回复内容" /></label>
    <div className="modal-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="button" className="primary" disabled={busy} onClick={onSave}>{busy ? '保存中…' : '保存回复'}</button></div>
  </SimpleModal>
}

function StudentProfileModal({ form, onChange, onClose, onSave, busy = false }: { form: StudentProfileForm; onChange: (form: StudentProfileForm) => void; onClose: () => void; onSave: () => void; busy?: boolean }) {
  const field = (key: keyof Omit<StudentProfileForm, 'id'>, label: string, placeholder = '') => <label>{label}<input value={form[key]} onChange={event => onChange({ ...form, [key]: event.target.value })} placeholder={placeholder} disabled={busy} /></label>
  return <SimpleModal title="编辑学员档案" description="修改主档案资料会同步影响后续报名回填；历史报名快照保持不变" onClose={onClose} busy={busy}>
    <div className="course-form-grid">
      {field('name', '姓名', '请输入学员姓名')}
      {field('phone', '手机号', '留空表示不修改；修改请输入完整 11 位手机号')}
      {field('email', '邮箱', '留空表示不修改；修改请输入完整邮箱')}
      {field('company', '公司', '可选')}
      {field('department', '部门', '可选')}
      {field('position', '职务', '可选')}
    </div>
    <div className="modal-actions"><button type="button" onClick={onClose} disabled={busy}>取消</button><button type="button" className="primary" onClick={onSave} disabled={busy}>{busy ? '保存中…' : '保存档案'}</button></div>
  </SimpleModal>
}

function SimpleModal({ title, description, onClose, children, busy = false }: { title: string; description: string; onClose: () => void; children: ReactNode; busy?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (!busy && event.target === event.currentTarget) onClose() }}><section className="course-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><h2>{title}</h2><p>{description}</p></div><button type="button" className="modal-close" disabled={busy} onClick={onClose} aria-label="关闭">×</button></div>{children}</section></div>
}

function TemplateModal({ form, onChange, onFieldChange, onFieldRemove, onClose, onSave, onCopy, onDelete, busy = false, locked = false }: { form: TemplateForm; onChange: (form: TemplateForm) => void; onFieldChange: (index: number, patch: Partial<TemplateField>) => void; onFieldRemove: (index: number) => Promise<void> | void; onClose: () => void; onSave: () => void; onCopy?: () => void; onDelete?: () => void; busy?: boolean; locked?: boolean }) {
  const addField = () => {
    if (busy || locked) return
    const fields = [...form.fields, { key: `field${form.fields.length + 1}`, label: '新字段', type: 'text' as const, required: false, options: [] }]
    onChange({ ...form, fields })
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (!busy && event.target === event.currentTarget) onClose() }}>
    <section className="template-modal" role="dialog" aria-modal="true" aria-labelledby="template-modal-title">
      <div className="modal-head"><div><h2 id="template-modal-title">{form.id ? '编辑报名模板' : '新增报名模板'}</h2><p>模板可复用于多个课程，每个课程只能关联一个模板</p></div><button type="button" className="modal-close" disabled={busy} onClick={onClose} aria-label="关闭">×</button></div>
      <div className="modal-scroll template-modal-scroll">
      {locked && <div className="template-lock-notice" role="status">该模板已关联报名中的课程，暂不可修改；如需调整请先结束或下架相关课程。</div>}
      <label className="template-course-field">模板名称<input disabled={busy || locked} value={form.name} onChange={event => onChange({ ...form, name: event.target.value })} placeholder="例如：通用基础报名模板" /></label>
      <div className="template-layout"><div className="template-fields"><div className="template-section-head"><h3>字段配置</h3><button type="button" disabled={busy || locked} onClick={addField}>添加字段</button></div>{form.fields.map((field, index) => <div className="template-field-row" key={`${field.key}-${index}`}><input disabled={busy || locked} value={field.key} onChange={event => onFieldChange(index, { key: event.target.value })} placeholder="字段标识" /><input disabled={busy || locked} value={field.label} onChange={event => onFieldChange(index, { label: event.target.value })} placeholder="显示名称" /><select disabled={busy || locked} value={field.type} onChange={event => onFieldChange(index, { type: event.target.value as TemplateField['type'] })}><option value="text">文本</option><option value="phone">手机号</option><option value="select">下拉框</option><option value="radio">单选框</option><option value="checkbox">复选框</option></select><label className="template-required"><input type="checkbox" disabled={busy || locked} checked={field.required} onChange={event => onFieldChange(index, { required: event.target.checked })} />必填</label><button type="button" className="template-remove-text" onClick={() => void onFieldRemove(index)} disabled={busy || locked || form.fields.length <= 1}>删除</button>{['select', 'radio', 'checkbox'].includes(field.type) && <input className="template-options" disabled={busy || locked} value={(field.options || []).join(',')} onChange={event => onFieldChange(index, { options: event.target.value.split(',') })} placeholder="选项用逗号分隔" />}</div>)}</div><aside className="template-preview"><h3>报名页预览</h3><p>字段数量：{form.fields.length}</p>{form.fields.map((field, index) => <div className="template-preview-item" key={`${field.key}-preview-${index}`}><span>{field.label || '未命名字段'}</span><small>{field.type}{field.required ? ' · 必填' : ' · 选填'}</small></div>)}</aside></div>
      </div>
      <div className="modal-actions"><button type="button" disabled={busy || locked} onClick={onClose}>取消</button>{form.id && onCopy && <button type="button" disabled={busy} onClick={onCopy}>另存为副本</button>}{form.id && onDelete && <button type="button" className="danger-button" disabled={busy || locked} onClick={onDelete}>删除模板</button>}<button type="button" className="primary" disabled={busy || locked} onClick={onSave}>{busy ? '保存中…' : '保存模板'}</button></div>
    </section>
  </div>
}

function RichTextEditor({ value, onChange, onPrompt, onNotify }: { value: string; onChange: (value: string) => void; onPrompt: (message: string, defaultValue?: string, title?: string) => Promise<string | null>; onNotify: (message: string) => void }) {
  const editorRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const selectionRef = useRef<Range | null>(null)
  const [imageUrl, setImageUrl] = useState('')

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value || '<p><br /></p>'
  }, [value])

  const runCommand = (command: string, argument?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, argument)
    onChange(editorRef.current?.innerHTML || '')
  }

  const rememberSelection = () => {
    const selection = window.getSelection()
    if (!selection || !selection.rangeCount || !editorRef.current) return
    const range = selection.getRangeAt(0)
    if (editorRef.current.contains(range.commonAncestorContainer)) selectionRef.current = range.cloneRange()
  }

  const restoreSelection = () => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const selection = window.getSelection()
    const range = selectionRef.current
    if (!selection || !range || !editor.contains(range.commonAncestorContainer)) return
    selection.removeAllRanges()
    selection.addRange(range)
  }

  const addLink = async () => {
    const url = await onPrompt('请输入链接地址', '', '插入链接')
    if (url?.trim()) runCommand('createLink', url.trim())
  }

  const addImageFromUrl = () => {
    const url = imageUrl.trim()
    if (!url) return
    restoreSelection()
    runCommand('insertImage', url)
    setImageUrl('')
  }

  const addLocalImage = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      onNotify('请选择图片文件')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      onNotify('图片大小不能超过 5MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) return
      restoreSelection()
      runCommand('insertImage', dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const handleImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    addLocalImage(event.target.files?.[0])
    event.target.value = ''
  }

  return <div className="rich-editor">
    <div className="rich-toolbar" role="toolbar" aria-label="课程简介富文本工具栏">
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('formatBlock', 'p')}>正文</button>
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('formatBlock', 'h3')}>标题</button>
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('bold')}><b>B</b></button>
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('italic')}><i>I</i></button>
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('insertUnorderedList')}>项目符号</button>
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('insertOrderedList')}>编号列表</button>
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => { void addLink() }}>链接</button>
      <button type="button" onMouseDown={event => { event.preventDefault(); rememberSelection() }} onClick={() => imageInputRef.current?.click()}>插入图片</button>
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('removeFormat')}>清除格式</button>
    </div>
    <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImageFileChange} />
    <div className="rich-image-row"><input value={imageUrl} onChange={event => setImageUrl(event.target.value)} placeholder="可选：粘贴图片 URL" /><button type="button" onMouseDown={event => { event.preventDefault(); rememberSelection() }} onClick={addImageFromUrl}>插入 URL</button><span>本地图片会以内嵌方式写入课程简介，单张不超过 5MB</span></div>
    <div ref={editorRef} className="rich-editor-content" contentEditable suppressContentEditableWarning onInput={() => onChange(editorRef.current?.innerHTML || '')} data-placeholder="请输入课程简介、适用对象和学习收益" />
    <small className="rich-editor-hint">可编辑标题、段落、加粗、列表、链接和图片；保存后 C 端按富文本展示。</small>
  </div>
}

function ListState({ kind, message, onRetry }: { kind: 'loading' | 'error'; message: string; onRetry?: () => void }) {
  return <div className={`list-state ${kind}-state`} role={kind === 'loading' ? 'status' : 'alert'}>
    <p>{message}</p>
    {kind === 'error' && onRetry && <button type="button" className="query-button" onClick={onRetry}>重新加载</button>}
  </div>
}

function Dashboard({ data, loading, error, onRetry, onNavigate }: { data: any; loading: boolean; error: string; onRetry: () => void; onNavigate: (key: string) => void }) {
  if (loading) return <div className="dashboard-stack"><ListState kind="loading" message="正在加载工作台…" /></div>
  if (error) return <div className="dashboard-stack"><ListState kind="error" message={error} onRetry={onRetry} /></div>
  const cards = [
    { name: '课程数量', value: data?.courseCount, target: 'courses' },
    { name: '报名人数', value: data?.enrollmentCount, target: 'enrollments' },
    { name: '课程预览', value: data?.previewCount, target: 'courses' },
    { name: '已支付订单', value: data?.paidCount, target: 'orders' },
    { name: '待支付', value: data?.pendingPaymentCount, target: 'orders' },
    { name: '待开票', value: data?.pendingInvoiceCount, target: 'invoices' },
  ]
  const stats = Array.isArray(data?.courseStats) ? data.courseStats : []
  return <div className="dashboard-stack">
    <section className="kpis">{cards.map(card => <button className="kpi" type="button" key={card.name} onClick={() => onNavigate(card.target)}><span>{card.name}</span><strong>{card.value ?? '-'}</strong><small>查看对应业务 <b aria-hidden="true">→</b></small></button>)}</section>
    <section className="panel"><h2>运营待办</h2><p>请依次处理线下支付审核、开票申请和用户反馈；所有处理结果将写入操作审计。</p></section>
    <section className="panel"><div className="panel-head"><h2>课程开展统计</h2></div><DataTable moduleKey="dashboard" items={stats} onOperate={() => undefined} showAction={false} /></section>
  </div>
}

function EnrollmentSummaryChart({ items }: { items: TableItem[] }) {
  const rows = items
  const chartPageSize = 5
  const [chartPage, setChartPage] = useState(1)
  const chartTotalPages = Math.max(1, Math.ceil(rows.length / chartPageSize))
  const chartRows = rows.slice((chartPage - 1) * chartPageSize, chartPage * chartPageSize)
  useEffect(() => { setChartPage(1) }, [items])
  const max = Math.max(1, ...rows.map(item => Number(item.enrollmentCount || 0)))
  const number = (value: unknown) => Math.max(0, Number(value || 0))
  const percent = (value: number, total: number) => total ? Math.round(value / total * 100) : 0
  const tooltip = (course: string, total: number, paid: number, unpaid: number, other: number) => [
    course,
    `总报名：${total} 人`,
    `已支付：${paid} 人（${percent(paid, total)}%）`,
    `未支付：${unpaid} 人（${percent(unpaid, total)}%）`,
    ...(other ? [`其他状态：${other} 人（${percent(other, total)}%）`] : []),
  ].join('\n')
  return <section className="enrollment-chart panel" aria-label="课程报名人数汇总图表">
    <div className="chart-heading"><div><h3>课程报名人数汇总</h3><p>按课程查看总报名、已支付和未支付人数</p></div><span>{rows.length} 门课程</span></div>
    {rows.length ? <>
       <div className="chart-list">{chartRows.map((item, chartIndex) => {
      const total = number(item.enrollmentCount)
      const paid = Math.min(total, number(item.paidCount))
      const unpaid = Math.min(Math.max(0, total - paid), number(item.unpaidCount))
      const other = Math.max(0, total - paid - unpaid)
      const trackWidth = total ? Math.max(4, total / max * 100) : 0
      const course = String(item.courseTitle || item.courseId)
      const details = tooltip(course, total, paid, unpaid, other)
       // A legacy/partially migrated row may have a missing or duplicated
       // courseId. Include the visible row index so React never reuses the
       // wrong chart row when the summary refreshes.
       return <div className="chart-row" key={`${String(item.courseId || item.courseTitle || 'course')}-${(chartPage - 1) * chartPageSize + chartIndex}`}>
        <div className="chart-label"><b>{course}</b><small>总报名 {total} 人</small></div>
        <div className="chart-bars">
          <div className="chart-track-wrap">
            <div className="chart-track" tabIndex={0} title={details} aria-label={details.replace(/\n/g, '，')}>
              <i className="chart-segment paid" style={{ width: `${trackWidth * (paid / Math.max(1, total))}%` }} />
              <i className="chart-segment unpaid" style={{ width: `${trackWidth * (unpaid / Math.max(1, total))}%` }} />
              {other > 0 && <i className="chart-segment other" style={{ width: `${trackWidth * (other / Math.max(1, total))}%` }} />}
            </div>
            <div className="chart-tooltip" role="tooltip"><b>{course}</b><span>总报名：{total} 人</span><span className="tooltip-paid">已支付：{paid} 人（{percent(paid, total)}%）</span><span className="tooltip-unpaid">未支付：{unpaid} 人（{percent(unpaid, total)}%）</span>{other > 0 && <span className="tooltip-other">其他状态：{other} 人（{percent(other, total)}%）</span>}</div>
          </div>
          <div className="chart-legend"><span className="chart-total-note">总计 {total}</span><span><i className="legend-dot paid" />已支付 {paid}</span><span><i className="legend-dot unpaid" />未支付 {unpaid}</span>{other > 0 && <span><i className="legend-dot other" />其他 {other}</span>}<small>悬停查看明细</small></div>
        </div>
      </div>
    })}</div>
      <div className="chart-pagination"><span>共 {rows.length} 门课程，第 {chartPage} / {chartTotalPages} 页（每页 {chartPageSize} 门）</span><div><button type="button" disabled={chartPage <= 1} onClick={() => setChartPage(page => Math.max(1, page - 1))}>上一页</button><button type="button" disabled={chartPage >= chartTotalPages} onClick={() => setChartPage(page => Math.min(chartTotalPages, page + 1))}>下一页</button></div></div>
    </> : <p className="empty">暂无课程报名数据</p>}
  </section>
}

function EnrollmentSummaryDetailPanel({ detail, onClose }: { detail: EnrollmentSummaryDetailState; onClose: () => void }) {
  const [selectedStatus, setSelectedStatus] = useState<'paid' | 'unpaid' | null>(null)
  const paid = detail.items.filter(item => item.paymentStatus === '已支付')
  const unpaid = detail.items.filter(item => item.paymentStatus !== '已支付')
  const renderRows = (rows: TableItem[], empty: string) => rows.length ? <div className="enrollment-detail-list">{rows.map((row, index) => <article className="enrollment-detail-row" key={String(row.id || index)}><div className={`enrollment-detail-head ${row.paymentStatus === '已支付' ? 'is-paid' : 'is-unpaid'}`}><b>{row.name || `报名人 ${index + 1}`}</b><span>{row.paymentStatus || '-'}</span></div><div className="enrollment-detail-fields">{Object.entries(row).filter(([key, value]) => !['id', 'courseId', 'courseTitle', 'paymentStatus', 'orderId', 'accountUserId', 'accountUsername', 'accountUserName'].includes(key) && value !== undefined && value !== '').map(([key, value]) => <span key={key}><small>{displayColumnLabel(key)}</small><b>{formatValue(value)}</b></span>)}</div><small className="enrollment-detail-foot">订单：{row.orderId || '-'} · 下单账号：{row.accountUsername || '-'}</small></article>)}</div> : <p className="detail-muted">{empty}</p>
  const selectedItems = selectedStatus === 'paid' ? paid : unpaid
  const selectedTitle = selectedStatus === 'paid' ? '已支付报名人详情' : '未支付/其他状态报名人详情'
  return <>
    <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="detail-modal enrollment-summary-modal" role="dialog" aria-modal="true" aria-labelledby="enrollment-summary-detail-title">
        <div className="detail-head"><div><h3 id="enrollment-summary-detail-title">{detail.summary.courseTitle || detail.summary.courseId} · 报名详情</h3><p>总报名 {detail.summary.enrollmentCount || 0} 人，请选择要查看的报名人状态</p></div><ModalCloseButton onClick={onClose} label="关闭报名详情" /></div>
        <div className="summary-detail-stats"><span>总计 <b>{detail.items.length}</b></span><span className="paid-stat">已支付 <b>{paid.length}</b></span><span className="unpaid-stat">未支付/其他 <b>{unpaid.length}</b></span></div>
        <div className="summary-detail-actions" aria-label="报名人详情分类">
          <button type="button" className="summary-status-button paid-button" onClick={() => setSelectedStatus('paid')} disabled={!paid.length}><span>已支付报名人详情</span><b>{paid.length} 人</b><small>查看已完成支付的报名人信息</small></button>
          <button type="button" className="summary-status-button unpaid-button" onClick={() => setSelectedStatus('unpaid')} disabled={!unpaid.length}><span>未支付报名人详情</span><b>{unpaid.length} 人</b><small>查看待支付或其他状态的报名人信息</small></button>
        </div>
        <p className="detail-muted summary-detail-hint">点击上方按钮后，将在弹窗中展示对应状态的报名人详细信息。</p>
      </section>
    </div>
    {selectedStatus && <div className="modal-backdrop enrollment-participant-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedStatus(null) }}>
      <section className="detail-modal enrollment-participant-modal" role="dialog" aria-modal="true" aria-labelledby="enrollment-participant-title">
        <div className="detail-head"><div><h3 id="enrollment-participant-title">{detail.summary.courseTitle || detail.summary.courseId} · {selectedTitle}</h3><p>共 {selectedItems.length} 人，以下为该状态下的报名信息</p></div><ModalCloseButton onClick={() => setSelectedStatus(null)} label="关闭报名人详情" /></div>
        {renderRows(selectedItems, selectedStatus === 'paid' ? '暂无已支付报名人' : '暂无未支付报名人')}
      </section>
    </div>}
  </>
}

function DataTable({ moduleKey, items, onOperate, onDetail, actionLabel = '处理', canOperate, showAction = true, secondaryActionLabel, onSecondary, canSecondary, selectable = false, selectedKeys = new Set<string>(), onToggleSelect, onToggleAll, busy = false }: { moduleKey: string; items: TableItem[]; onOperate: (item: TableItem) => void; onDetail?: (item: TableItem) => void; actionLabel?: RowActionLabel; canOperate?: (item: TableItem) => boolean; showAction?: boolean; secondaryActionLabel?: RowActionLabel; onSecondary?: (item: TableItem) => void; canSecondary?: (item: TableItem) => boolean; selectable?: boolean; selectedKeys?: Set<string>; onToggleSelect?: (item: TableItem, checked: boolean) => void; onToggleAll?: (items: TableItem[], checked: boolean) => void; busy?: boolean }) {
  if (!items.length) return <p className="empty">暂无数据，可通过 C 端提交报名、支付、开票或反馈来生成记录。</p>
  const preferred = moduleColumns[moduleKey] || []
  const available = Array.from(new Set(items.flatMap(item => Object.keys(item))))
  const columns = preferred.filter(key => available.includes(key))
  if (!columns.length) columns.push(...available.filter(key => Boolean(columnLabels[key])).slice(0, 8))
  if (!columns.length) columns.push(...available.slice(0, 8))
  const allSelected = selectable && items.length > 0 && items.every(item => selectedKeys.has(selectionKey(item)))
  return <div className="table-scroll"><table><thead><tr>{selectable && <th className="select-column"><input type="checkbox" aria-label="全选当前列表" checked={allSelected} onChange={event => onToggleAll?.(items, event.target.checked)} /></th>}{columns.map(key => <th key={key}>{displayTableColumnLabel(moduleKey, key)}</th>)}{showAction && <th className="action-column">操作</th>}</tr></thead><tbody>{items.map((item, index) => { const operationAllowed = canOperate ? canOperate(item) : true; const secondaryAllowed = canSecondary ? canSecondary(item) : true; const resolvedLabel = typeof actionLabel === 'function' ? actionLabel(item) : actionLabel; const resolvedSecondaryLabel = typeof secondaryActionLabel === 'function' ? secondaryActionLabel(item) : secondaryActionLabel; const key = selectionKey(item) || `${moduleKey}-${index}`; return <tr key={item.id || `${moduleKey}-${index}`}>{selectable && <td className="select-cell"><input type="checkbox" aria-label={`选择第 ${index + 1} 条`} checked={selectedKeys.has(key)} onChange={event => onToggleSelect?.(item, event.target.checked)} /></td>}{columns.map(key => <td key={key} title={formatTableValue(moduleKey, key, item[key])}>{formatTableValue(moduleKey, key, item[key])}</td>)}{showAction && <td className="action-cell"><div>{onDetail && <button type="button" disabled={busy} onClick={() => onDetail(item)}>查看详情</button>}{operationAllowed && <button type="button" disabled={busy} onClick={() => onOperate(item)}>{busy ? '处理中…' : resolvedLabel}</button>}{resolvedSecondaryLabel && onSecondary && secondaryAllowed && <button type="button" disabled={busy} onClick={() => onSecondary(item)}>{resolvedSecondaryLabel}</button>}</div></td>}</tr> })}</tbody></table></div>
}

function DetailPanel({ detail, onClose, onStudentEdit, onStudentStatus, onStudentGrant, onStudentDefault, onStudentRevoke, onStudentMerge, onStudentReload, busy = false }: { detail: { module: string; item: TableItem; proof?: TableItem | null; relatedOrder?: TableItem; intent?: 'view' | 'process' }; onClose: () => void; onStudentEdit?: (item: TableItem) => void; onStudentStatus?: (item: TableItem) => void; onStudentGrant?: (studentId: string) => void; onStudentDefault?: (studentId: string, userId: string) => void; onStudentRevoke?: (studentId: string, userId: string, username: string) => void; onStudentMerge?: (item: TableItem) => void; onStudentReload?: (studentId: string) => void; busy?: boolean }) {
  const item = detail.item
  if (detail.module === 'students') return <StudentProfileDetailPanel item={item} onClose={onClose} onEdit={onStudentEdit} onStatus={onStudentStatus} onGrant={onStudentGrant} onDefault={onStudentDefault} onRevoke={onStudentRevoke} onMerge={onStudentMerge} onReload={onStudentReload} busy={busy} />
  if (detail.module === 'enrollment-details') return <EnrollmentRecordDetailPanel item={item} onClose={onClose} />
  const relatedOrder = detail.relatedOrder
  const participants = Array.isArray(relatedOrder?.participants) ? relatedOrder.participants : Array.isArray(item.participants) ? item.participants : []
  const title = detail.module === 'enrollment-details' || detail.module === 'students' ? '报名明细详情' : '详情核对'
  const courseSource = relatedOrder || item
  const courseKeys = ['courseId', 'courseTitle', 'date', 'location', 'instructor'].filter(key => courseSource[key] !== undefined)
  const paymentKeys = ['id', 'participantCount', 'originalAmount', 'discount', 'amount', 'status', 'paymentMethod', 'paymentChannel', 'createdAt'].filter(key => (relatedOrder || item)[key] !== undefined)
  const otherKeys = Object.keys(item).filter(key => !['participants', 'paymentProof', 'paymentProofs', 'course', 'user', 'registrationTemplate', ...courseKeys, ...paymentKeys].includes(key) && item[key] !== undefined)
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title">
      <div className="detail-head"><div><h3 id="detail-modal-title">{title}</h3><p>{detail.module === 'orders' ? `订单 ${item.id}` : item.id || '当前记录'}</p></div><ModalCloseButton onClick={onClose} label="关闭详情" /></div>
      {courseKeys.length > 0 && <><h4>课程信息</h4><div className="detail-grid">{courseKeys.map(key => <div key={`course-${key}`}><small>{displayColumnLabel(key)}</small><span>{formatValue(courseSource[key])}</span></div>)}</div></>}
      {(detail.module === 'orders' || detail.module === 'enrollment-details' || detail.module === 'students') && <>
        <h4>报名人（{participants.length}）</h4>
        {participants.length ? <div className="participant-list">{participants.map((participant: TableItem, index: number) => <div className="participant-card" key={index}><b>报名人 {index + 1}</b><div className="participant-fields">{Object.entries(participant).map(([key, value]) => <span key={key}><small>{displayColumnLabel(key)}</small><b>{formatValue(value)}</b></span>)}</div></div>)}</div> : <p className="detail-muted">未返回报名人明细</p>}
        {paymentKeys.length > 0 && <><h4>费用与支付</h4><div className="detail-grid payment-detail-grid">{paymentKeys.map(key => <div key={`payment-${key}`}><small>{displayColumnLabel(key)}</small><span>{formatValue((relatedOrder || item)[key])}</span></div>)}</div></>}
        <h4>支付凭证</h4>
        {detail.proof ? <div className="proof-summary"><span className="proof-name">{detail.proof.originalName || '凭证文件'}</span><span className="proof-meta"><i className={`proof-status ${detail.proof.status || 'pending'}`}>{detail.proof.status || 'pending'}</i>{detail.proof.mimeType || '-'} · {formatValue(detail.proof.size)}</span></div> : <p className="detail-muted">暂无支付凭证</p>}
      </>}
      {otherKeys.length > 0 && <><h4>其他信息</h4><div className="detail-grid">{otherKeys.map(key => <div key={`other-${key}`}><small>{displayColumnLabel(key)}</small><span>{formatValue(item[key])}</span></div>)}</div></>}
    </section>
  </div>
}

function StudentProfileDetailPanel({ item, onClose, onEdit, onStatus, onGrant, onDefault, onRevoke, onMerge, onReload, busy = false }: { item: TableItem; onClose: () => void; onEdit?: (item: TableItem) => void; onStatus?: (item: TableItem) => void; onGrant?: (studentId: string) => void; onDefault?: (studentId: string, userId: string) => void; onRevoke?: (studentId: string, userId: string, username: string) => void; onMerge?: (item: TableItem) => void; onReload?: (studentId: string) => void; busy?: boolean }) {
  const relations = Array.isArray(item.accountRelations) ? item.accountRelations : []
  const enrollments = Array.isArray(item.enrollments) ? item.enrollments : []
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="detail-modal modal-with-footer" role="dialog" aria-modal="true" aria-labelledby="student-profile-title">
      <div className="detail-head"><div><h3 id="student-profile-title">学员档案详情</h3><p>{item.id}</p></div><ModalCloseButton onClick={onClose} label="关闭学员档案详情" /></div>
      <div className="modal-scroll student-profile-scroll">
      <h4>基础资料</h4><div className="detail-grid">{['name', 'phone', 'email', 'company', 'department', 'position', 'status', 'enrollmentCount', 'createdAt', 'updatedAt'].filter(key => item[key] !== undefined).map(key => <div key={key}><small>{displayColumnLabel(key)}</small><span>{formatValue(item[key])}</span></div>)}</div>
       <div className="section-action-row"><h4>授权账号（{relations.length}）</h4>{onGrant && <button type="button" disabled={busy || item.status === 'merged'} onClick={() => onGrant(String(item.id))}>授权账号</button>}</div>{relations.length ? <div className="participant-list">{relations.map((relation: TableItem) => <div key={relation.id || relation.userId}><b>{relation.username || relation.userId}</b><span>{relation.userName || '-'} · {relation.relationType || '其他'} · {relation.isDefault ? '默认报名人' : '普通关系'} · {relation.status || 'active'}</span><div className="detail-inline-actions"><button type="button" disabled={busy || relation.isDefault} onClick={() => onDefault?.(String(item.id), String(relation.userId))}>设为默认</button><button type="button" className="danger-button" disabled={busy} onClick={() => onRevoke?.(String(item.id), String(relation.userId), String(relation.username || relation.userId))}>解除关系</button></div></div>)}</div> : <p className="detail-muted">暂无授权账号</p>}
       <h4>报名履历（{enrollments.length}）</h4>{enrollments.length ? <div className="participant-list">{enrollments.map((enrollment: TableItem) => <div key={enrollment.id}><b>{enrollment.courseTitle || enrollment.courseId}</b><span>订单 {enrollment.orderId || '-'} · {enrollment.status || '-'} · 订单状态 {enrollment.orderStatus || '-'}</span><small>报名时间：{enrollment.registeredAt ? formatValue(enrollment.registeredAt) : '-'} · 模板 {enrollment.templateId || '-'} v{enrollment.templateVersion || '-'}</small></div>)}</div> : <p className="detail-muted">暂无报名履历</p>}
      </div>
       <div className="modal-actions">{onReload && <button type="button" className="query-button" disabled={busy} onClick={() => onReload(String(item.id))}>重新加载详情</button>}{onEdit && <button type="button" disabled={busy || item.status === 'merged'} onClick={() => onEdit(item)}>编辑资料</button>}{onStatus && <button type="button" className={item.status === 'active' ? 'danger-button' : 'primary'} disabled={busy || item.status === 'merged'} onClick={() => onStatus(item)}>{item.status === 'active' ? '停用档案' : item.status === 'inactive' ? '启用档案' : '已合并'}</button>}{onMerge && <button type="button" className="danger-button" disabled={busy || item.status === 'merged'} onClick={() => onMerge(item)}>合并到其他档案</button>}</div>
    </section>
  </div>
}

function EnrollmentRecordDetailPanel({ item, onClose }: { item: TableItem; onClose: () => void }) {
  const payload = item.formPayload && typeof item.formPayload === 'object' ? item.formPayload : {}
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="enrollment-record-title">
      <div className="detail-head"><div><h3 id="enrollment-record-title">报名履历详情</h3><p>{item.id}</p></div><ModalCloseButton onClick={onClose} label="关闭报名履历详情" /></div>
      <h4>学员与课程</h4><div className="detail-grid">{['name', 'phone', 'company', 'department', 'position', 'courseTitle', 'date', 'location', 'orderId', 'orderStatus', 'status', 'accountUsername', 'accountUserName', 'registeredAt', 'cancelledAt', 'templateId', 'templateVersion'].filter(key => item[key] !== undefined).map(key => <div key={key}><small>{displayColumnLabel(key)}</small><span>{formatValue(item[key])}</span></div>)}</div>
      <h4>当次报名表单快照</h4><div className="form-snapshot-grid">{Object.entries(payload).length ? Object.entries(payload).map(([key, value]) => <span key={key}><small>{displayColumnLabel(key)}</small><b>{formatValue(value)}</b></span>) : <p className="detail-muted">无表单字段</p>}</div>
    </section>
  </div>
}

function displayColumnLabel(key: string) {
  return columnLabels[key] || '其他字段'
}

function displayTableColumnLabel(moduleKey: string, key: string) {
  if (moduleKey === 'templates' && key === 'name') return '模板名称'
  if (moduleKey === 'templates' && key === 'courseNames') return '课程名称'
  if (moduleKey === 'templates' && key === 'courseCount') return '适用课程数'
  if (moduleKey === 'users' && key === 'courseCount') return '报名课程数'
  if (moduleKey === 'users' && key === 'role') return '用户角色'
  if (moduleKey === 'invoices' && key === 'title') return '公司名称'
  return columnLabels[key] || '其他信息'
}

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (value === null || value === undefined || value === '') return '-'
  if (Array.isArray(value)) {
    if (!value.length) return '无'
    return value.map(item => typeof item === 'object' && item !== null ? Object.entries(item as Record<string, unknown>).map(([key, entry]) => `${displayColumnLabel(key)}：${formatValue(entry)}`).join('，') : String(item)).join('、')
  }
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([key, entry]) => `${displayColumnLabel(key)}：${formatValue(entry)}`).join(' · ') || '-'
  return String(value)
}

function formatTableValue(moduleKey: string, key: string, value: unknown): string {
  if (moduleKey === 'templates' && key === 'fields' && Array.isArray(value)) {
    const fields = value as Array<Record<string, any>>
    return fields.length ? `${fields.length} 个字段：${fields.map(field => String(field.label || field.key || '')).filter(Boolean).join('、')}` : '暂无字段'
  }
  if (moduleKey === 'rules' && key === 'courseIds' && Array.isArray(value)) return value.length ? value.join('、') : '全部课程'
  if (key === 'participants' && Array.isArray(value)) return `${value.length} 位报名人`
  if (key === 'orderIds' && Array.isArray(value)) return value.length ? `${value.length} 个订单：${value.join('、')}` : '无关联订单'
  if (moduleKey === 'banners' && key === 'courseTitle' && !value) return '未绑定课程'
  return formatValue(value)
}

export default App
