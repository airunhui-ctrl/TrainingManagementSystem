import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { adminLogin, apiFetch, apiFetchBlob, apiUpload, API_BASE_URL } from './api'
import { authStorage } from './auth'

type Module = { key: string; label: string; endpoint?: string; editable?: boolean }
type NavGroup = { key: string; label: string; icon: string; moduleKeys: string[] }
type TableItem = Record<string, any>
type CourseOption = { id: string; title: string }
type TemplateOption = { id: string; name: string }
type TemplateField = { key: string; label: string; type: 'text' | 'phone' | 'select' | 'radio' | 'checkbox'; required: boolean; options?: string[] }
type TemplateForm = { id?: string; name: string; fields: TemplateField[] }
type BannerForm = { id?: string; title: string; courseId: string; sort: string; enabled: boolean; startsAt: string; endsAt: string }
type PaymentForm = { accountName: string; bankName: string; accountNo: string; qrCodeText: string; wechatQrImage: string; alipayQrImage: string; onlineWechatEnabled: boolean; onlineAlipayEnabled: boolean }
type RuleForm = { id?: string; minPeople: string; discountRate: string; courseIds: string; enabled: boolean }
type MessageForm = { id?: string; title: string; content: string; channel: string; enabled: boolean }
type ConfigForm = { key: string; value: string; description: string }
type PointsForm = { userId: string; userName: string; points: string; reason: string }
type FeedbackForm = { id: string; reply: string }
type ReviewState = { order: TableItem; proof: TableItem; imageUrl: string }
type EnrollmentSummaryDetailState = { summary: TableItem; items: TableItem[] }
type CourseForm = {
  id?: string
  title: string
  subtitle: string
  category: string
  date: string
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
  title: '', subtitle: '', category: '综合管理', date: '', location: '', instructor: '',
  price: '', originalPrice: '', specialPrice: '', capacity: '30', enrolled: '0', status: '报名中',
  registrationDeadline: '', registrationTemplateId: '', allowMultiParticipant: true, description: '', descriptionRichText: '', image: '',
})

const modules: Module[] = [
  { key: 'dashboard', label: '工作台' },
  { key: 'banners', label: 'Banner 管理', endpoint: '/admin/banners', editable: true },
  { key: 'courses', label: '课程管理', endpoint: '/courses', editable: true },
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
const TEMPLATE_FIELD_PAGE_SIZE = 4

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
const emptyMessageForm = (): MessageForm => ({ title: '', content: '', channel: '站内消息', enabled: true })
const emptyConfigForm = (): ConfigForm => ({ key: '', value: '', description: '' })
const emptyPointsForm = (): PointsForm => ({ userId: '', userName: '', points: '0', reason: '' })
const emptyFeedbackForm = (): FeedbackForm => ({ id: '', reply: '' })

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
  taxNo: '纳税人识别号', invoiceNo: '发票号码', remark: '备注', reply: '回复内容', channel: '通知渠道', sentCount: '发送数量',
  key: '配置项', value: '配置值', actor: '操作人', action: '操作类型', detail: '操作详情',
  accountName: '收款户名', bankName: '开户银行', accountNo: '银行账号', qrCodeText: '收款码',
  onlineWechatEnabled: '微信支付', onlineAlipayEnabled: '支付宝支付',
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
  invoices: ['id', 'userId', 'title', 'taxNo', 'email', 'status', 'invoiceNo', 'createdAt'],
  users: ['id', 'username', 'name', 'role', 'enabled', 'registeredAt', 'lastActiveAt', 'courseCount', 'previewCount', 'points'],
  rules: ['id', 'minPeople', 'discountRate', 'courseIds', 'enabled'],
  feedbacks: ['id', 'userId', 'category', 'content', 'status', 'reply', 'createdAt'],
  payment: ['accountName', 'bankName', 'accountNo', 'qrCodeText', 'onlineWechatEnabled', 'onlineAlipayEnabled'],
  readiness: [],
  messages: ['id', 'title', 'channel', 'enabled', 'sentCount'],
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
  if (active === 'courses') return { label: '课程状态', field: 'status', options: ['报名中', '名额紧张', '已结束', '已下架'].map(value => ({ value, label: value })) }
  if (active === 'banners') return { label: '启用状态', field: 'enabled', options: [{ value: 'true', label: '已启用' }, { value: 'false', label: '已停用' }] }
  if (active === 'templates') return { label: '适用课程', field: 'courseIds', options: courseOptions.map(course => ({ value: course.id, label: course.title })) }
  if (['enrollments', 'enrollment-details'].includes(active)) return { label: '关联课程', field: 'courseId', options: uniqueFilterOptions(items, 'courseId', 'courseTitle') }
  if (active === 'students') return { label: '档案状态', field: 'status', options: ['active', 'inactive', 'merged'].map(value => ({ value, label: value === 'active' ? '启用' : value === 'inactive' ? '停用' : '已合并' })) }
  if (active === 'orders') return { label: '订单状态', field: 'status', options: ['待支付', '待审核', '已支付', '已取消', '已退款'].map(value => ({ value, label: value })) }
  if (active === 'invoices') return { label: '开票状态', field: 'status', options: ['待处理', '已开票', '已驳回'].map(value => ({ value, label: value })) }
  if (active === 'users') return { label: '用户角色', field: 'role', options: [{ value: 'user', label: '普通用户' }, { value: 'admin', label: '管理员' }] }
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
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('123456')
  const [error, setError] = useState('')
  const login = async () => {
    try {
      const result = await adminLogin(username, password)
      if (result.user.role !== 'admin') throw new Error()
      authStorage.setTokens(result.accessToken, result.refreshToken)
      done()
    } catch { setError('账号或密码错误') }
  }
  return <main className="login"><section className="login-card"><b>六</b><h1>六边形培训管理端</h1><p>本地运营工作台 · 默认密码 123456</p><input value={username} onChange={event => setUsername(event.target.value)} placeholder="admin / operator" /><input value={password} onChange={event => setPassword(event.target.value)} type="password" placeholder="请输入密码" /><button className="primary" onClick={login}>登录管理端</button>{error && <small>{error}</small>}</section></main>
}

