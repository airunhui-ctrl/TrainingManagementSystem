<template>
  <view class="page">
    <view class="head"><text class="title">我的业务</text><text class="more" @tap="tab = 'invoices'">开票记录</text></view>
    <view class="tabs"><text v-for="item in tabs" :key="item.key" :class="['tab', { active: tab === item.key }]" @tap="tab = item.key">{{ item.label }}</text></view>
    <view v-if="loading" class="card empty"><text>正在加载业务记录…</text></view>

    <template v-else-if="tab === 'orders'">
      <view v-if="displayedPreviews.length" class="card preview-card">
        <view class="preview-heading"><text class="preview-title">最近浏览</text><view class="preview-heading-actions"><text class="preview-count">{{ previewCountLabel }}</text><text class="preview-expand" @tap.stop="toggleAllPreviews">{{ previewActionLabel }}</text></view></view>
        <view class="preview-grid">
          <view v-for="item in displayedPreviews" :key="item.id" class="preview-course-card" @tap="openCourseDetail(item.courseId)">
            <image class="preview-course-image" :src="courseImageByCourseId[item.courseId] || bannerImage" mode="aspectFill" />
            <view class="preview-course-body">
              <text class="preview-course-title">{{ courseById[item.courseId]?.title || item.courseTitle }}</text>
              <text class="preview-course-subtitle">{{ courseById[item.courseId]?.subtitle || '培训课程' }}</text>
              <view class="preview-course-meta"><text>{{ formatViewedAt(item.viewedAt) }}</text><text v-if="courseById[item.courseId]">¥{{ courseById[item.courseId].price }}</text></view>
              <text class="preview-detail-link">查看课程详情 ›</text>
            </view>
          </view>
        </view>
      </view>
      <view v-else class="card empty"><text>暂无浏览记录，前往课程页看看吧</text></view>
    </template>

    <template v-else-if="tab === 'payments'">
      <view class="payment-toolbar card">
        <view class="payment-filter"><text :class="['filter-chip', { active: paymentFilter === 'all' }]" @tap="paymentFilter = 'all'">全部订单</text><text :class="['filter-chip', { active: paymentFilter === 'paid' }]" @tap="paymentFilter = 'paid'">已支付</text></view>
        <button class="primary-btn batch-invoice-btn" :disabled="!selectedInvoiceOrderIds.length" @tap="openInvoiceDialog">申请开票{{ selectedInvoiceOrderIds.length ? `（${selectedInvoiceOrderIds.length}）` : '' }}</button>
      </view>
      <view v-if="paymentOrders.length" v-for="order in paymentOrders" :key="order.id" class="card record">
        <view class="record-head"><text class="record-title">{{ courseName(order.courseId) }}</text><text :class="['status', statusClass(order.status)]">{{ order.status }}</text></view>
        <view class="meta"><text>{{ order.participantCount }} 位报名人</text><text>¥{{ order.amount }}</text><text>{{ order.paymentMethod === 'offline' ? '线下支付' : order.paymentChannel === 'alipay' ? '支付宝支付' : '微信支付' }}</text><text>{{ order.createdAt }}</text></view>
        <view class="actions"><label v-if="order.status === '已支付'" class="invoice-check"><checkbox :checked="selectedInvoiceOrderIds.includes(order.id)" color="#2F80ED" @tap.stop="toggleInvoiceOrder(order.id, !selectedInvoiceOrderIds.includes(order.id))" /><text>选择开票</text></label><button v-if="order.status === '已支付' && !invoicedOrderIds.has(order.id)" class="invoice-action" @tap="openInvoiceDialog(order.id)">申请开票</button><text v-if="order.status === '已支付' && invoicedOrderIds.has(order.id)" class="invoice-done">已提交开票</text><button v-if="order.status === '待支付'" class="primary-btn" @tap="pay(order.id, 'online', 'wechat')">微信模拟支付</button><button v-if="order.status === '待支付'" @tap="pay(order.id, 'online', 'alipay')">支付宝模拟支付</button><button v-if="order.status === '待支付'" @tap="pay(order.id, 'offline')">提交线下支付凭证</button><button v-if="['待支付', '待审核'].includes(order.status)" @tap="cancel(order.id)">取消报名</button></view>
        <text v-if="order.status === '待审核'" class="hint">线下支付凭证已提交，等待管理员审核</text>
      </view>
      <view v-else class="card empty"><text>暂无支付记录</text></view>
    </template>

    <template v-else>
      <view v-if="invoices.length" v-for="item in invoices" :key="item.id" class="card record">
        <view class="record-head"><text class="record-title">{{ item.title || '企业发票' }}</text><text :class="['status', statusClass(item.status)]">{{ item.status }}</text></view>
        <view class="meta"><text>申请编号：{{ item.id }}</text><text v-if="item.invoiceNo">发票号码：{{ item.invoiceNo }}</text><text>申请时间：{{ formatViewedAt(item.createdAt) }}</text><text>课程数：{{ item.orderIds?.length || 0 }}</text></view>
      </view>
      <view v-else class="card empty"><text>暂无开票记录，请在支付记录中选择已支付课程申请开票</text></view>
    </template>
    <view v-if="invoiceDialogOpen" class="invoice-dialog-mask" @tap.self="closeInvoiceDialog"><view class="invoice-dialog card"><view class="dialog-head"><text class="invoice-title">提交开票信息</text><text class="dialog-close" @tap="closeInvoiceDialog">×</text></view><text class="dialog-hint">已选择 {{ selectedInvoiceOrderIds.length }} 门课程</text><input v-model="invoiceForm.title" class="invoice-field" placeholder="请输入发票抬头" /><input v-model="invoiceForm.taxNo" class="invoice-field" placeholder="请输入纳税人识别号" /><input v-model="invoiceForm.email" class="invoice-field" type="text" placeholder="请输入接收发票的邮箱" /><view class="dialog-actions"><button @tap="closeInvoiceDialog">取消</button><button class="primary-btn" :disabled="!selectedInvoiceOrderIds.length" @tap="invoice">提交申请</button></view></view></view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api, type ApiCourse, uploadPaymentProof } from '../../common/api'
