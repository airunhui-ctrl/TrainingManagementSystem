<template>
  <view class="page">
    <view class="page-header">
      <view><text class="eyebrow">ORDER CENTER</text><text class="page-title">订单</text></view>
      <text class="invoice-link" @tap="tab = 'invoices'">开票记录</text>
    </view>
    <view class="tabs">
      <text v-for="item in tabs" :key="item.key" :class="['tab', { active: tab === item.key }]" @tap="tab = item.key">{{ item.label }}</text>
    </view>

    <view v-if="loading" class="card empty-state"><text>正在加载订单记录...</text></view>
    <template v-else-if="tab === 'payments'">
      <view class="toolbar card">
        <view class="filter-group">
          <text :class="['filter', { active: paymentFilter === 'all' }]" @tap="paymentFilter = 'all'">全部订单</text>
          <text :class="['filter', { active: paymentFilter === 'paid' }]" @tap="paymentFilter = 'paid'">已支付</text>
        </view>
        <button class="batch-invoice-button" :disabled="!selectedInvoiceOrderIds.length" @tap="openInvoiceDialog()">申请开票{{ invoiceSelectionLabel }}</button>
      </view>
      <template v-if="paymentOrders.length">
        <view v-for="order in paymentOrders" :key="order.id" class="card order-card">
          <view class="order-heading">
            <view class="order-heading-copy"><text class="order-title">{{ courseName(order.courseId) }}</text><text class="order-id">订单号：{{ order.id }}</text></view>
            <text :class="['status', statusClass(order.status)]">{{ order.status }}</text>
          </view>
          <view class="order-meta"><text>{{ order.participantCount }} 位报名人</text><text class="amount">¥{{ order.amount }}</text><text>{{ paymentMethodLabel(order) }}</text><text>{{ formatDate(order.createdAt) }}</text></view>
          <view class="order-actions">
            <label v-if="order.status === '已支付'" class="invoice-check"><checkbox :checked="selectedInvoiceOrderIds.includes(order.id)" color="#2F80ED" @tap.stop="toggleInvoiceOrder(order.id, !selectedInvoiceOrderIds.includes(order.id))" /><text>选择开票</text></label>
            <button v-if="order.status === '已支付' && !invoicedOrderIds.has(order.id)" class="outline-button" @tap="openInvoiceDialog(order.id)">申请开票</button>
            <text v-if="order.status === '已支付' && invoicedOrderIds.has(order.id)" class="invoice-done">已提交开票</text>
            <button v-if="order.status === '待支付'" class="primary-button" @tap="payOnline(order.id, 'wechat')">微信支付</button>
            <button v-if="order.status === '待支付'" class="outline-button" @tap="payOnline(order.id, 'alipay')">支付宝支付</button>
            <button v-if="order.status === '待支付' || order.status === '待审核'" class="offline-button" @tap="openPaymentProofModal(order.id)">{{ order.status === '待审核' ? '查看/重新上传凭证' : '提交线下支付凭证' }}</button>
            <button v-if="order.status === '待支付' || order.status === '待审核'" class="text-button" @tap="cancelOrder(order.id)">取消报名</button>
          </view>
          <text v-if="order.status === '待审核'" class="status-hint">凭证已提交，等待管理端审核到账。</text>
          <text v-if="order.paymentProofStatus === 'rejected'" class="status-hint rejected">上次凭证未通过：{{ order.paymentProofRemark || '请重新上传清晰的付款凭证' }}</text>
        </view>
      </template>
      <view v-else class="card empty-state"><text>暂无支付记录</text></view>
    </template>

    <template v-else-if="tab === 'orders'">
      <view v-if="previews.length" class="card preview-card">
        <view class="section-heading"><text class="section-title">最近浏览</text><text class="section-link" @tap="showAllPreviews = !showAllPreviews">{{ showAllPreviews ? '收起' : '查看全部' }}</text></view>
        <view v-for="item in displayedPreviews" :key="item.id" class="preview-row" @tap="openCourseDetail(item.courseId)">
          <view><text class="preview-title">{{ item.courseTitle }}</text><text class="preview-time">{{ formatDate(item.viewedAt) }}</text></view><text class="preview-arrow">›</text>
        </view>
      </view>
      <view v-else class="card empty-state"><text>暂无浏览记录</text></view>
    </template>

    <template v-else>
      <view v-if="invoices.length"><view v-for="invoice in invoices" :key="invoice.id" class="card invoice-card">
        <view class="order-heading"><text class="order-title">{{ invoice.title || '企业发票' }}</text><text :class="['status', statusClass(invoice.status)]">{{ invoice.status }}</text></view>
        <text class="invoice-meta">申请编号：{{ invoice.id }}</text><text v-if="invoice.invoiceNo" class="invoice-meta">发票号码：{{ invoice.invoiceNo }}</text><text class="invoice-meta">申请时间：{{ formatDate(invoice.createdAt) }}</text>
      </view></view>
      <view v-else class="card empty-state"><text>暂无开票记录</text></view>
    </template>

    <!-- 上半部分为对公账户信息，下半部分为凭证图片上传 -->
    <view v-if="paymentProofModalOpen" class="modal-mask" @tap.self="closePaymentProofModal">
      <view class="payment-proof-modal">
        <view class="modal-header"><view><text class="modal-title">提交线下支付凭证</text><text class="modal-subtitle">订单号：{{ selectedOrderId }}</text></view><text class="close-button" @tap="closePaymentProofModal">×</text></view>
        <scroll-view scroll-y class="modal-scroll">
          <view class="transfer-section">
            <view class="section-heading"><view><text class="section-title">对公转账信息</text><text class="section-caption">请按以下信息完成转账</text></view><button class="copy-button" @tap="copyTransferInfo">复制全部</button></view>
            <view class="transfer-list">
              <view class="transfer-row"><text class="transfer-label">账户名称</text><text class="transfer-value">{{ paymentInfo.accountName || '待配置' }}</text></view>
              <view class="transfer-row"><text class="transfer-label">开户银行</text><text class="transfer-value">{{ paymentInfo.bankName || '待配置' }}</text></view>
              <view class="transfer-row"><text class="transfer-label">银行账号</text><text class="transfer-value">{{ paymentInfo.accountNo || '待配置' }}</text></view>
              <view v-if="paymentInfo.qrCodeText" class="transfer-row"><text class="transfer-label">收款备注</text><text class="transfer-value">{{ paymentInfo.qrCodeText }}</text></view>
            </view>
            <view v-if="paymentInfo.wechatQrImage || paymentInfo.alipayQrImage" class="personal-qr-section">
              <text class="personal-qr-title">个人收款码（线下转账）</text>
              <text class="personal-qr-caption">请完成转账后上传付款凭证，管理端审核通过后订单才会到账。</text>
              <view class="personal-qr-grid">
                <view v-if="paymentInfo.wechatQrImage" class="personal-qr-card"><text>微信收款码</text><image :src="apiAssetUrl(paymentInfo.wechatQrImage)" mode="aspectFit" /></view>
                <view v-if="paymentInfo.alipayQrImage" class="personal-qr-card"><text>支付宝收款码</text><image :src="apiAssetUrl(paymentInfo.alipayQrImage)" mode="aspectFit" /></view>
              </view>
            </view>
          </view>
          <view class="proof-section">
            <view class="section-heading"><view><text class="section-title">上传支付凭证</text><text class="section-caption">请上传清晰的银行回单或付款截图</text></view></view>
            <view class="upload-area" @tap="chooseProofImage">
              <image v-if="selectedProofImage" class="proof-preview" :src="selectedProofImage" mode="aspectFit" />
              <view v-else class="upload-placeholder"><text class="upload-icon">+</text><text class="upload-title">选择凭证图片</text><text class="upload-caption">支持 JPG、PNG，单张不超过 5MB</text></view>
            </view>
            <text v-if="selectedProofImage" class="replace-hint">点击图片可重新选择</text>
          </view>
        </scroll-view>
        <view class="modal-footer"><button class="cancel-button" @tap="closePaymentProofModal">取消</button><button class="submit-button" :disabled="!selectedProofImage || uploading" @tap="submitPaymentProof">{{ uploading ? '上传中...' : '上传并提交审核' }}</button></view>
      </view>
    </view>

    <view v-if="invoiceDialogOpen" class="modal-mask" @tap.self="closeInvoiceDialog">
      <view class="invoice-dialog card">
        <view class="modal-header"><text class="modal-title">提交开票信息</text><text class="close-button" @tap="closeInvoiceDialog">×</text></view>
        <text class="dialog-hint">已选择 {{ selectedInvoiceOrderIds.length }} 笔订单</text>
        <input v-model="invoiceForm.title" class="invoice-field" placeholder="请输入发票抬头" /><input v-model="invoiceForm.taxNo" class="invoice-field" placeholder="请输入纳税人识别号" /><input v-model="invoiceForm.email" class="invoice-field" placeholder="请输入接收发票的邮箱" />
        <view class="dialog-actions"><button class="cancel-button" @tap="closeInvoiceDialog">取消</button><button class="submit-button" :disabled="!selectedInvoiceOrderIds.length" @tap="submitInvoice">提交申请</button></view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api, apiAssetUrl, type ApiCourse, uploadPaymentProof } from '../../common/api'