function App() {
  const [loggedIn, setLoggedIn] = useState(Boolean(authStorage.get()))
  const [active, setActive] = useState('dashboard')
  const [data, setData] = useState<any>(null)
  const [courseOptions, setCourseOptions] = useState<CourseOption[]>([])
  const [templateOptions, setTemplateOptions] = useState<TemplateOption[]>([])
  const [notice, setNotice] = useState('')
  const [tableKeyword, setTableKeyword] = useState('')
  const [queryKeyword, setQueryKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [auditActionFilter, setAuditActionFilter] = useState('')
  const [page, setPage] = useState(1)
  const [courseModalOpen, setCourseModalOpen] = useState(false)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [templateForm, setTemplateForm] = useState<TemplateForm>(emptyTemplateForm)
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
  const [reviewState, setReviewState] = useState<ReviewState | null>(null)
  const [reviewRemark, setReviewRemark] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [courseForm, setCourseForm] = useState<CourseForm>(emptyCourseForm)
  const [courseSubmitting, setCourseSubmitting] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [openNavGroup, setOpenNavGroup] = useState('')
  const loadVersion = useRef(0)
  const [selectedDetail, setSelectedDetail] = useState<{ module: string; item: TableItem; proof?: TableItem | null; relatedOrder?: TableItem; intent?: 'view' | 'process' } | null>(null)
  const [enrollmentSummaryDetail, setEnrollmentSummaryDetail] = useState<EnrollmentSummaryDetailState | null>(null)
  const current = useMemo(() => modules.find(item => item.key === active)!, [active])
  const activeNavGroup = useMemo(() => navGroups.find(group => group.moduleKeys.includes(active)), [active])

  const flash = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 1800) }
  const navigate = (moduleKey: string) => { setActive(moduleKey); setSidebarOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const load = async (targetPage = page, keyword = queryKeyword, status = statusFilter) => {
    const version = ++loadVersion.current
    const commit = (value: any) => { if (version === loadVersion.current) setData(value) }
    if (active === 'dashboard') { commit(await apiFetch('/admin/dashboard')); return }
    if (current.endpoint) {
      const serverFilterParam = active === 'courses' || active === 'orders' || active === 'invoices' || active === 'feedbacks' || active === 'enrollment-details' || active === 'students' ? 'status' : active === 'users' ? 'role' : ''
      const filterQuery = serverFilterParam && status ? `&${serverFilterParam}=${encodeURIComponent(status)}` : ''
      const params = serverPagedModules.has(active)
        ? `?keyword=${encodeURIComponent(keyword)}${filterQuery}&page=${targetPage}&pageSize=${PAGE_SIZE}`
        : active === 'audits' && auditActionFilter ? `?action=${encodeURIComponent(auditActionFilter)}` : ''
      if (active === 'courses') {
        const [courseData, templateData] = await Promise.all([
          apiFetch(current.endpoint + params),
          apiFetch<{ items?: TableItem[] }>('/admin/templates'),
        ])
        commit(courseData)
        if (version === loadVersion.current) setTemplateOptions(Array.isArray(templateData?.items) ? templateData.items.map(item => ({ id: String(item.id), name: String(item.name || item.id) })) : [])
      } else if (active === 'banners' || active === 'templates' || active === 'rules') {
        const [bannerData, courseData] = await Promise.all([
          apiFetch(`${current.endpoint}${params}`),
          apiFetch<{ items?: CourseOption[] }>('/courses?page=1&pageSize=100'),
        ])
        commit(bannerData)
        if (version === loadVersion.current) setCourseOptions(Array.isArray(courseData?.items) ? courseData.items.map(item => ({ id: String(item.id), title: String(item.title) })) : [])
      } else {
        commit(await apiFetch(`${current.endpoint}${params}`))
      }
    }
  }

  useEffect(() => {
    loadVersion.current += 1; setData(null); setCourseModalOpen(false); setTemplateModalOpen(false); setBannerModalOpen(false); setPaymentModalOpen(false); setRuleModalOpen(false); setMessageModalOpen(false); setConfigModalOpen(false); setPointsModalOpen(false); setFeedbackModalOpen(false); setCourseForm(emptyCourseForm()); setTemplateForm(emptyTemplateForm()); setBannerForm(emptyBannerForm()); setPaymentForm(emptyPaymentForm()); setRuleForm(emptyRuleForm()); setMessageForm(emptyMessageForm()); setConfigForm(emptyConfigForm()); setPointsForm(emptyPointsForm()); setFeedbackForm(emptyFeedbackForm()); setSelectedDetail(null); setEnrollmentSummaryDetail(null); setReviewState(null); setReviewRemark(''); setTableKeyword(''); setQueryKeyword(''); setStatusFilter(''); setAuditActionFilter(''); setPage(1)
  }, [active])
  useEffect(() => { if (loggedIn) load().catch((error) => flash(error instanceof Error ? error.message : '加载失败，请重新登录')) }, [active, loggedIn, page, queryKeyword, statusFilter, auditActionFilter])
  useEffect(() => { if (activeNavGroup) setOpenNavGroup(activeNavGroup.key) }, [activeNavGroup])

  const openCourseEditor = (item?: TableItem) => {
    setCourseForm(item ? {
      id: item.id,
      title: String(item.title || ''), subtitle: String(item.subtitle || ''), category: String(item.category || '综合管理'),
      date: String(item.date || ''), location: String(item.location || ''), instructor: String(item.instructor || ''),
      price: String(item.price ?? ''), originalPrice: String(item.originalPrice ?? item.price ?? ''), specialPrice: String(item.specialPrice ?? ''),
      capacity: String(item.capacity ?? 30), enrolled: String(item.enrolled ?? 0), status: String(item.status || '报名中'),
      registrationDeadline: String(item.registrationDeadline || ''), registrationTemplateId: String(item.registrationTemplateId || templateOptions[0]?.id || ''), allowMultiParticipant: item.allowMultiParticipant !== false,
      description: String(item.description || ''), descriptionRichText: String(item.descriptionRichText || plainTextToRichText(String(item.description || ''))), image: String(item.image || ''),
    } : emptyCourseForm())
    setCourseModalOpen(true)
  }

  const updateCourseField = <K extends keyof CourseForm>(key: K, value: CourseForm[K]) => setCourseForm(currentForm => ({ ...currentForm, [key]: value }))
  const uploadCourseImage = async (file: File) => {
    if (!file.type.startsWith('image/')) return flash('请选择图片文件')
    if (file.size > 5 * 1024 * 1024) return flash('课程图片不能超过 5MB')
    try { const result = await apiUpload<{ url: string }>('/admin/uploads/course-image', file); updateCourseField('image', result.url); flash('课程图片已上传') } catch (error) { flash(error instanceof Error ? error.message : '课程图片上传失败') }
  }
  const uploadPaymentQr = async (channel: 'wechat' | 'alipay', file: File) => {
    if (!file.type.startsWith('image/')) return flash('请选择图片文件')
    if (file.size > 5 * 1024 * 1024) return flash('收款码图片不能超过 5MB')
    try {
      const result = await apiUpload<{ url: string }>(`/admin/uploads/payment-qr/${channel}`, file)
      setPaymentForm(current => ({ ...current, [channel === 'wechat' ? 'wechatQrImage' : 'alipayQrImage']: result.url }))
      flash(`${channel === 'wechat' ? '微信' : '支付宝'}收款码已上传`)
    } catch (error) { flash(error instanceof Error ? error.message : '收款码上传失败') }
  }

  const openTemplateEditor = (item?: TableItem) => {
    const fields = Array.isArray(item?.fields) ? item.fields : defaultTemplateFields
    setTemplateForm({ id: item?.id ? String(item.id) : undefined, name: String(item?.name || ''), fields: fields.map((field: any) => ({ key: String(field.key || ''), label: String(field.label || ''), type: field.type || 'text', required: field.required === true, options: Array.isArray(field.options) ? field.options.map(String) : [] })) })
    setTemplateModalOpen(true)
  }
  const nextBannerSort = () => String(Math.max(0, ...(Array.isArray(data?.items) ? data.items.map((item: TableItem) => Number(item.sort) || 0) : [])) + 1)
  const openBannerEditor = (item?: TableItem) => { setBannerForm(item ? { id: String(item.id), title: String(item.title || ''), courseId: String(item.courseId || ''), sort: String(item.sort ?? 0), enabled: item.enabled !== false, startsAt: String(item.startsAt || ''), endsAt: String(item.endsAt || '') } : { ...emptyBannerForm(nextBannerSort()), courseId: courseOptions[0]?.id || '' }); setBannerModalOpen(true) }
  const openPaymentEditor = (item?: TableItem) => { setPaymentForm({ ...emptyPaymentForm(), ...(item || {}) }); setPaymentModalOpen(true) }
  const openRuleEditor = (item?: TableItem) => { setRuleForm(item ? { id: String(item.id), minPeople: String(item.minPeople ?? 2), discountRate: String(item.discountRate ?? 0.9), courseIds: Array.isArray(item.courseIds) ? item.courseIds.join(', ') : '', enabled: item.enabled !== false } : emptyRuleForm()); setRuleModalOpen(true) }
  const openMessageEditor = (item?: TableItem) => { setMessageForm(item ? { id: String(item.id), title: String(item.title || ''), content: String(item.content || ''), channel: String(item.channel || '站内消息'), enabled: item.enabled !== false } : emptyMessageForm()); setMessageModalOpen(true) }
  const openConfigEditor = (item?: TableItem) => { setConfigForm(item ? { key: String(item.key || ''), value: String(item.value || ''), description: String(item.description || '') } : emptyConfigForm()); setConfigModalOpen(true) }
  const openPointsEditor = (item?: TableItem) => { setPointsForm(item ? { userId: String(item.userId || ''), userName: String(item.userName || ''), points: '0', reason: '' } : emptyPointsForm()); setPointsModalOpen(true) }
  const openFeedbackEditor = (item: TableItem) => { setFeedbackForm({ id: String(item.id || ''), reply: String(item.reply || '') }); setFeedbackModalOpen(true) }
  const updateTemplateField = (index: number, patch: Partial<TemplateField>) => setTemplateForm(current => ({ ...current, fields: current.fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field) }))
  const saveTemplate = async () => {
    const fields = templateForm.fields.map(field => ({ ...field, key: field.key.trim(), label: field.label.trim(), options: ['select', 'radio', 'checkbox'].includes(field.type) ? (field.options || []).map(option => option.trim()).filter(Boolean) : undefined }))
    if (!templateForm.name.trim() || !fields.length || fields.some(field => !field.key || !field.label)) return flash('请完整填写报名模板名称和字段')
    if (new Set(fields.map(field => field.key)).size !== fields.length) return flash('字段标识不能重复')
    if (fields.some(field => ['select', 'radio', 'checkbox'].includes(field.type) && !field.options?.length)) return flash('选择类字段至少需要一个选项')
    try {
      if (!templateForm.name.trim()) return flash('请填写报名模板名称')
      await apiFetch(templateForm.id ? `/admin/templates/${templateForm.id}` : '/admin/templates', { method: templateForm.id ? 'PATCH' : 'POST', body: JSON.stringify({ name: templateForm.name.trim(), fields }) })
      setTemplateModalOpen(false); flash('报名模板已保存'); await load(1, queryKeyword)
    } catch (error) { flash(error instanceof Error ? error.message : '报名模板保存失败') }
  }
  const saveBanner = async () => { if (!bannerForm.title.trim() || !bannerForm.courseId.trim()) return flash('请填写 Banner 标题并选择关联课程'); try { await apiFetch('/admin/banners', { method: 'POST', body: JSON.stringify({ ...bannerForm, title: bannerForm.title.trim(), courseId: bannerForm.courseId.trim(), sort: bannerForm.id ? Number(bannerForm.sort || 0) : Number(nextBannerSort()) }) }); setBannerModalOpen(false); flash('Banner 已保存'); await load(1, queryKeyword) } catch (error) { flash(error instanceof Error ? error.message : 'Banner 保存失败') } }
  const savePayment = async () => { if (!paymentForm.accountName.trim() || !paymentForm.bankName.trim() || !paymentForm.accountNo.trim()) return flash('请填写完整收款信息'); try { await apiFetch('/admin/payment-settings', { method: 'PATCH', body: JSON.stringify(paymentForm) }); setPaymentModalOpen(false); flash('支付设置已保存'); await load(1, queryKeyword) } catch (error) { flash(error instanceof Error ? error.message : '支付设置保存失败') } }
  const saveRule = async () => { const minPeople = Number(ruleForm.minPeople); const discountRate = Number(ruleForm.discountRate); if (!Number.isInteger(minPeople) || minPeople < 1 || !Number.isFinite(discountRate) || discountRate < 0 || discountRate > 1) return flash('请填写有效的人数门槛和 0~1 折扣比例'); try { await apiFetch('/admin/discount-rules', { method: 'POST', body: JSON.stringify({ id: ruleForm.id, minPeople, discountRate, courseIds: ruleForm.courseIds.split(',').map(item => item.trim()).filter(Boolean), enabled: ruleForm.enabled }) }); setRuleModalOpen(false); flash('优惠规则已保存'); await load(1, queryKeyword) } catch (error) { flash(error instanceof Error ? error.message : '优惠规则保存失败') } }
  const deleteBanner = async () => { if (!bannerForm.id) return; try { await apiFetch(`/admin/banners/${bannerForm.id}`, { method: 'DELETE' }); setBannerModalOpen(false); flash('Banner 已删除'); await load(1, queryKeyword) } catch (error) { flash(error instanceof Error ? error.message : 'Banner 删除失败') } }

  const saveMessage = async () => { if (!messageForm.title.trim() || !messageForm.content.trim()) return flash('请填写消息标题和内容'); try { await apiFetch(messageForm.id ? `/admin/messages/${messageForm.id}` : '/admin/messages', { method: messageForm.id ? 'PATCH' : 'POST', body: JSON.stringify({ ...messageForm, title: messageForm.title.trim(), content: messageForm.content.trim() }) }); setMessageModalOpen(false); flash('消息已保存'); await load(1, queryKeyword) } catch (error) { flash(error instanceof Error ? error.message : '消息保存失败') } }
  const saveConfig = async () => { if (!configForm.key.trim() || !configForm.value.trim()) return flash('请填写配置键和值'); try { await apiFetch(`/admin/configs/${encodeURIComponent(configForm.key.trim())}`, { method: 'PUT', body: JSON.stringify({ value: configForm.value.trim(), description: configForm.description.trim() }) }); setConfigModalOpen(false); flash('系统配置已保存'); await load(1, queryKeyword) } catch (error) { flash(error instanceof Error ? error.message : '系统配置保存失败') } }
  const savePoints = async () => { const points = Number(pointsForm.points); if (!pointsForm.userId || !Number.isInteger(points) || points === 0 || !pointsForm.reason.trim()) return flash('请输入非零整数积分和调整原因'); try { await apiFetch(`/admin/points/${encodeURIComponent(pointsForm.userId)}/adjust`, { method: 'POST', body: JSON.stringify({ points, reason: pointsForm.reason.trim() }) }); setPointsModalOpen(false); flash('积分已调整'); await load(1, queryKeyword) } catch (error) { flash(error instanceof Error ? error.message : '积分调整失败') } }
  const saveFeedback = async () => { if (!feedbackForm.id || !feedbackForm.reply.trim()) return flash('请填写回复内容'); try { await apiFetch(`/admin/feedbacks/${feedbackForm.id}/resolve`, { method: 'POST', body: JSON.stringify({ reply: feedbackForm.reply.trim() }) }); setFeedbackModalOpen(false); flash('反馈已处理'); await load(1, queryKeyword) } catch (error) { flash(error instanceof Error ? error.message : '反馈处理失败') } }

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
    setReviewSubmitting(true)
    try {
      await apiFetch(`/admin/orders/${encodeURIComponent(reviewState.order.id)}/review`, { method: 'POST', body: JSON.stringify({ approved, remark: remark || '审核通过' }) })
      setReviewSubmitting(false)
      closeReview()
      flash(approved ? '支付凭证已审核通过' : '支付凭证已驳回')
      await load(1, queryKeyword)
    } catch (error) { flash(error instanceof Error ? error.message : '支付凭证审核失败') } finally { setReviewSubmitting(false) }
  }

  const saveCourse = async () => {
    const form = courseForm
    const numericFields = { price: Number(form.price), originalPrice: Number(form.originalPrice), specialPrice: form.specialPrice === '' ? null : Number(form.specialPrice), capacity: Number(form.capacity), enrolled: Number(form.enrolled) }
    if (!form.title.trim() || !form.category.trim() || !form.date.trim() || !form.location.trim() || !form.instructor.trim()) return flash('请完整填写课程基础信息')
    if ([numericFields.price, numericFields.originalPrice, numericFields.capacity, numericFields.enrolled].some(value => !Number.isFinite(value)) || (numericFields.specialPrice !== null && !Number.isFinite(numericFields.specialPrice))) return flash('请填写有效的价格、名额和报名人数')
    if (numericFields.capacity < numericFields.enrolled) return flash('课程名额不能少于已报名人数')
    setCourseSubmitting(true)
    try {
      const descriptionRichText = form.descriptionRichText.trim() || plainTextToRichText(form.description)
      const payload = { ...form, title: form.title.trim(), subtitle: form.subtitle.trim(), category: form.category.trim(), date: form.date.trim(), location: form.location.trim(), instructor: form.instructor.trim(), registrationDeadline: form.registrationDeadline.trim() || null, description: richTextToPlainText(descriptionRichText), descriptionRichText, ...numericFields }
      await apiFetch(form.id ? `/admin/courses/${form.id}` : '/admin/courses', { method: form.id ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      setCourseModalOpen(false); setCourseForm(emptyCourseForm()); flash(form.id ? '课程已更新' : '课程已创建'); await load(1, queryKeyword)
    } catch (error) { flash(error instanceof Error ? error.message : '课程保存失败') } finally { setCourseSubmitting(false) }
  }

  const deleteCourse = async () => {
    if (!courseForm.id) return
    try { await apiFetch(`/admin/courses/${courseForm.id}`, { method: 'DELETE' }); setCourseModalOpen(false); setCourseForm(emptyCourseForm()); flash('课程已删除'); await load(1, queryKeyword) } catch (error) { flash(error instanceof Error ? error.message : '课程删除失败') }
  }

  const operate = async (item: TableItem) => {
    if (active === 'orders') {
      if (item.status === '待审核') return openOrderReview(item)
      if (item.status === '已支付') await apiFetch(`/admin/orders/${item.id}/refund`, { method: 'POST' })
      else return flash('只有待审核订单可以审核支付凭证')
    } else if (active === 'invoices') await apiFetch(`/admin/invoices/${item.id}/process`, { method: 'POST', body: JSON.stringify({ approved: true, invoiceNo: `MOCK-${Date.now()}` }) })
    else if (active === 'users') await apiFetch(`/admin/users/${item.id}/reset-password`, { method: 'POST' })
    else if (active === 'banners') return openBannerEditor(item)
    else if (active === 'courses') return openCourseEditor(item)
    else if (active === 'enrollments') return openEnrollmentSummaryDetail(item)
    else if (active === 'templates') return openTemplateEditor(item)
    else if (active === 'rules') return openRuleEditor(item)
    else if (active === 'payment') return openPaymentEditor(item)
    else if (active === 'enrollment-details' || active === 'students') return openDetail(item, 'process')
    else if (active === 'feedbacks') return openFeedbackEditor(item)
    else if (active === 'messages') return openMessageEditor(item)
    else if (active === 'configs') return openConfigEditor(item)
    else if (active === 'points') return openPointsEditor(item)
    else return flash('已打开详情视图')
    flash('操作成功'); load()
  }

  const secondaryOperate = async (item: TableItem) => {
    if (active === 'users') await apiFetch(`/admin/users/${item.id}/enabled`, { method: 'POST', body: JSON.stringify({ enabled: !item.enabled }) })
    else if (active === 'banners') await apiFetch('/admin/banners', { method: 'POST', body: JSON.stringify({ ...item, enabled: !item.enabled }) })
    else if (active === 'invoices') await apiFetch(`/admin/invoices/${item.id}/process`, { method: 'POST', body: JSON.stringify({ approved: false, invoiceNo: '' }) })
    else return
    flash('状态已更新'); load()
  }

  const openDetail = async (item: TableItem, intent: 'view' | 'process' = 'view') => {
    if (active === 'students') {
      try {
        const profile = await apiFetch<TableItem>(`/admin/student-profiles/${encodeURIComponent(item.id)}`)
        setSelectedDetail({ module: active, item: profile, intent })
      } catch (error) { flash(error instanceof Error ? error.message : '学员档案加载失败') }
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

  const openEnrollmentSummaryDetail = async (summary: TableItem) => {
    try {
      const result = await apiFetch<{ items: TableItem[] }>('/admin/enrollments')
      // 汇总接口将“已取消”排除在有效报名人数外，详情也保持同一统计口径。
      const items = (result.items || []).filter(item => String(item.courseId) === String(summary.courseId) && item.paymentStatus !== '已取消')
      setEnrollmentSummaryDetail({ summary, items })
    } catch (error) { flash(error instanceof Error ? error.message : '报名详情加载失败') }
  }

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
  const actionLabel = active === 'enrollments' ? '查看详情' : ['courses', 'templates', 'banners', 'payment', 'rules', 'messages', 'configs', 'points'].includes(active) ? (active === 'templates' ? '编辑模板' : active === 'points' ? '调整积分' : '编辑') : active === 'orders' ? '审核 / 退款' : active === 'users' ? '重置密码' : active === 'feedbacks' ? '回复处理' : '处理'
  const secondaryActionLabel = active === 'users' || active === 'banners' ? '启用 / 禁用' : active === 'invoices' ? '驳回' : undefined
  const exportCurrent = () => {
    if (active === 'students') {
      apiFetch<{ items: TableItem[] }>('/admin/student-profiles/export').then(result => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(result.items || [], null, 2)], { type: 'application/json' }))
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'student-profiles.json'; anchor.click(); URL.revokeObjectURL(url)
      }).catch(error => flash(error instanceof Error ? error.message : '导出学员档案失败'))
      return
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(pagedItems, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${active}-page-${page}.json`; anchor.click(); URL.revokeObjectURL(url)
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
    <main>
      <header>
        <div className="header-main"><button className="menu-toggle" type="button" aria-label="打开导航" onClick={() => setSidebarOpen(true)}>☰</button><div><h1>{current.label}</h1><p>培训管理系统 · SQLite 数据持久化运行</p></div></div>
        <button className="logout-button" type="button" title="退出登录" onClick={() => { authStorage.clear(); setLoggedIn(false) }}><span>退出登录</span></button>
      </header>
      {active === 'dashboard' ? <Dashboard data={data} onNavigate={navigate} /> : <section className="panel data-panel list-page">
        <nav className="module-breadcrumb" aria-label="页面导航"><span>六边形培训管理端</span><b>›</b><span>{activeNavGroup?.label || '管理导航'}</span><b>›</b><strong>{current.label}</strong></nav>
        {active === 'readiness' ? <IntegrationReadinessPanel data={data} onRefresh={() => load()} /> : <>
        <section className="list-section search-section" aria-label="搜索条件">
          <div className="search-toolbar">
            <input value={tableKeyword} onChange={event => { setTableKeyword(event.target.value); setPage(1) }} onKeyDown={event => { if (event.key === 'Enter') { setPage(1); setQueryKeyword(tableKeyword.trim()); load(1, tableKeyword.trim(), statusFilter) } }} placeholder="搜索当前列表" />
            {filterDefinition && <select aria-label={`${filterDefinition.label}筛选`} value={statusFilter} onChange={event => { setPage(1); setStatusFilter(event.target.value) }}><option value="">{filterDefinition.label}：全部</option>{filterDefinition.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}
            {active === 'audits' && <select aria-label="审计操作类型筛选" value={auditActionFilter} onChange={event => { setAuditActionFilter(event.target.value); setPage(1) }}><option value="">操作类型：全部</option>{auditActionOptions.map(action => <option key={action} value={action}>{action}</option>)}</select>}
            <div className="search-actions"><button className="reset-button" onClick={() => { setTableKeyword(''); setQueryKeyword(''); setStatusFilter(''); setAuditActionFilter(''); setPage(1); load(1, '', '') }}>重置</button><button className="query-button" onClick={() => { setPage(1); setQueryKeyword(tableKeyword.trim()); load(1, tableKeyword.trim(), statusFilter) }}>查询</button></div>
          </div>
        </section>
        <section className="list-section action-section" aria-label="功能操作">
          <div className="action-toolbar"><button onClick={exportCurrent}>导出当前页</button>{createAction}</div>
        </section>
         {selectedDetail && <DetailPanel detail={selectedDetail} onClose={() => setSelectedDetail(null)} />}
         <section className="list-section table-section" aria-label="数据列表">
           <DataTable moduleKey={active} items={pagedItems} onOperate={operate} onDetail={['orders', 'invoices', 'enrollment-details', 'students', 'feedbacks'].includes(active) ? openDetail : undefined} actionLabel={actionLabel} secondaryActionLabel={secondaryActionLabel} onSecondary={secondaryActionLabel ? secondaryOperate : undefined} />
         </section>
         <div className="list-footer"><div className="pagination"><span>共 {totalItems} 条，第 {Math.min(page, totalPages)} / {totalPages} 页（每页 {PAGE_SIZE} 条）</span><div><button disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>上一页</button><button disabled={page >= totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>下一页</button></div></div></div>
         {active === 'enrollments' && <EnrollmentSummaryChart items={items} />}
         </>}
       </section>}
      {courseModalOpen && <CourseModal form={courseForm} templates={templateOptions} submitting={courseSubmitting} onChange={updateCourseField} onUploadImage={uploadCourseImage} onClose={() => setCourseModalOpen(false)} onSave={saveCourse} onDelete={deleteCourse} />}
      {templateModalOpen && <TemplateModal form={templateForm} onChange={setTemplateForm} onFieldChange={updateTemplateField} onClose={() => setTemplateModalOpen(false)} onSave={saveTemplate} />}
      {bannerModalOpen && <BannerModal form={bannerForm} courses={courseOptions} onChange={setBannerForm} onClose={() => setBannerModalOpen(false)} onSave={saveBanner} onDelete={deleteBanner} />}
      {paymentModalOpen && <PaymentModal form={paymentForm} onChange={setPaymentForm} onUploadQr={uploadPaymentQr} onClose={() => setPaymentModalOpen(false)} onSave={savePayment} />}
      {ruleModalOpen && <RuleModal form={ruleForm} courses={courseOptions} onChange={setRuleForm} onClose={() => setRuleModalOpen(false)} onSave={saveRule} />}
      {messageModalOpen && <MessageModal form={messageForm} onChange={setMessageForm} onClose={() => setMessageModalOpen(false)} onSave={saveMessage} />}
      {configModalOpen && <ConfigModal form={configForm} onChange={setConfigForm} onClose={() => setConfigModalOpen(false)} onSave={saveConfig} />}
      {pointsModalOpen && <PointsModal form={pointsForm} onChange={setPointsForm} onClose={() => setPointsModalOpen(false)} onSave={savePoints} />}
      {feedbackModalOpen && <FeedbackModal form={feedbackForm} onChange={setFeedbackForm} onClose={() => setFeedbackModalOpen(false)} onSave={saveFeedback} />}
      {enrollmentSummaryDetail && <EnrollmentSummaryDetailPanel detail={enrollmentSummaryDetail} onClose={() => setEnrollmentSummaryDetail(null)} />}
      {reviewState && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeReview() }}>
        <section className="detail-modal review-modal" role="dialog" aria-modal="true" aria-labelledby="review-modal-title">
          <div className="detail-head"><div><h3 id="review-modal-title">审核线下支付凭证</h3><p>订单 {reviewState.order.id} · {reviewState.order.courseTitle || reviewState.order.courseId || '培训订单'}</p></div><button type="button" onClick={closeReview} disabled={reviewSubmitting}>关闭</button></div>
          <div className="review-meta"><span>凭证文件：{reviewState.proof.originalName || '支付凭证'}</span><span>状态：{reviewState.proof.status || 'pending'}</span><span>{reviewState.proof.mimeType || '-'} · {reviewState.proof.size || 0} bytes</span></div>
          {reviewState.imageUrl ? <img className="payment-proof-preview" src={reviewState.imageUrl} alt="线下支付凭证预览" /> : <p className="detail-muted">当前凭证不是可直接预览的图片，请通过接口下载后核验。</p>}
          <label className="review-remark-field">审核备注<textarea value={reviewRemark} onChange={event => setReviewRemark(event.target.value)} placeholder="通过可填写到账信息；驳回时必须填写原因" /></label>
          <div className="modal-actions"><button type="button" onClick={closeReview} disabled={reviewSubmitting}>取消</button><button type="button" className="danger-button" onClick={() => submitOrderReview(false)} disabled={reviewSubmitting}>驳回凭证</button><button type="button" className="primary" onClick={() => submitOrderReview(true)} disabled={reviewSubmitting}>{reviewSubmitting ? '提交中…' : '审核通过'}</button></div>
        </section>
      </div>}
      {notice && <div className="notice">{notice}</div>}
    </main>
  </div>
}

function CourseModal({ form, templates, submitting, onChange, onUploadImage, onClose, onSave, onDelete }: { form: CourseForm; templates: TemplateOption[]; submitting: boolean; onChange: <K extends keyof CourseForm>(key: K, value: CourseForm[K]) => void; onUploadImage: (file: File) => Promise<void>; onClose: () => void; onSave: () => void; onDelete: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="course-modal" role="dialog" aria-modal="true" aria-labelledby="course-modal-title">
      <div className="modal-head"><div><h2 id="course-modal-title">{form.id ? '编辑课程' : '新增课程'}</h2><p>维护课程基础信息、排课信息、价格和报名规则</p></div><button type="button" className="modal-close" onClick={onClose} aria-label="关闭">×</button></div>
      <div className="course-form-grid">
        <label>课程标题<input value={form.title} onChange={event => onChange('title', event.target.value)} placeholder="请输入课程标题" /></label>
        <label>课程副标题<input value={form.subtitle} onChange={event => onChange('subtitle', event.target.value)} placeholder="请输入课程副标题" /></label>
        <label>课程分类<input value={form.category} onChange={event => onChange('category', event.target.value)} placeholder="如：人才管理" /></label>
        <label>课程状态<select value={form.status} onChange={event => onChange('status', event.target.value)}><option value="报名中">报名中</option><option value="名额紧张">名额紧张</option><option value="已结束">已结束</option><option value="已下架">已下架</option></select></label>
        <label>关联报名模板<select required value={form.registrationTemplateId} onChange={event => onChange('registrationTemplateId', event.target.value)}><option value="">请选择已创建的报名模板</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select><small className="field-hint">一个课程必须选择一个模板；同一模板可复用于多个课程</small></label>
        <label className="wide-field">上课时间<input value={form.date} onChange={event => onChange('date', event.target.value)} placeholder="如：2026-08-06 09:00 - 08-08 17:00" /></label>
        <label>上课地点<input value={form.location} onChange={event => onChange('location', event.target.value)} placeholder="请输入上课地点" /></label>
        <label>讲师<input value={form.instructor} onChange={event => onChange('instructor', event.target.value)} placeholder="请输入讲师" /></label>
        <label className="wide-field course-image-field">课程图片<input type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file) void onUploadImage(file); event.target.value = '' }} /><small className="field-hint">用于 C 端首页课程卡片、首页轮播和课程详情顶部；建议上传 16:9 图片，单张不超过 5MB。</small>{form.image && <img className="course-image-preview" src={assetUrl(form.image)} alt="课程图片预览" />}</label>
        <label>课程原价<input type="number" min="0" value={form.originalPrice} onChange={event => onChange('originalPrice', event.target.value)} /></label>
        <label>课程售价<input type="number" min="0" value={form.price} onChange={event => onChange('price', event.target.value)} /></label>
        <label>课程特价<input type="number" min="0" value={form.specialPrice} onChange={event => onChange('specialPrice', event.target.value)} placeholder="可选" /></label>
        <label>课程名额<input type="number" min="0" value={form.capacity} onChange={event => onChange('capacity', event.target.value)} /></label>
        <label>已报名人数<input type="number" min="0" value={form.enrolled} onChange={event => onChange('enrolled', event.target.value)} /></label>
        <label>报名截止时间<input value={form.registrationDeadline} onChange={event => onChange('registrationDeadline', event.target.value)} placeholder="可选，如：2026-08-01 23:59" /></label>
        <label className="checkbox-field modal-checkbox"><input type="checkbox" checked={form.allowMultiParticipant} onChange={event => onChange('allowMultiParticipant', event.target.checked)} /><span>支持多人报名</span></label>
        <div className="wide-field rich-text-field"><label>课程简介</label><RichTextEditor value={form.descriptionRichText} onChange={value => onChange('descriptionRichText', value)} /></div>
      </div>
      <div className="modal-actions"><button type="button" onClick={onClose}>取消</button>{form.id && <button type="button" className="danger-button" onClick={onDelete} disabled={submitting}>删除课程</button>}<button type="button" className="primary" onClick={onSave} disabled={submitting}>{submitting ? '保存中…' : '保存课程'}</button></div>
    </section>
  </div>
}

function BannerModal({ form, courses, onChange, onClose, onSave, onDelete }: { form: BannerForm; courses: CourseOption[]; onChange: (form: BannerForm) => void; onClose: () => void; onSave: () => void; onDelete: () => void }) {
  return <SimpleModal title={form.id ? '编辑 Banner' : '新增 Banner'} description="配置宣传位内容、关联课程和展示时间" onClose={onClose}>
    <div className="course-form-grid"><label>Banner 标题<input value={form.title} onChange={event => onChange({ ...form, title: event.target.value })} placeholder="请输入宣传位标题" /></label><label>关联课程<select value={form.courseId} onChange={event => onChange({ ...form, courseId: event.target.value })}><option value="">请选择课程</option>{courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label><label>排序<span className="field-hint">新增 Banner 默认排在现有列表末尾</span><input type="number" min="0" value={form.sort} disabled={!form.id} onChange={event => onChange({ ...form, sort: event.target.value })} /></label><label className="checkbox-field modal-checkbox"><input type="checkbox" checked={form.enabled} onChange={event => onChange({ ...form, enabled: event.target.checked })} /><span>启用展示</span></label><label>开始时间<input value={form.startsAt} onChange={event => onChange({ ...form, startsAt: event.target.value })} placeholder="可选，如 2026-07-01" /></label><label>结束时间<input value={form.endsAt} onChange={event => onChange({ ...form, endsAt: event.target.value })} placeholder="可选，如 2026-12-31" /></label></div>
    <div className="modal-actions"><button type="button" onClick={onClose}>取消</button>{form.id && <button type="button" className="danger-button" onClick={onDelete}>删除 Banner</button>}<button type="button" className="primary" onClick={onSave}>保存 Banner</button></div>
  </SimpleModal>
}

function IntegrationReadinessPanel({ data, onRefresh }: { data: any; onRefresh: () => void }) {
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

function PaymentModal({ form, onChange, onUploadQr, onClose, onSave }: { form: PaymentForm; onChange: (form: PaymentForm) => void; onUploadQr: (channel: 'wechat' | 'alipay', file: File) => void; onClose: () => void; onSave: () => void }) {
  const qrField = (channel: 'wechat' | 'alipay', label: string, value: string) => <label className="wide-field course-image-field">{label}收款码图片<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file) void onUploadQr(channel, file); event.target.value = '' }} /><small className="field-hint">用于个人收款码线下转账；上传后 C 端会展示，支付仍需上传凭证并由管理端审核。</small>{value && <img className="course-image-preview payment-qr-preview" src={value.startsWith('http') ? value : `${API_BASE_URL.replace(/\/api\/?$/, '')}${value}`} alt={`${label}收款码预览`} />}</label>
  return <SimpleModal title="支付设置" description="维护对公转账和个人收款码的线下支付信息；在线支付需另行配置商户渠道" onClose={onClose}>
    <div className="course-form-grid"><label>收款户名<input value={form.accountName} onChange={event => onChange({ ...form, accountName: event.target.value })} /></label><label>开户银行<input value={form.bankName} onChange={event => onChange({ ...form, bankName: event.target.value })} /></label><label>银行账号<input value={form.accountNo} onChange={event => onChange({ ...form, accountNo: event.target.value })} /></label><label>转账备注/收款码文本<input value={form.qrCodeText} onChange={event => onChange({ ...form, qrCodeText: event.target.value })} /></label>{qrField('wechat', '微信', form.wechatQrImage)}{qrField('alipay', '支付宝', form.alipayQrImage)}<label className="checkbox-field modal-checkbox"><input type="checkbox" checked={form.onlineWechatEnabled} onChange={event => onChange({ ...form, onlineWechatEnabled: event.target.checked })} /><span>启用微信在线支付（需商户配置）</span></label><label className="checkbox-field modal-checkbox"><input type="checkbox" checked={form.onlineAlipayEnabled} onChange={event => onChange({ ...form, onlineAlipayEnabled: event.target.checked })} /><span>启用支付宝在线支付（需商户配置）</span></label></div>
    <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button type="button" className="primary" onClick={onSave}>保存支付设置</button></div>
  </SimpleModal>
}

function RuleModal({ form, courses, onChange, onClose, onSave }: { form: RuleForm; courses: CourseOption[]; onChange: (form: RuleForm) => void; onClose: () => void; onSave: () => void }) {
  const [coursePickerOpen, setCoursePickerOpen] = useState(false)
  const selectedIds = form.courseIds.split(',').map(item => item.trim()).filter(Boolean)
  const selectedNames = selectedIds.map(id => courses.find(course => course.id === id)?.title || id)
  const toggleCourse = (courseId: string) => {
    const nextIds = selectedIds.includes(courseId) ? selectedIds.filter(id => id !== courseId) : [...selectedIds, courseId]
    onChange({ ...form, courseIds: nextIds.join(', ') })
  }
  return <SimpleModal title={form.id ? '编辑优惠规则' : '新增优惠规则'} description="配置人数阶梯、折扣比例和适用课程范围" onClose={onClose}>
    <div className="course-form-grid"><label>最低报名人数<input type="number" min="1" value={form.minPeople} onChange={event => onChange({ ...form, minPeople: event.target.value })} /></label><label>折扣比例<input type="number" min="0" max="1" step="0.01" value={form.discountRate} onChange={event => onChange({ ...form, discountRate: event.target.value })} /><small className="field-hint">例如 0.9 表示 9 折；不选择课程表示适用全部课程</small></label><div className="wide-field rule-course-picker-field"><span className="form-label">适用课程（可多选）</span><div className="rule-course-picker"><button type="button" className="rule-course-summary" aria-haspopup="listbox" aria-expanded={coursePickerOpen} onClick={() => setCoursePickerOpen(value => !value)}><span>{selectedNames.length ? selectedNames.join('、') : '全部课程（未指定适用范围）'}</span><b aria-hidden="true">⌄</b></button>{coursePickerOpen && <div className="rule-course-menu" role="listbox" aria-label="选择适用课程">{courses.map(course => <label key={course.id} className="rule-course-option"><input type="checkbox" checked={selectedIds.includes(course.id)} onChange={() => toggleCourse(course.id)} /><span>{course.title}</span></label>)}<button type="button" className="rule-course-done" onClick={() => setCoursePickerOpen(false)}>完成选择</button></div>}</div><small className="field-hint">点击课程前的勾选框即可多选；已选课程会显示在上方文本框中。不选择表示适用全部课程。</small></div><label className="checkbox-field modal-checkbox"><input type="checkbox" checked={form.enabled} onChange={event => onChange({ ...form, enabled: event.target.checked })} /><span>启用规则</span></label></div>
    <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button type="button" className="primary" onClick={onSave}>保存优惠规则</button></div>
  </SimpleModal>
}

function MessageModal({ form, onChange, onClose, onSave }: { form: MessageForm; onChange: (form: MessageForm) => void; onClose: () => void; onSave: () => void }) {
  return <SimpleModal title={form.id ? '编辑消息' : '新增消息'} description="维护站内通知内容、发送渠道和启用状态" onClose={onClose}>
    <div className="course-form-grid"><label>消息标题<input value={form.title} onChange={event => onChange({ ...form, title: event.target.value })} placeholder="例如：课程报名提醒" /></label><label>通知渠道<select value={form.channel} onChange={event => onChange({ ...form, channel: event.target.value })}><option>站内消息</option><option>短信（预留）</option><option>邮件（预留）</option></select></label><label className="wide-field">消息内容<textarea value={form.content} onChange={event => onChange({ ...form, content: event.target.value })} placeholder="请输入通知内容" /></label><label className="checkbox-field modal-checkbox"><input type="checkbox" checked={form.enabled} onChange={event => onChange({ ...form, enabled: event.target.checked })} /><span>启用消息</span></label></div>
    <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button type="button" className="primary" onClick={onSave}>保存消息</button></div>
  </SimpleModal>
}

function ConfigModal({ form, onChange, onClose, onSave }: { form: ConfigForm; onChange: (form: ConfigForm) => void; onClose: () => void; onSave: () => void }) {
  return <SimpleModal title={form.key ? '编辑系统配置' : '新增系统配置'} description="使用结构化字段维护系统运行参数，不再直接编辑 JSON" onClose={onClose}>
    <div className="course-form-grid"><label>配置键<input value={form.key} disabled={Boolean(form.key)} onChange={event => onChange({ ...form, key: event.target.value })} placeholder="例如：supportPhone" /></label><label>配置值<input value={form.value} onChange={event => onChange({ ...form, value: event.target.value })} placeholder="请输入配置值" /></label><label className="wide-field">配置说明<textarea value={form.description} onChange={event => onChange({ ...form, description: event.target.value })} placeholder="说明该配置的用途" /></label></div>
    <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button type="button" className="primary" onClick={onSave}>保存配置</button></div>
  </SimpleModal>
}

function PointsModal({ form, onChange, onClose, onSave }: { form: PointsForm; onChange: (form: PointsForm) => void; onClose: () => void; onSave: () => void }) {
  return <SimpleModal title="调整用户积分" description="通过积分变更记录维护用户积分，正数增加、负数扣减" onClose={onClose}>
    <div className="course-form-grid"><label>用户编号<input value={form.userId} onChange={event => onChange({ ...form, userId: event.target.value })} placeholder="例如：user-demo" /></label><label>用户名称<input value={form.userName} disabled /></label><label>积分变更<input type="number" step="1" value={form.points} onChange={event => onChange({ ...form, points: event.target.value })} /></label><label className="wide-field">调整原因<textarea value={form.reason} onChange={event => onChange({ ...form, reason: event.target.value })} placeholder="例如：线下活动奖励" /></label></div>
    <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button type="button" className="primary" onClick={onSave}>保存积分调整</button></div>
  </SimpleModal>
}

function FeedbackModal({ form, onChange, onClose, onSave }: { form: FeedbackForm; onChange: (form: FeedbackForm) => void; onClose: () => void; onSave: () => void }) {
  return <SimpleModal title="回复反馈" description="填写处理结果后，反馈状态将更新为已处理" onClose={onClose}>
    <label className="wide-field">回复内容<textarea value={form.reply} onChange={event => onChange({ ...form, reply: event.target.value })} placeholder="请输入回复内容" /></label>
    <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button type="button" className="primary" onClick={onSave}>保存回复</button></div>
  </SimpleModal>
}

function SimpleModal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="course-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><h2>{title}</h2><p>{description}</p></div><button type="button" className="modal-close" onClick={onClose} aria-label="关闭">×</button></div>{children}</section></div>
}

function TemplateModal({ form, onChange, onFieldChange, onClose, onSave }: { form: TemplateForm; onChange: (form: TemplateForm) => void; onFieldChange: (index: number, patch: Partial<TemplateField>) => void; onClose: () => void; onSave: () => void }) {
  const [fieldPage, setFieldPage] = useState(1)
  const fieldTotalPages = Math.max(1, Math.ceil(form.fields.length / TEMPLATE_FIELD_PAGE_SIZE))
  const visibleFields = form.fields.slice((fieldPage - 1) * TEMPLATE_FIELD_PAGE_SIZE, fieldPage * TEMPLATE_FIELD_PAGE_SIZE)

  useEffect(() => {
    setFieldPage(current => Math.min(current, fieldTotalPages))
  }, [fieldTotalPages])

  const addField = () => {
    const fields = [...form.fields, { key: `field${form.fields.length + 1}`, label: '新字段', type: 'text' as const, required: false, options: [] }]
    onChange({ ...form, fields })
    setFieldPage(Math.max(1, Math.ceil(fields.length / TEMPLATE_FIELD_PAGE_SIZE)))
  }
  const removeField = (index: number) => {
    const fields = form.fields.filter((_, fieldIndex) => fieldIndex !== index)
    onChange({ ...form, fields })
    setFieldPage(current => Math.min(current, Math.max(1, Math.ceil(fields.length / TEMPLATE_FIELD_PAGE_SIZE))))
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="template-modal" role="dialog" aria-modal="true" aria-labelledby="template-modal-title">
      <div className="modal-head"><div><h2 id="template-modal-title">{form.id ? '编辑报名模板' : '新增报名模板'}</h2><p>模板可复用于多个课程，每个课程只能关联一个模板</p></div><button type="button" className="modal-close" onClick={onClose} aria-label="关闭">×</button></div>
      <label className="template-course-field">模板名称<input value={form.name} onChange={event => onChange({ ...form, name: event.target.value })} placeholder="例如：通用基础报名模板" /></label>
      <div className="template-layout"><div className="template-fields"><div className="template-section-head"><h3>字段配置</h3><button type="button" onClick={addField}>添加字段</button></div>{visibleFields.map((field, visibleIndex) => { const index = (fieldPage - 1) * TEMPLATE_FIELD_PAGE_SIZE + visibleIndex; return <div className="template-field-row" key={`${field.key}-${index}`}><input value={field.key} onChange={event => onFieldChange(index, { key: event.target.value })} placeholder="字段标识" /><input value={field.label} onChange={event => onFieldChange(index, { label: event.target.value })} placeholder="显示名称" /><select value={field.type} onChange={event => onFieldChange(index, { type: event.target.value as TemplateField['type'] })}><option value="text">文本</option><option value="phone">手机号</option><option value="select">下拉框</option><option value="radio">单选框</option><option value="checkbox">复选框</option></select><label className="template-required"><input type="checkbox" checked={field.required} onChange={event => onFieldChange(index, { required: event.target.checked })} />必填</label>{['select', 'radio', 'checkbox'].includes(field.type) && <input className="template-options" value={(field.options || []).join(',')} onChange={event => onFieldChange(index, { options: event.target.value.split(',') })} placeholder="选项用逗号分隔" />}<button type="button" className="danger-button template-remove" onClick={() => removeField(index)} disabled={form.fields.length <= 1}>删除</button></div> })}<div className="template-pagination"><span>共 {form.fields.length} 个字段，第 {fieldPage} / {fieldTotalPages} 页（每页 {TEMPLATE_FIELD_PAGE_SIZE} 条）</span><div><button type="button" disabled={fieldPage <= 1} onClick={() => setFieldPage(current => Math.max(1, current - 1))}>上一页</button><button type="button" disabled={fieldPage >= fieldTotalPages} onClick={() => setFieldPage(current => Math.min(fieldTotalPages, current + 1))}>下一页</button></div></div></div><aside className="template-preview"><h3>报名页预览</h3><p>字段数量：{form.fields.length}</p>{form.fields.map((field, index) => <div className="template-preview-item" key={`${field.key}-preview-${index}`}><span>{field.label || '未命名字段'}</span><small>{field.type}{field.required ? ' · 必填' : ' · 选填'}</small></div>)}</aside></div>
      <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button type="button" className="primary" onClick={onSave}>保存模板</button></div>
    </section>
  </div>
}

function RichTextEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
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

  const addLink = () => {
    const url = window.prompt('请输入链接地址')
    if (url) runCommand('createLink', url)
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
      window.alert('请选择图片文件')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      window.alert('图片大小不能超过 5MB')
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
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={addLink}>链接</button>
      <button type="button" onMouseDown={event => { event.preventDefault(); rememberSelection() }} onClick={() => imageInputRef.current?.click()}>插入图片</button>
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('removeFormat')}>清除格式</button>
    </div>
    <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImageFileChange} />
    <div className="rich-image-row"><input value={imageUrl} onChange={event => setImageUrl(event.target.value)} placeholder="可选：粘贴图片 URL" /><button type="button" onMouseDown={event => { event.preventDefault(); rememberSelection() }} onClick={addImageFromUrl}>插入 URL</button><span>本地图片会以内嵌方式写入课程简介，单张不超过 5MB</span></div>
    <div ref={editorRef} className="rich-editor-content" contentEditable suppressContentEditableWarning onInput={() => onChange(editorRef.current?.innerHTML || '')} data-placeholder="请输入课程简介、适用对象和学习收益" />
    <small className="rich-editor-hint">可编辑标题、段落、加粗、列表、链接和图片；保存后 C 端按富文本展示。</small>
  </div>
}

function Dashboard({ data, onNavigate }: { data: any; onNavigate: (key: string) => void }) {
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
      <div className="chart-list">{chartRows.map(item => {
      const total = number(item.enrollmentCount)
      const paid = Math.min(total, number(item.paidCount))
      const unpaid = Math.min(Math.max(0, total - paid), number(item.unpaidCount))
      const other = Math.max(0, total - paid - unpaid)
      const trackWidth = total ? Math.max(4, total / max * 100) : 0
      const course = String(item.courseTitle || item.courseId)
      const details = tooltip(course, total, paid, unpaid, other)
      return <div className="chart-row" key={String(item.courseId)}>
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
  const renderRows = (rows: TableItem[], empty: string) => rows.length ? <div className="enrollment-detail-list">{rows.map((row, index) => <article className="enrollment-detail-row" key={String(row.id || index)}><div className="enrollment-detail-head"><b>{row.name || `报名人 ${index + 1}`}</b><span>{row.paymentStatus || '-'}</span></div><div className="enrollment-detail-fields">{Object.entries(row).filter(([key, value]) => !['id', 'courseId', 'courseTitle', 'paymentStatus', 'orderId', 'accountUserId', 'accountUsername', 'accountUserName'].includes(key) && value !== undefined && value !== '').map(([key, value]) => <span key={key}>{displayColumnLabel(key)}：{String(value)}</span>)}</div><small>订单：{row.orderId || '-'} · 下单账号：{row.accountUsername || '-'}</small></article>)}</div> : <p className="detail-muted">{empty}</p>
  const selectedItems = selectedStatus === 'paid' ? paid : unpaid
  const selectedTitle = selectedStatus === 'paid' ? '已支付报名人详情' : '未支付/其他状态报名人详情'
  return <>
    <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="detail-modal enrollment-summary-modal" role="dialog" aria-modal="true" aria-labelledby="enrollment-summary-detail-title">
        <div className="detail-head"><div><h3 id="enrollment-summary-detail-title">{detail.summary.courseTitle || detail.summary.courseId} · 报名详情</h3><p>总报名 {detail.summary.enrollmentCount || 0} 人，请选择要查看的报名人状态</p></div><button type="button" onClick={onClose}>关闭</button></div>
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
        <div className="detail-head"><div><h3 id="enrollment-participant-title">{detail.summary.courseTitle || detail.summary.courseId} · {selectedTitle}</h3><p>共 {selectedItems.length} 人，以下为该状态下的报名信息</p></div><button type="button" onClick={() => setSelectedStatus(null)}>返回</button></div>
        {renderRows(selectedItems, selectedStatus === 'paid' ? '暂无已支付报名人' : '暂无未支付报名人')}
      </section>
    </div>}
  </>
}

function DataTable({ moduleKey, items, onOperate, onDetail, actionLabel = '处理', showAction = true, secondaryActionLabel, onSecondary }: { moduleKey: string; items: TableItem[]; onOperate: (item: TableItem) => void; onDetail?: (item: TableItem) => void; actionLabel?: string; showAction?: boolean; secondaryActionLabel?: string; onSecondary?: (item: TableItem) => void }) {
  if (!items.length) return <p className="empty">暂无数据，可通过 C 端提交报名、支付、开票或反馈来生成记录。</p>
  const preferred = moduleColumns[moduleKey] || []
  const available = Array.from(new Set(items.flatMap(item => Object.keys(item))))
  const columns = preferred.filter(key => available.includes(key))
  if (!columns.length) columns.push(...available.filter(key => Boolean(columnLabels[key])).slice(0, 8))
  if (!columns.length) columns.push(...available.slice(0, 8))
  return <div className="table-scroll"><table><thead><tr>{columns.map(key => <th key={key}>{displayTableColumnLabel(moduleKey, key)}</th>)}{showAction && <th className="action-column">操作</th>}</tr></thead><tbody>{items.map((item, index) => <tr key={item.id || `${moduleKey}-${index}`}>{columns.map(key => <td key={key} title={formatTableValue(moduleKey, key, item[key])}>{formatTableValue(moduleKey, key, item[key])}</td>)}{showAction && <td className="action-cell"><div>{onDetail && <button onClick={() => onDetail(item)}>查看详情</button>}<button onClick={() => onOperate(item)}>{actionLabel}</button>{secondaryActionLabel && onSecondary && <button onClick={() => onSecondary(item)}>{secondaryActionLabel}</button>}</div></td>}</tr>)}</tbody></table></div>
}

function DetailPanel({ detail, onClose }: { detail: { module: string; item: TableItem; proof?: TableItem | null; relatedOrder?: TableItem; intent?: 'view' | 'process' }; onClose: () => void }) {
  const item = detail.item
  if (detail.module === 'students') return <StudentProfileDetailPanel item={item} onClose={onClose} />
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
      <div className="detail-head"><div><h3 id="detail-modal-title">{title}</h3><p>{detail.intent === 'process' ? '处理入口：请先核对报名资料和关联订单' : (detail.module === 'orders' ? `订单 ${item.id}` : item.id || '当前记录')}</p></div><button type="button" onClick={onClose}>关闭</button></div>
      {courseKeys.length > 0 && <><h4>课程信息</h4><div className="detail-grid">{courseKeys.map(key => <div key={`course-${key}`}><small>{displayColumnLabel(key)}</small><span>{formatValue(courseSource[key])}</span></div>)}</div></>}
      {(detail.module === 'orders' || detail.module === 'enrollment-details' || detail.module === 'students') && <>
        <h4>报名人（{participants.length}）</h4>
        {participants.length ? <div className="participant-list">{participants.map((participant: TableItem, index: number) => <div key={index}><b>报名人 {index + 1}</b><span>{Object.entries(participant).map(([key, value]) => `${displayColumnLabel(key)}：${String(value)}`).join(' · ')}</span></div>)}</div> : <p className="detail-muted">未返回报名人明细</p>}
        {paymentKeys.length > 0 && <><h4>费用与支付</h4><div className="detail-grid">{paymentKeys.map(key => <div key={`payment-${key}`}><small>{displayColumnLabel(key)}</small><span>{formatValue((relatedOrder || item)[key])}</span></div>)}</div></>}
        <h4>支付凭证</h4>
        {detail.proof ? <div className="proof-summary"><span>{detail.proof.originalName || '凭证文件'}</span><span>{detail.proof.mimeType || '-'} · {detail.proof.size || 0} bytes · {detail.proof.status || 'pending'}</span></div> : <p className="detail-muted">暂无支付凭证</p>}
      </>}
      {otherKeys.length > 0 && <><h4>其他信息</h4><div className="detail-grid">{otherKeys.map(key => <div key={`other-${key}`}><small>{displayColumnLabel(key)}</small><span>{formatValue(item[key])}</span></div>)}</div></>}
      {detail.intent === 'process' && <p className="detail-process-hint">报名明细处理以关联订单的支付审核、退款或取消结果为准，请在“订单与支付”模块执行状态操作。</p>}
      <div className="modal-actions"><button type="button" onClick={onClose}>关闭</button></div>
    </section>
  </div>
}

function StudentProfileDetailPanel({ item, onClose }: { item: TableItem; onClose: () => void }) {
  const relations = Array.isArray(item.accountRelations) ? item.accountRelations : []
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="student-profile-title">
      <div className="detail-head"><div><h3 id="student-profile-title">学员档案详情</h3><p>{item.id}</p></div><button type="button" onClick={onClose}>关闭</button></div>
      <h4>基础资料</h4><div className="detail-grid">{['name', 'phone', 'email', 'company', 'department', 'position', 'status', 'enrollmentCount', 'createdAt', 'updatedAt'].filter(key => item[key] !== undefined).map(key => <div key={key}><small>{displayColumnLabel(key)}</small><span>{formatValue(item[key])}</span></div>)}</div>
      <h4>授权账号（{relations.length}）</h4>{relations.length ? <div className="participant-list">{relations.map((relation: TableItem) => <div key={relation.id || relation.userId}><b>{relation.username || relation.userId}</b><span>{relation.userName || '-'} · {relation.relationType || '其他'} · {relation.isDefault ? '默认报名人' : '普通关系'} · {relation.status || 'active'}</span></div>)}</div> : <p className="detail-muted">暂无授权账号</p>}
      <div className="modal-actions"><button type="button" onClick={onClose}>关闭</button></div>
    </section>
  </div>
}

function EnrollmentRecordDetailPanel({ item, onClose }: { item: TableItem; onClose: () => void }) {
  const payload = item.formPayload && typeof item.formPayload === 'object' ? item.formPayload : {}
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="enrollment-record-title">
      <div className="detail-head"><div><h3 id="enrollment-record-title">报名履历详情</h3><p>{item.id}</p></div><button type="button" onClick={onClose}>关闭</button></div>
      <h4>学员与课程</h4><div className="detail-grid">{['name', 'phone', 'company', 'department', 'position', 'courseTitle', 'date', 'location', 'orderId', 'orderStatus', 'status', 'accountUsername', 'accountUserName', 'registeredAt', 'cancelledAt', 'templateId', 'templateVersion'].filter(key => item[key] !== undefined).map(key => <div key={key}><small>{displayColumnLabel(key)}</small><span>{formatValue(item[key])}</span></div>)}</div>
      <h4>当次报名表单快照</h4><div className="participant-list"><div><span>{Object.entries(payload).map(([key, value]) => `${displayColumnLabel(key)}：${formatValue(value)}`).join(' · ') || '无表单字段'}</span></div></div>
      <div className="modal-actions"><button type="button" onClick={onClose}>关闭</button></div>
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