import bannerImage from '../../assets/courses/banner-training.svg'
import talentImage from '../../assets/courses/course-talent.svg'
import managementImage from '../../assets/courses/course-management.svg'
import leanImage from '../../assets/courses/course-lean.svg'

type Order = { id: string; courseId: string; participantCount: number; amount: number; status: string; paymentMethod?: string; paymentChannel?: string; createdAt: string }
type Invoice = { id: string; status: string; title: string; taxNo?: string; email?: string; invoiceNo?: string; orderIds?: string[]; createdAt: string }
type Preview = { id: string; courseId: string; courseTitle: string; viewedAt: string }
const tabs = [{ key: 'payments', label: '支付记录' }, { key: 'orders', label: '浏览记录' }, { key: 'invoices', label: '开票记录' }]
const tab = ref('payments')
const orders = ref<Order[]>([])
const invoices = ref<Invoice[]>([])
const previews = ref<Preview[]>([])
const courseTitles = ref<Record<string, string>>({})
const courseById = ref<Record<string, ApiCourse>>({})
const loading = ref(false)
const selectedInvoiceOrderIds = ref<string[]>([])
const invoiceForm = reactive({ title: '', taxNo: '', email: '' })
const invoiceDialogOpen = ref(false)
const paymentFilter = ref<'all' | 'paid'>('all')
const showAllPreviews = ref(false)
const courseImageByCourseId: Record<string, string> = {
  'course-1': talentImage,
  'course-2': managementImage,
  'course-3': leanImage,
  // 演示课程复用现有视觉素材，避免新增无关图片资源。
  'course-4': managementImage,
  'course-5': leanImage,
  'course-6': talentImage,
}
const paidOrders = computed(() => orders.value.filter((order) => order.status === '已支付'))
const invoicedOrderIds = computed(() => new Set(invoices.value.flatMap((invoice) => invoice.orderIds || [])))
const paymentOrders = computed(() => paymentFilter.value === 'paid' ? paidOrders.value : orders.value)
const recentPreviews = computed(() => previews.value.slice(0, 3))
const displayedPreviews = computed(() => showAllPreviews.value ? previews.value : recentPreviews.value)
const previewCountLabel = computed(() => showAllPreviews.value ? `共 ${previews.value.length} 条` : `最近 ${Math.min(previews.value.length, 3)} 条`)
const previewActionLabel = computed(() => showAllPreviews.value ? '收起记录' : `查看全部（${previews.value.length}）`)
const courseName = (id: string) => courseTitles.value[id] || '培训课程'
const statusClass = (status: string) => status === '已支付' ? 'success' : status === '已取消' ? 'muted' : status === '待审核' ? 'warning' : ''
const formatViewedAt = (value: string) => value.replace('T', ' ').replace(/\.\d+Z$/, '')
const toggleAllPreviews = () => {
  showAllPreviews.value = !showAllPreviews.value
}
const openCourseDetail = (courseId?: string) => {
  if (courseId) uni.navigateTo({ url: `/pages/detail/detail?id=${courseId}` })
}
const toggleInvoiceOrder = (id: string, checked: boolean) => {
  if (invoicedOrderIds.value.has(id)) return
  selectedInvoiceOrderIds.value = checked ? [...new Set([...selectedInvoiceOrderIds.value, id])] : selectedInvoiceOrderIds.value.filter((item) => item !== id)
}
const openInvoiceDialog = (id?: string) => {
  if (id && !invoicedOrderIds.value.has(id)) toggleInvoiceOrder(id, true)
  if (!selectedInvoiceOrderIds.value.length) return uni.showToast({ title: '请先选择已支付课程', icon: 'none' })
  invoiceDialogOpen.value = true
}
const closeInvoiceDialog = () => { invoiceDialogOpen.value = false }