import { requestNativePayment } from '../../common/payment'

type TabKey = 'payments' | 'orders' | 'invoices'
type Order = { id: string; courseId: string; participantCount: number; amount: number; status: string; paymentMethod?: string; paymentChannel?: string; paymentProofStatus?: string; paymentProofRemark?: string; createdAt: string }
type Invoice = { id: string; status: string; title?: string; invoiceNo?: string; orderIds?: string[]; createdAt: string }
type Preview = { id: string; courseId: string; courseTitle: string; viewedAt: string }
type PaymentInfo = { accountName?: string; bankName?: string; accountNo?: string; qrCodeText?: string; wechatQrImage?: string; alipayQrImage?: string; onlineWechatEnabled?: boolean; onlineAlipayEnabled?: boolean }

const tabs: Array<{ key: TabKey; label: string }> = [{ key: 'payments', label: '支付记录' }, { key: 'orders', label: '浏览记录' }, { key: 'invoices', label: '开票记录' }]
const tab = ref<TabKey>('payments')
const paymentFilter = ref<'all' | 'paid'>('all')
const loading = ref(false)
const orders = ref<Order[]>([])
const invoices = ref<Invoice[]>([])
const previews = ref<Preview[]>([])
const courses = ref<Record<string, ApiCourse>>({})
const selectedInvoiceOrderIds = ref<string[]>([])
const invoiceDialogOpen = ref(false)
const invoiceForm = reactive({ title: '', taxNo: '', email: '' })
const showAllPreviews = ref(false)
const paymentProofModalOpen = ref(false)
const selectedOrderId = ref('')
const selectedProofImage = ref('')
const uploading = ref(false)
const paymentInfo = reactive<PaymentInfo>({})