const loadAll = async () => {
  loading.value = true
  try {
    const [orderResult, invoiceResult, courseResult, previewResult] = await Promise.all([api.listOrders(), api.listInvoices(), api.listCourses(), api.listPreviews()])
    orders.value = orderResult.items
    invoices.value = invoiceResult.items
    courseTitles.value = Object.fromEntries(courseResult.items.map((course) => [course.id, course.title]))
    courseById.value = Object.fromEntries(courseResult.items.map((course) => [course.id, course]))
    previews.value = previewResult.items
  } catch {
    orders.value = []
    invoices.value = []
    previews.value = []
  } finally {
    loading.value = false
  }
}

const submitPayment = async (id: string, method: 'online' | 'offline', channel?: 'wechat' | 'alipay', proof?: string) => {
  try {
    await api.payOrder(id, method, method === 'offline' ? proof || 'MOCK-TRANSFER-PROOF' : '', channel)
    uni.showToast({ title: method === 'online' ? `${channel === 'alipay' ? '支付宝' : '微信'}支付成功` : '凭证已提交，等待审核', icon: 'none' })
    await loadAll()
  } catch { uni.showToast({ title: '支付失败，请先登录', icon: 'none' }) }
}
const pay = async (id: string, method: 'online' | 'offline', channel?: 'wechat' | 'alipay') => {
  if (method === 'online') return submitPayment(id, method, channel)
  try {
    const info = await api.paymentInfo()
    uni.showModal({ title: '线下收款信息', content: `${info.accountName}\n${info.bankName}\n账号：${info.accountNo}\n收款码：${info.qrCodeText}\n\n确认已完成转账并选择凭证图片？`, success: (result) => { if (result.confirm) chooseAndUploadProof(id) } })
  } catch { uni.showToast({ title: '收款信息加载失败', icon: 'none' }) }
}
const chooseAndUploadProof = (id: string) => {
  uni.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: async (result) => {
    const filePath = result.tempFilePaths?.[0]
    if (!filePath) return
    try { await uploadPaymentProof(id, filePath); uni.showToast({ title: '凭证已上传，等待审核', icon: 'none' }); await loadAll() } catch (error: any) { uni.showToast({ title: error?.message || '凭证上传失败', icon: 'none' }) }
  } })
}
const cancel = async (id: string) => {
  try { await api.cancelOrder(id); uni.showToast({ title: '报名已取消', icon: 'none' }); await loadAll() } catch { uni.showToast({ title: '取消失败', icon: 'none' }) }
}
const invoice = async () => {
  if (!selectedInvoiceOrderIds.value.length) return
  if (!invoiceForm.title.trim() || !invoiceForm.taxNo.trim() || !invoiceForm.email.trim()) return uni.showToast({ title: '请填写完整开票信息', icon: 'none' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoiceForm.email.trim())) return uni.showToast({ title: '请输入正确的邮箱地址', icon: 'none' })
  try {
    await api.createInvoice(invoiceForm.title.trim(), invoiceForm.taxNo.trim(), invoiceForm.email.trim(), selectedInvoiceOrderIds.value)
    selectedInvoiceOrderIds.value = []
    invoiceForm.title = ''; invoiceForm.taxNo = ''; invoiceForm.email = ''
    invoiceDialogOpen.value = false
    uni.showToast({ title: '开票申请已提交', icon: 'none' })
    await loadAll()
  } catch (error: any) { uni.showToast({ title: error?.message || '申请失败，请先登录', icon: 'none' }) }
}

onShow(loadAll)
</script>

<style scoped lang="scss">
.page { min-height: 100vh; padding: 40rpx 32rpx 60rpx; background: #f6f8fb; }.head { display: flex; justify-content: space-between; align-items: center; }.title { font-size: 40rpx; font-weight: 900; color: $navy; }.more { color: #2f80ed; font-size: 24rpx; }.tabs { display: flex; gap: 16rpx; margin: 28rpx 0; overflow-x: auto; white-space: nowrap; }.tab { padding: 18rpx 26rpx; border-radius: 999rpx; color: $muted; background: #edf0f4; font-size: 22rpx; }.tab.active { color: $navy; background: $yellow; font-weight: 800; }.card { background: #fff; border-radius: 20rpx; box-shadow: 0 8rpx 28rpx rgba(32, 62, 113, .08); }.payment-toolbar { display:flex; align-items:center; justify-content:space-between; gap:16rpx; margin-bottom:20rpx; padding:16rpx 20rpx; }.payment-filter { display:flex; gap:8rpx; }.filter-chip { padding:10rpx 18rpx; border-radius:99rpx; color:$muted; background:#edf0f4; font-size:20rpx; }.filter-chip.active { color:$navy; background:$yellow; font-weight:800; }.batch-invoice-btn { margin:0; height:58rpx; padding:0 18rpx; line-height:58rpx; font-size:20rpx; }.invoice-check { display:flex; align-items:center; gap:8rpx; color:$muted; font-size:20rpx; }.invoice-action { margin:0 !important; color:#2f80ed !important; border-color:#b9d7ff !important; background:#f4f9ff !important; }.invoice-done { align-self:center; color:#178a5a; font-size:20rpx; }.record { padding: 28rpx; margin-bottom: 20rpx; }.record-head { display: flex; justify-content: space-between; gap: 16rpx; }.record-title { flex: 1; color: $navy; font-size: 28rpx; line-height: 1.4; font-weight: 900; }.status { padding: 7rpx 13rpx; border-radius: 99rpx; color: $blue; background: #eaf3ff; font-size: 20rpx; white-space: nowrap; }.status.success { color: #178a5a; background: #e4f8ef; }.status.warning { color: #bc7200; background: #fff4d4; }.status.muted { color: #7c8796; background: #eef1f4; }.meta { display: flex; flex-wrap: wrap; gap: 12rpx 20rpx; margin-top: 18rpx; color: $muted; font-size: 21rpx; }.hint { display: block; margin-top: 18rpx; color: #b5760b; font-size: 21rpx; }.actions { display: flex; flex-wrap: wrap; gap: 14rpx; margin-top: 22rpx; }.actions button { margin: 0; padding: 0 20rpx; height: 64rpx; line-height: 64rpx; border: 1rpx solid #dfe5ed; border-radius: 99rpx; color: $navy; background: #fff; font-size: 21rpx; }.actions .primary-btn, .primary-btn { border-color: $yellow; background: $yellow; font-weight: 800; }.invoice-field { box-sizing:border-box; display:block; width:100%; height:74rpx; margin-top:18rpx; padding:0 20rpx; border:1rpx solid #dce4ee; border-radius:14rpx; background:#fbfcfe; color:$navy; font-size:22rpx; }.invoice-title { display: block; color: $navy; font-size: 28rpx; font-weight: 900; }.invoice-dialog-mask { position:fixed; inset:0; z-index:99; display:flex; align-items:center; justify-content:center; padding:30rpx; background:rgba(20,43,74,.45); }.invoice-dialog { width:100%; max-width:680rpx; padding:30rpx; }.dialog-head { display:flex; align-items:center; justify-content:space-between; }.dialog-close { color:$muted; font-size:42rpx; line-height:1; }.dialog-hint { display:block; margin-top:10rpx; color:$muted; font-size:21rpx; }.dialog-actions { display:flex; justify-content:flex-end; gap:16rpx; margin-top:24rpx; }.dialog-actions button { min-width:160rpx; height:68rpx; margin:0; line-height:68rpx; border-radius:99rpx; font-size:22rpx; }.dialog-actions .primary-btn[disabled], .batch-invoice-btn[disabled] { opacity:.45; }.empty { padding: 50rpx; color: $muted; text-align: center; font-size: 24rpx; }
.preview-card { margin-bottom: 20rpx; padding: 24rpx; }
.preview-heading { display:flex; align-items:center; justify-content:space-between; gap:18rpx; margin-bottom:18rpx; }
.preview-title { color:$navy; font-size:30rpx; font-weight:900; }
.preview-heading-actions { display:flex; align-items:center; gap:18rpx; }
.preview-count { color:$muted; font-size:20rpx; }
.preview-expand { color:#2f80ed; font-size:21rpx; }
.preview-grid { display:grid; grid-template-columns:1fr; gap:18rpx; }
.preview-course-card { min-width:0; overflow:hidden; border:1rpx solid #e5ebf3; border-radius:16rpx; background:#fbfcfe; transition:transform .2s ease, box-shadow .2s ease; }
.preview-course-card:active { transform:scale(.985); box-shadow:0 8rpx 20rpx rgba(32,62,113,.12); }
.preview-course-image { display:block; width:100%; height:210rpx; background:#edf3fa; }
.preview-course-body { min-width:0; padding:18rpx 18rpx 20rpx; }
.preview-course-title { display:-webkit-box; overflow:hidden; color:$navy; font-size:25rpx; line-height:1.45; font-weight:800; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
.preview-course-subtitle { display:block; overflow:hidden; margin-top:8rpx; color:$muted; font-size:20rpx; line-height:1.4; text-overflow:ellipsis; white-space:nowrap; }
.preview-course-meta { display:flex; justify-content:space-between; gap:12rpx; margin-top:14rpx; color:#8794a6; font-size:19rpx; }
.preview-detail-link { display:block; margin-top:16rpx; color:#2f80ed; font-size:20rpx; font-weight:700; }
@media (min-width: 700px) { .preview-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