const paidOrders = computed(() => orders.value.filter((order) => order.status === '已支付'))
const paymentOrders = computed(() => paymentFilter.value === 'paid' ? paidOrders.value : orders.value)
const invoicedOrderIds = computed(() => new Set(invoices.value.flatMap((invoice) => invoice.orderIds || [])))
const displayedPreviews = computed(() => showAllPreviews.value ? previews.value : previews.value.slice(0, 3))
const invoiceSelectionLabel = computed(() => selectedInvoiceOrderIds.value.length ? '（' + selectedInvoiceOrderIds.value.length + '）' : '')
const courseName = (id: string) => courses.value[id]?.title || '培训课程'
const paymentMethodLabel = (order: Order) => order.paymentMethod === 'offline' ? '对公转账' : order.paymentChannel === 'alipay' ? '支付宝支付' : '微信支付'
const statusClass = (status: string) => status === '已支付' ? 'success' : status === '待审核' ? 'warning' : status === '已取消' ? 'muted' : ''
const formatDate = (value: string) => value ? value.replace('T', ' ').replace(/\.\d+Z$/, '') : '-'

const loadAll = async () => {
  loading.value = true
  try {
    const [orderResult, invoiceResult, courseResult, previewResult] = await Promise.all([api.listOrders(), api.listInvoices(), api.listCourses(), api.listPreviews()])
    orders.value = orderResult.items as Order[]
    invoices.value = invoiceResult.items
    courses.value = Object.fromEntries(courseResult.items.map((course) => [course.id, course]))
    previews.value = previewResult.items
  } catch {
    orders.value = []; invoices.value = []; previews.value = []
  } finally { loading.value = false }
}
const payOnline = async (id: string, channel: 'wechat' | 'alipay') => {
  try {
    const intent = await api.createPaymentIntent(id, channel)
    if (!intent.ready) { uni.showToast({ title: intent.message || '支付渠道尚未配置', icon: 'none' }); return }
    const result = await requestNativePayment(intent)
    if (result === 'redirected') { uni.showToast({ title: '已跳转支付，请完成付款后返回刷新订单', icon: 'none' }); return }
    if (result === 'unavailable') { uni.showToast({ title: '当前设备无法打开支付，请在支持的微信/支付宝环境操作', icon: 'none' }); return }
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const status = await api.paymentStatus(id)
      if (status.paid) { uni.showToast({ title: (channel === 'alipay' ? '支付宝' : '微信') + '支付成功', icon: 'none' }); await loadAll(); return }
      if (attempt < 9) await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    uni.showToast({ title: '暂未收到支付平台回调，请稍后刷新订单', icon: 'none' })
  } catch (error: any) { uni.showToast({ title: error?.message || '支付失败', icon: 'none' }) }
}

const openPaymentProofModal = async (orderId: string) => {
  selectedOrderId.value = orderId; selectedProofImage.value = ''; paymentProofModalOpen.value = true
  try { Object.assign(paymentInfo, await api.paymentInfo()) } catch (error: any) {
    paymentProofModalOpen.value = false
    uni.showToast({ title: error?.message || '对公账户信息加载失败', icon: 'none' })
  }
}
const closePaymentProofModal = () => {
  if (uploading.value) return
  paymentProofModalOpen.value = false; selectedOrderId.value = ''; selectedProofImage.value = ''
}
const copyTransferInfo = () => {
  const text = ['账户名称：' + (paymentInfo.accountName || ''), '开户银行：' + (paymentInfo.bankName || ''), '银行账号：' + (paymentInfo.accountNo || ''), paymentInfo.qrCodeText ? '收款备注：' + paymentInfo.qrCodeText : ''].filter(Boolean).join('\n')
  uni.setClipboardData({ data: text, success: () => uni.showToast({ title: '转账信息已复制', icon: 'none' }) })
}
const chooseProofImage = () => {
  uni.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: (result) => { selectedProofImage.value = result.tempFilePaths?.[0] || '' } })
}
const submitPaymentProof = async () => {
  if (!selectedOrderId.value || !selectedProofImage.value || uploading.value) return
  uploading.value = true
  try {
    await uploadPaymentProof(selectedOrderId.value, selectedProofImage.value)
    paymentProofModalOpen.value = false
    selectedOrderId.value = ''
    selectedProofImage.value = ''
    uni.showToast({ title: '凭证已上传，等待审核', icon: 'none' }); await loadAll()
  } catch (error: any) { uni.showToast({ title: error?.message || '凭证上传失败，请重试', icon: 'none' }) } finally { uploading.value = false }
}

const cancelOrder = async (id: string) => {
  try { await api.cancelOrder(id); uni.showToast({ title: '报名已取消', icon: 'none' }); await loadAll() } catch (error: any) { uni.showToast({ title: error?.message || '取消失败', icon: 'none' }) }
}
const toggleInvoiceOrder = (id: string, checked: boolean) => {
  if (invoicedOrderIds.value.has(id)) return
  selectedInvoiceOrderIds.value = checked ? [...new Set([...selectedInvoiceOrderIds.value, id])] : selectedInvoiceOrderIds.value.filter((item) => item !== id)
}
const openInvoiceDialog = (id?: string) => {
  if (id) toggleInvoiceOrder(id, true)
  if (!selectedInvoiceOrderIds.value.length) return uni.showToast({ title: '请先选择已支付订单', icon: 'none' })
  invoiceDialogOpen.value = true
}
const closeInvoiceDialog = () => { invoiceDialogOpen.value = false }
const submitInvoice = async () => {
  if (!invoiceForm.title.trim() || !invoiceForm.taxNo.trim() || !invoiceForm.email.trim()) return uni.showToast({ title: '请填写完整开票信息', icon: 'none' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoiceForm.email.trim())) return uni.showToast({ title: '请输入正确的邮箱地址', icon: 'none' })
  try {
    await api.createInvoice(invoiceForm.title.trim(), invoiceForm.taxNo.trim(), invoiceForm.email.trim(), selectedInvoiceOrderIds.value)
    selectedInvoiceOrderIds.value = []; invoiceForm.title = ''; invoiceForm.taxNo = ''; invoiceForm.email = ''; closeInvoiceDialog()
    uni.showToast({ title: '开票申请已提交', icon: 'none' }); await loadAll()
  } catch (error: any) { uni.showToast({ title: error?.message || '开票申请失败', icon: 'none' }) }
}
const openCourseDetail = (courseId: string) => { uni.navigateTo({ url: '/pages/detail/detail?id=' + courseId }) }
onShow(loadAll)
</script>

<style scoped lang="scss">
.page { min-height: 100vh; padding: 40rpx 32rpx 64rpx; background: #f6f8fb; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 20rpx; }
.eyebrow { display: block; color: #8b98aa; font-size: 18rpx; letter-spacing: 2rpx; }
.page-title { display: block; margin-top: 8rpx; color: $navy; font-size: 40rpx; font-weight: 900; }
.invoice-link { color: $blue; font-size: 23rpx; }
.tabs { display: flex; gap: 12rpx; margin: 28rpx 0 20rpx; overflow-x: auto; white-space: nowrap; }
.tab { padding: 16rpx 24rpx; border-radius: $radius-pill; color: $muted; background: #edf0f4; font-size: 22rpx; }
.tab.active { color: $navy; background: $yellow; font-weight: 800; }
.card { border-radius: $radius-lg; background: #fff; box-shadow: 0 8rpx 28rpx rgba(32, 62, 113, .07); }
.empty-state { padding: 68rpx 30rpx; color: $muted; text-align: center; font-size: 24rpx; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 14rpx; margin-bottom: 18rpx; padding: 14rpx 18rpx; }
.filter-group { display: flex; gap: 8rpx; }
.filter { padding: 10rpx 16rpx; border-radius: $radius-pill; color: $muted; background: #f0f3f7; font-size: 20rpx; }
.filter.active { color: $navy; background: #fff0ae; font-weight: 800; }
.batch-invoice-button { height: 58rpx; margin: 0; padding: 0 18rpx; border: 0; border-radius: $radius-pill; color: $navy; background: $yellow; font-size: 20rpx; line-height: 58rpx; font-weight: 800; }
.batch-invoice-button[disabled] { opacity: .45; }
.order-card { margin-bottom: 18rpx; padding: 26rpx; }
.order-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18rpx; }
.order-heading-copy { min-width: 0; flex: 1; }
.order-title { display: block; overflow: hidden; color: $navy; font-size: 28rpx; line-height: 1.45; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
.order-id { display: block; margin-top: 6rpx; color: #9aa7b7; font-size: 19rpx; }
.status { flex: 0 0 auto; padding: 7rpx 13rpx; border-radius: $radius-pill; color: $blue; background: #eaf3ff; font-size: 20rpx; }
.status.success { color: #178a5a; background: #e4f8ef; }
.status.warning { color: #ad6b00; background: #fff3d0; }
.status.muted { color: #7c8796; background: #eef1f4; }
.order-meta { display: flex; flex-wrap: wrap; gap: 12rpx 20rpx; margin-top: 18rpx; color: $muted; font-size: 21rpx; }
.amount { color: #d56d1c; font-weight: 800; }
.order-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12rpx; margin-top: 22rpx; }
.order-actions button { box-sizing: border-box; height: 62rpx; margin: 0; padding: 0 18rpx; border: 1rpx solid #dfe5ed; border-radius: $radius-pill; color: $navy; background: #fff; font-size: 20rpx; line-height: 62rpx; }
.primary-button { border-color: $yellow !important; background: $yellow !important; font-weight: 800; }
.offline-button { border-color: #b9d7ff !important; color: $blue !important; background: #f4f9ff !important; font-weight: 800; }
.text-button { padding: 0 8rpx !important; border: 0 !important; color: $muted !important; background: transparent !important; }
.invoice-check { display: flex; align-items: center; gap: 5rpx; color: $muted; font-size: 20rpx; }
.invoice-done { color: $success; font-size: 20rpx; }
.status-hint { display: block; margin-top: 16rpx; color: #a87318; font-size: 20rpx; line-height: 1.5; }
.status-hint.rejected { color: $danger; }
.preview-card, .invoice-card { margin-bottom: 18rpx; padding: 26rpx; }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16rpx; }
.section-title { display: block; color: $navy; font-size: 27rpx; font-weight: 900; }
.section-caption { display: block; margin-top: 6rpx; color: $muted; font-size: 20rpx; line-height: 1.4; }
.section-link { color: $blue; font-size: 21rpx; }
.preview-row { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; padding: 22rpx 0; border-bottom: 1rpx solid #edf0f4; }
.preview-row:last-child { border-bottom: 0; }
.preview-title { display: block; color: $navy; font-size: 24rpx; font-weight: 700; }
.preview-time, .invoice-meta { display: block; margin-top: 8rpx; color: $muted; font-size: 20rpx; }
.preview-arrow { color: #aab4c1; font-size: 36rpx; }

.modal-mask { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 32rpx; background: rgba(20, 43, 74, .48); }
.payment-proof-modal { box-sizing: border-box; width: 100%; max-width: 680rpx; max-height: 88vh; overflow: hidden; border-radius: 28rpx; background: #fff; }
.modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; padding: 30rpx 30rpx 22rpx; border-bottom: 1rpx solid #edf0f4; }
.modal-title { display: block; color: $navy; font-size: 30rpx; font-weight: 900; }
.modal-subtitle { display: block; margin-top: 8rpx; color: $muted; font-size: 19rpx; }
.close-button { width: 46rpx; height: 46rpx; color: #8996a8; font-size: 44rpx; line-height: 38rpx; text-align: center; }
.modal-scroll { max-height: calc(88vh - 180rpx); }
.transfer-section, .proof-section { margin: 22rpx 28rpx 0; padding: 24rpx; border: 1rpx solid #e4eaf2; border-radius: 18rpx; }
.proof-section { margin-bottom: 24rpx; background: #fbfcfe; }
.copy-button { height: 52rpx; margin: 0; padding: 0 16rpx; border: 1rpx solid #b9d7ff; border-radius: $radius-pill; color: $blue; background: #f4f9ff; font-size: 20rpx; line-height: 50rpx; }
.transfer-list { margin-top: 20rpx; }
.transfer-row { display: flex; align-items: flex-start; gap: 18rpx; padding: 16rpx 0; border-bottom: 1rpx solid #edf0f4; }
.transfer-row:last-child { border-bottom: 0; padding-bottom: 0; }
.transfer-label { flex: 0 0 130rpx; color: $muted; font-size: 21rpx; }
.transfer-value { flex: 1; color: $navy; font-size: 22rpx; line-height: 1.45; word-break: break-all; }
.personal-qr-section { margin-top: 22rpx; padding-top: 20rpx; border-top: 1rpx solid #edf0f4; }
.personal-qr-title, .personal-qr-caption { display: block; }
.personal-qr-title { color: $navy; font-size: 22rpx; font-weight: 800; }
.personal-qr-caption { margin-top: 7rpx; color: $muted; font-size: 19rpx; line-height: 1.45; }
.personal-qr-grid { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 16rpx; }
.personal-qr-card { flex: 1 1 220rpx; min-width: 220rpx; padding: 14rpx; border-radius: 14rpx; background: #f8fafc; text-align: center; }
.personal-qr-card text { display: block; color: $navy; font-size: 20rpx; font-weight: 700; }
.personal-qr-card image { display: block; width: 220rpx; height: 220rpx; margin: 12rpx auto 0; background: #fff; }
.upload-area { display: flex; align-items: center; justify-content: center; min-height: 280rpx; margin-top: 20rpx; border: 2rpx dashed #b9d7ff; border-radius: 16rpx; background: #f4f9ff; }
.upload-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30rpx; }
.upload-icon { width: 72rpx; height: 72rpx; border-radius: 50%; color: #fff; background: $blue; font-size: 54rpx; line-height: 68rpx; text-align: center; }
.upload-title { margin-top: 16rpx; color: $navy; font-size: 24rpx; font-weight: 800; }
.upload-caption, .replace-hint { display: block; margin-top: 8rpx; color: $muted; font-size: 19rpx; text-align: center; }
.proof-preview { display: block; width: 100%; height: 320rpx; }
.modal-footer { display: flex; gap: 14rpx; padding: 18rpx 28rpx calc(20rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid #edf0f4; background: #fff; }
.modal-footer button { flex: 1; height: 76rpx; margin: 0; border-radius: $radius-pill; font-size: 23rpx; line-height: 76rpx; }
.cancel-button { border: 1rpx solid #dfe5ed; color: $navy; background: #fff; }
.submit-button { border: 0; color: $navy; background: $yellow; font-weight: 800; }
.submit-button[disabled] { opacity: .45; }
.invoice-dialog { box-sizing: border-box; width: calc(100% - 64rpx); max-width: 680rpx; padding-bottom: 28rpx; }
.dialog-hint { display: block; margin: 16rpx 30rpx 0; color: $muted; font-size: 21rpx; }
.invoice-field { box-sizing: border-box; display: block; width: calc(100% - 60rpx); height: 74rpx; margin: 18rpx 30rpx 0; padding: 0 20rpx; border: 1rpx solid #dce4ee; border-radius: 14rpx; color: $navy; background: #fbfcfe; font-size: 22rpx; }
.dialog-actions { display: flex; gap: 14rpx; margin: 24rpx 30rpx 0; }
.dialog-actions button { flex: 1; height: 68rpx; margin: 0; border-radius: $radius-pill; font-size: 22rpx; line-height: 68rpx; }
@media (min-width: 700px) { .payment-proof-modal { width: 680rpx; } }
</style>
