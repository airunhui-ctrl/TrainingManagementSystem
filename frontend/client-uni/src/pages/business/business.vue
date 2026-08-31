<template>
  <view class="page">
    <view class="business-topbar" :style="{ height: nav.totalHeight + 'px', paddingTop: nav.statusBarHeight + 'px', paddingRight: (nav.capsuleRight + nav.capsuleWidth + 8) + 'px' }">
      <text class="topbar-title">订单</text>
      <view class="topbar-actions"><text class="refresh-link" :class="{ disabled: loadInFlight }" @tap="loadAll">刷新</text></view>
    </view>
    <view v-if="isLoggedIn" class="tabs">
      <text v-for="item in tabs" :key="item.key" :class="['tab', { active: tab === item.key }]" @tap="tab = item.key">{{ item.label }}</text>
    </view>

    <view v-if="!isLoggedIn" class="login-hint">
      <view class="login-hint-icon">!</view>
      <text class="login-hint-text">您尚未登录，无法查看订单详情</text>
      <button class="login-hint-btn" @tap="goOrderLogin">登录查看历史详情</button>
    </view>
    <template v-if="isLoggedIn">

    <view v-if="loadError" class="card error-state">
      <text class="error-title">业务数据加载失败</text>
      <text class="error-hint">{{ loadError }}</text>
      <button class="retry-button" @tap="loadAll">重新加载</button>
    </view>
    <view v-if="loading && !orders.length && !invoices.length && !previews.length" class="card empty-state"><text>正在加载订单记录...</text></view>
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
            <view class="order-action-main">
              <label v-if="order.status === '已支付'" class="invoice-check"><checkbox :checked="selectedInvoiceOrderIds.includes(order.id)" color="#2F80ED" @tap.stop="toggleInvoiceOrder(order.id, !selectedInvoiceOrderIds.includes(order.id))" /><text>选择开票</text></label>
              <button v-if="order.status === '已支付' && !invoicedOrderIds.has(order.id)" class="outline-button" @tap="openInvoiceDialog(order.id)">申请开票</button>
              <text v-if="order.status === '已支付' && invoicedOrderIds.has(order.id)" class="invoice-done">已提交开票</text>
              <button v-if="order.status === '待支付' && paymentInfoLoaded && paymentInfo.onlineWechatEnabled" class="primary-button" :disabled="Boolean(payingOrderKey)" @tap="payOnline(order.id, 'wechat')">{{ payingOrderKey ? '支付处理中...' : '微信支付' }}</button>
              <button v-if="order.status === '待支付' && paymentInfoLoaded && paymentInfo.onlineAlipayEnabled" class="outline-button" :disabled="Boolean(payingOrderKey)" @tap="payOnline(order.id, 'alipay')">{{ payingOrderKey ? '支付处理中...' : '支付宝支付' }}</button>
              <text v-if="order.status === '待支付' && paymentInfoLoaded && !paymentInfo.onlineWechatEnabled && !paymentInfo.onlineAlipayEnabled" class="status-hint">在线支付暂未启用，请使用线下对公转账并上传凭证。</text>
              <button v-if="order.status === '待支付'" class="offline-button" @tap="openPaymentProofModal(order.id)">提交线下支付凭证</button>
              <text v-if="order.status === '待审核'" class="status-hint">支付凭证审核中，暂不能重复提交。</text>
              <button class="outline-button" @tap="openPaymentDetail(order.id)">支付详情</button>
            </view>
            <button v-if="order.status === '待支付' || order.status === '待审核'" class="text-button cancel-order-button" :disabled="Boolean(cancellingOrderId || cancelConfirming)" @tap="cancelOrder(order.id)">{{ cancellingOrderId === order.id || cancelConfirming ? '取消中...' : '取消报名' }}</button>
          </view>
          <text v-if="order.status === '待审核'" class="status-hint">凭证已提交，等待管理端审核到账。</text>
          <text v-if="order.paymentProofStatus === 'rejected'" class="status-hint rejected">上次凭证未通过：{{ order.paymentProofRemark || '请重新上传清晰的付款凭证' }}</text>
        </view>
      </template>
      <view v-else-if="!loadError" class="card empty-state"><text>暂无支付记录</text></view>
    </template>

    <template v-else-if="tab === 'records'">
      <view class="toolbar card">
        <view class="filter-group">
          <text :class="['filter', { active: recordFilter === 'all' }]" @tap="recordFilter = 'all'">全部</text>
          <text :class="['filter', { active: recordFilter === 'registered' }]" @tap="recordFilter = 'registered'">已报名</text>
          <text :class="['filter', { active: recordFilter === 'cancelled' }]" @tap="recordFilter = 'cancelled'">已取消</text>
        </view>
      </view>
      <template v-if="recordOrders.length">
        <view v-for="order in recordOrders" :key="order.id" class="card order-card" @tap="openOrderDetail(order.id)">
          <view class="order-heading">
            <view class="order-heading-copy"><text class="order-title">{{ courseName(order.courseId) }}</text><text class="order-id">订单号：{{ order.id }}</text></view>
            <text :class="['status', statusClass(order.status)]">{{ order.status }}</text>
          </view>
          <view class="order-meta"><text>{{ order.participantCount }} 位报名人</text><text class="amount">¥{{ order.amount }}</text><text>{{ paymentMethodLabel(order) }}</text><text>{{ formatDate(order.createdAt) }}</text></view>
        </view>
      </template>
      <view v-else-if="!loadError" class="card empty-state"><text>暂无课程记录</text></view>
    </template>

    <template v-else-if="tab === 'orders'">
      <view v-if="previews.length" class="card preview-card">
        <view class="section-heading"><text class="section-title">最近浏览</text><text class="section-link" @tap="showAllPreviews = !showAllPreviews">{{ showAllPreviews ? '收起' : '查看全部' }}</text></view>
        <view v-for="item in displayedPreviews" :key="item.id" class="preview-row" @tap="openCourseDetail(item.courseId)">
          <view><text class="preview-title">{{ item.courseTitle }}</text><text class="preview-time">{{ formatDate(item.viewedAt) }}</text></view><text class="preview-arrow">›</text>
        </view>
      </view>
      <view v-else-if="!loadError" class="card empty-state"><text>暂无浏览记录</text></view>
    </template>

    <template v-else>
      <view v-if="invoices.length"><view v-for="invoice in invoices" :key="invoice.id" class="card invoice-card" @tap="openInvoiceDetail(invoice)">
        <view class="order-heading"><text class="order-title">{{ invoice.title || '企业发票' }}</text><text :class="['status', invoiceStatusClass(invoice)]">{{ invoiceStatusText(invoice) }}</text></view>
        <text class="invoice-meta">申请编号：{{ invoice.id }}</text><text v-if="invoice.retryOfInvoiceId" class="invoice-meta">来源申请：{{ invoice.retryOfInvoiceId }}</text><text v-if="invoice.invoiceNo" class="invoice-meta">发票号码：{{ invoice.invoiceNo }}</text><text v-if="invoice.status === '已驳回' && invoice.rejectReason" class="invoice-meta rejected">驳回理由：{{ invoice.rejectReason }}</text><text v-if="invoice.status === '已驳回' && !actionableRejectedIds.has(invoice.id)" class="invoice-meta">该申请已重新提交，历史记录保留</text><text v-if="invoice.invoiceFileStatus" class="invoice-meta">电子发票：{{ invoice.invoiceFileStatus }}<text v-if="invoice.invoiceFileName">（{{ invoice.invoiceFileName }}）</text></text>
        <view class="invoice-footer-row"><text class="invoice-meta invoice-time">申请时间：{{ formatDate(invoice.createdAt) }}</text><view class="invoice-card-actions"><button v-if="actionableRejectedIds.has(invoice.id)" class="retry-invoice-button" @tap.stop="openInvoiceReapply(invoice)">修改后重新申请</button><button v-if="invoice.invoiceFileStatus === '已上传'" class="outline-button invoice-file-button" @tap.stop="openInvoiceFile(invoice)">查看电子发票</button><button class="invoice-detail-button" @tap.stop="openInvoiceDetail(invoice)">查看详情</button></view></view>
      </view></view>
      <view v-else-if="!loadError" class="card empty-state"><text>暂无开票记录</text></view>
    </template>

    <!-- 上半部分为对公账户信息，下半部分为凭证图片上传 -->
    <view v-if="paymentProofModalOpen" class="modal-mask" @tap.self="closePaymentProofModal">
      <view class="payment-proof-modal" @tap.stop>
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
            <view class="upload-area" :class="{ disabled: uploading || proofConfirming }" @tap="chooseProofImage">
              <image v-if="selectedProofImage" class="proof-preview" :src="selectedProofImage" mode="aspectFit" />
              <view v-else class="upload-placeholder"><text class="upload-icon">+</text><text class="upload-title">选择凭证图片</text><text class="upload-caption">支持 JPG、PNG，单张不超过 5MB</text></view>
            </view>
            <text v-if="selectedProofImage" class="replace-hint">点击图片可重新选择</text>
          </view>
        </scroll-view>
        <view class="modal-footer"><button class="cancel-button" :disabled="uploading || proofConfirming" @tap="closePaymentProofModal">取消</button><button class="submit-button" :disabled="!selectedProofImage || uploading || proofConfirming" @tap="submitPaymentProof">{{ uploading ? '上传中...' : proofConfirming ? '确认中...' : '上传并提交审核' }}</button></view>
      </view>
    </view>

    <view v-if="invoiceDialogOpen" class="modal-mask" @tap.self="closeInvoiceDialog">
      <view class="invoice-dialog card" @tap.stop>
        <view class="modal-header"><text class="modal-title">{{ reapplyInvoiceId ? '修改后重新申请开票' : '提交开票信息' }}</text><text class="close-button" @tap="closeInvoiceDialog">×</text></view>
        <view class="modal-scroll invoice-scroll">
          <text class="dialog-hint">已选择 {{ selectedInvoiceOrderIds.length }} 笔订单{{ reapplyInvoiceId ? '；请根据驳回理由修改信息后重新提交' : '' }}</text>
          <input v-model="invoiceForm.title" class="invoice-field" placeholder="请输入发票抬头" /><input v-model="invoiceForm.taxNo" class="invoice-field" placeholder="请输入纳税人识别号" /><input v-model="invoiceForm.email" class="invoice-field" placeholder="请输入接收发票的邮箱" />
        </view>
        <view class="dialog-actions invoice-actions"><button class="cancel-button" :disabled="invoiceSubmitting || invoiceConfirming" @tap="closeInvoiceDialog">取消</button><button class="submit-button" :disabled="!selectedInvoiceOrderIds.length || invoiceSubmitting || invoiceConfirming" @tap="submitInvoice">{{ invoiceSubmitting ? '提交中...' : invoiceConfirming ? '确认中...' : reapplyInvoiceId ? '重新提交申请' : '提交申请' }}</button></view>
      </view>
    </view>

    <view v-if="invoiceDetail" class="modal-mask" @tap.self="closeInvoiceDetail">
      <view class="invoice-detail-modal" @tap.stop>
        <view class="modal-header"><view><text class="modal-title">开票申请详情</text><text class="modal-subtitle">{{ invoiceDetail.id }}</text></view><text class="close-button" @tap="closeInvoiceDetail">×</text></view>
        <view class="modal-scroll invoice-detail-scroll">
          <view class="invoice-detail-section">
            <view class="invoice-detail-row"><text class="invoice-detail-label">发票抬头</text><text class="invoice-detail-value">{{ invoiceDetail.title || '-' }}</text></view>
            <view class="invoice-detail-row"><text class="invoice-detail-label">纳税人识别号</text><text class="invoice-detail-value">{{ invoiceDetail.taxNo || '-' }}</text></view>
            <view class="invoice-detail-row"><text class="invoice-detail-label">接收邮箱</text><text class="invoice-detail-value">{{ invoiceDetail.email || '-' }}</text></view>
            <view class="invoice-detail-row"><text class="invoice-detail-label">申请状态</text><text class="invoice-detail-value">{{ invoiceDetail.status || '-' }}</text></view>
            <view class="invoice-detail-row"><text class="invoice-detail-label">关联订单</text><text class="invoice-detail-value">{{ (invoiceDetail.orderIds || []).join('、') || '-' }}</text></view>
            <view v-if="invoiceDetail.retryOfInvoiceId" class="invoice-detail-row"><text class="invoice-detail-label">来源申请</text><text class="invoice-detail-value">{{ invoiceDetail.retryOfInvoiceId }}</text></view>
            <view v-if="invoiceDetail.invoiceNo" class="invoice-detail-row"><text class="invoice-detail-label">发票号码</text><text class="invoice-detail-value">{{ invoiceDetail.invoiceNo }}</text></view>
            <view class="invoice-detail-row"><text class="invoice-detail-label">电子发票</text><text class="invoice-detail-value">{{ invoiceDetail.invoiceFileStatus || '未生成' }}<text v-if="invoiceDetail.invoiceFileName">（{{ invoiceDetail.invoiceFileName }}）</text></text></view>
            <view v-if="invoiceDetail.rejectReason" class="invoice-detail-row"><text class="invoice-detail-label">驳回理由</text><text class="invoice-detail-value rejected">{{ invoiceDetail.rejectReason }}</text></view>
            <view v-if="invoiceDetail.remark" class="invoice-detail-row"><text class="invoice-detail-label">备注</text><text class="invoice-detail-value">{{ invoiceDetail.remark }}</text></view>
            <view class="invoice-detail-row"><text class="invoice-detail-label">申请时间</text><text class="invoice-detail-value">{{ formatDate(invoiceDetail.createdAt) }}</text></view>
            <view v-if="invoiceDetail.processedAt" class="invoice-detail-row"><text class="invoice-detail-label">处理时间</text><text class="invoice-detail-value">{{ formatDate(invoiceDetail.processedAt) }}</text></view>
          </view>
        </view>
        <view class="dialog-actions invoice-detail-actions"><button class="cancel-button" @tap="closeInvoiceDetail">关闭</button><button v-if="actionableRejectedIds.has(invoiceDetail.id)" class="submit-button" @tap="openReapplyFromDetail(invoiceDetail)">修改后重新申请</button><button v-if="invoiceDetail.invoiceFileStatus === '已上传'" class="outline-button" @tap="openFileFromDetail(invoiceDetail)">查看电子发票</button></view>
      </view>
    </view>

    <view v-if="orderDetail" class="modal-mask" @tap.self="orderDetail = null">
      <view class="invoice-detail-modal" @tap.stop>
        <view class="modal-header"><view><text class="modal-title">订单详情</text><text class="modal-subtitle">{{ orderDetail.id }}</text></view><text class="close-button" @tap="orderDetail = null">×</text></view>
        <view class="modal-scroll invoice-detail-scroll">
          <view class="invoice-detail-section">
            <view class="invoice-detail-row"><text class="invoice-detail-label">课程</text><text class="invoice-detail-value">{{ orderDetail.courseTitle || '-' }}</text></view>
            <view class="invoice-detail-row"><text class="invoice-detail-label">订单状态</text><text class="invoice-detail-value">{{ orderDetail.status || '-' }}</text></view>
            <view class="invoice-detail-row"><text class="invoice-detail-label">报名人数</text><text class="invoice-detail-value">{{ orderDetail.participantCount }}</text></view>
            <view class="invoice-detail-row"><text class="invoice-detail-label">原始金额</text><text class="invoice-detail-value">¥{{ orderDetail.originalAmount }}</text></view>
            <view class="invoice-detail-row"><text class="invoice-detail-label">优惠金额</text><text class="invoice-detail-value">¥{{ orderDetail.discount }}</text></view>
            <view class="invoice-detail-row"><text class="invoice-detail-label">应付金额</text><text class="invoice-detail-value">¥{{ orderDetail.amount }}</text></view>
            <view class="invoice-detail-row"><text class="invoice-detail-label">支付方式</text><text class="invoice-detail-value">{{ orderDetail.paymentMethod || '-' }}</text></view>
            <view class="invoice-detail-row"><text class="invoice-detail-label">创建时间</text><text class="invoice-detail-value">{{ formatDate(orderDetail.createdAt) }}</text></view>
          </view>
          <view class="invoice-detail-section">
            <view class="section-heading"><text class="section-title">报名人员</text></view>
            <view v-for="(participant, index) in orderDetail.participants" :key="index" class="invoice-detail-row">
              <text class="invoice-detail-label">{{ index + 1 }}. {{ participant.name || '未命名' }}</text>
              <text class="invoice-detail-value">{{ participant.phone || participant.company || '-' }}</text>
            </view>
          </view>
        </view>
        <view class="dialog-actions invoice-detail-actions"><button class="cancel-button" @tap="orderDetail = null">关闭</button></view>
      </view>
    </view>

    <view v-if="paymentDetail" class="modal-mask" @tap.self="paymentDetail = null">
      <view class="invoice-detail-modal" @tap.stop>
        <view class="modal-header"><view><text class="modal-title">支付详情</text><text class="modal-subtitle">{{ paymentDetail.id }}</text></view><text class="close-button" @tap="paymentDetail = null">×</text></view>
        <view class="modal-scroll invoice-detail-scroll">
          <view class="invoice-detail-section">
            <view class="invoice-detail-row"><text class="invoice-detail-label">课程</text><text class="invoice-detail-value">{{ paymentDetail.courseTitle || '-' }}</text></view>
            <view class="invoice-detail-row"><text class="invoice-detail-label">订单状态</text><text class="invoice-detail-value">{{ paymentDetail.status || '-' }}</text></view>
            <view class="invoice-detail-row"><text class="invoice-detail-label">支付方式</text><text class="invoice-detail-value">{{ paymentDetail.paymentMethod || '-' }}</text></view>
            <view class="invoice-detail-row"><text class="invoice-detail-label">支付渠道</text><text class="invoice-detail-value">{{ paymentDetail.paymentChannel || '-' }}</text></view>
            <view class="invoice-detail-row"><text class="invoice-detail-label">凭证状态</text><text class="invoice-detail-value">{{ paymentDetail.paymentProofStatus || '-' }}</text></view>
            <view v-if="paymentDetail.paymentProofRemark" class="invoice-detail-row"><text class="invoice-detail-label">凭证说明</text><text class="invoice-detail-value">{{ paymentDetail.paymentProofRemark }}</text></view>
            <view class="invoice-detail-row"><text class="invoice-detail-label">金额</text><text class="invoice-detail-value">¥{{ paymentDetail.amount }}</text></view>
          </view>
          <view class="invoice-detail-section">
            <view class="section-heading"><text class="section-title">支付流水</text></view>
            <view v-for="transaction in paymentDetail.paymentTransactions" :key="transaction.id" class="invoice-detail-row">
              <text class="invoice-detail-label">{{ transaction.channel }} · {{ transaction.status }}</text>
              <text class="invoice-detail-value">{{ transaction.providerTradeNo || transaction.outTradeNo }}</text>
            </view>
            <view v-if="!paymentDetail.paymentTransactions.length" class="invoice-detail-row"><text class="invoice-detail-label">暂无支付流水</text><text class="invoice-detail-value">-</text></view>
          </view>
        </view>
        <view class="dialog-actions invoice-detail-actions"><button class="cancel-button" @tap="paymentDetail = null">关闭</button></view>
      </view>
    </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onShareAppMessage, onShow, onUnload } from '@dcloudio/uni-app'
import { api, apiAssetUrl, downloadInvoiceFile, type ApiCourse, uploadPaymentProof } from '../../common/api'
import { tokenStorage } from '../../common/auth'
import { showClientConfirm } from '../../common/confirm'
import { actionableRejectedInvoices, consumeBusinessTargetInvoice, consumeBusinessTargetTab } from '../../common/invoice-notice'
import { goLogin } from '../../common/login-redirect'
import { useNavLayout } from '../../common/nav-layout'
import { requestNativePayment } from '../../common/payment'
import { bindWechatOpenIdSilently } from '../../common/wechat-bind'

type TabKey = 'payments' | 'records' | 'orders' | 'invoices'
type Order = { id: string; courseId: string; participantCount: number; amount: number; status: string; paymentMethod?: string; paymentChannel?: string; paymentProofStatus?: string; paymentProofRemark?: string; createdAt: string }
type Invoice = { id: string; status: string; title?: string; taxNo?: string; email?: string; remark?: string; invoiceNo?: string; rejectReason?: string | null; retryOfInvoiceId?: string | null; orderIds?: string[]; invoiceFileStatus?: string; invoiceFileName?: string | null; createdAt: string; processedAt?: string }
type Preview = { id: string; courseId: string; courseTitle: string; viewedAt: string }
type PaymentInfo = { accountName?: string; bankName?: string; accountNo?: string; qrCodeText?: string; wechatQrImage?: string; alipayQrImage?: string; onlineWechatEnabled?: boolean; onlineAlipayEnabled?: boolean }
type OrderDetail = { id: string; courseId: string; courseTitle?: string; participantCount: number; originalAmount: number; discount: number; amount: number; status: string; paymentMethod?: string; paymentChannel?: string; paymentProofStatus?: string; paymentProofRemark?: string; participants: Array<Record<string, string>>; createdAt: string; paymentTransactions: Array<{ id: string; channel: string; provider: string; outTradeNo: string; providerTradeNo?: string | null; amount: number; status: string; paidAt?: string | null; createdAt: string }> }

const tabs: Array<{ key: TabKey; label: string }> = [{ key: 'payments', label: '支付记录' }, { key: 'records', label: '课程记录' }, { key: 'orders', label: '浏览记录' }, { key: 'invoices', label: '开票记录' }]
const tab = ref<TabKey>('payments')
const paymentFilter = ref<'all' | 'paid'>('all')
const recordFilter = ref<'all' | 'registered' | 'cancelled'>('all')
const loading = ref(false)
const loadInFlight = ref(false)
const orders = ref<Order[]>([])
const invoices = ref<Invoice[]>([])
const previews = ref<Preview[]>([])
const courses = ref<Record<string, ApiCourse>>({})
const selectedInvoiceOrderIds = ref<string[]>([])
const invoiceDialogOpen = ref(false)
const invoiceDetail = ref<Invoice | null>(null)
const pendingInvoiceDetailId = ref('')
const invoiceForm = reactive({ title: '', taxNo: '', email: '' })
const invoiceSubmitting = ref(false)
const invoiceConfirming = ref(false)
const reapplyInvoiceId = ref('')
const showAllPreviews = ref(false)
const paymentProofModalOpen = ref(false)
const selectedOrderId = ref('')
const selectedProofImage = ref('')
const uploading = ref(false)
const proofConfirming = ref(false)
const cancellingOrderId = ref('')
const cancelConfirming = ref(false)
const payingOrderKey = ref('')
const paymentInfo = reactive<PaymentInfo>({})
const paymentInfoLoaded = ref(false)
const loadError = ref('')
const isLoggedIn = ref(Boolean(tokenStorage.getAccessToken()))
const orderDetail = ref<OrderDetail | null>(null)
const paymentDetail = ref<OrderDetail | null>(null)
const detailLoading = ref(false)
const nav = useNavLayout()
let pageUnloaded = false

const paidOrders = computed(() => orders.value.filter((order) => order.status === '已支付'))
const paymentOrders = computed(() => paymentFilter.value === 'paid' ? paidOrders.value : orders.value)
const recordOrders = computed(() => orders.value.filter((order) => recordFilter.value === 'all' || (recordFilter.value === 'registered' ? order.status !== '已取消' : order.status === '已取消')))
const invoicedOrderIds = computed(() => new Set(invoices.value.filter((invoice) => invoice.status !== '已驳回').flatMap((invoice) => invoice.orderIds || [])))
const actionableRejectedIds = computed(() => new Set(actionableRejectedInvoices(invoices.value).map((invoice) => invoice.id)))
const displayedPreviews = computed(() => showAllPreviews.value ? previews.value : previews.value.slice(0, 3))
const invoiceSelectionLabel = computed(() => selectedInvoiceOrderIds.value.length ? '（' + selectedInvoiceOrderIds.value.length + '）' : '')
const courseName = (id: string) => courses.value[id]?.title || '培训课程'
const paymentMethodLabel = (order: Order) => {
  if (order.paymentMethod === 'offline') return '对公转账'
  if (order.paymentChannel === 'alipay') return '支付宝支付'
  if (order.paymentChannel === 'wechat') return '微信支付'
  // A newly-created order does not have a payment channel until the user
  // chooses one in the bill dialog. Do not present the historical default
  // (微信支付) as if the user had already selected or completed it.
  if (order.status === '待支付') return '待选择支付方式'
  return order.paymentMethod === 'online' ? '在线支付' : '未选择支付方式'
}
const statusClass = (status: string) => status === '已支付' ? 'success' : status === '待审核' ? 'warning' : status === '已取消' ? 'muted' : status === '已驳回' ? 'rejected' : ''
const invoiceStatusText = (invoice: Invoice) => invoice.status === '已驳回' && !actionableRejectedIds.value.has(invoice.id) ? '已重新提交' : invoice.status
const invoiceStatusClass = (invoice: Invoice) => invoice.status === '已驳回' && !actionableRejectedIds.value.has(invoice.id) ? 'muted' : statusClass(invoice.status)
const formatDate = (value: string) => value ? value.replace('T', ' ').replace(/\.\d+Z$/, '') : '-'

const loadAll = async () => {
  if (loadInFlight.value) return
  loadInFlight.value = true
  loading.value = true
  loadError.value = ''
  try {
    const [orderResult, invoiceResult, courseResult, previewResult, paymentResult] = await Promise.all([api.listOrders(), api.listInvoices(), api.listCourses(), api.listPreviews(), api.paymentInfo()])
    orders.value = orderResult.items as Order[]
    invoices.value = invoiceResult.items
    const targetInvoiceId = pendingInvoiceDetailId.value
    if (targetInvoiceId) {
      const matched = invoices.value.find((invoice) => invoice.id === targetInvoiceId)
      if (matched) { invoiceDetail.value = matched; pendingInvoiceDetailId.value = '' }
    }
    courses.value = Object.fromEntries(courseResult.items.map((course) => [course.id, course]))
    previews.value = previewResult.items
    Object.assign(paymentInfo, paymentResult)
    paymentInfoLoaded.value = true
  } catch (error: any) {
    loadError.value = error?.message || '网络异常，请检查网络后重试'
    paymentInfoLoaded.value = false
    uni.showToast({ title: '业务数据加载失败，请点击重试', icon: 'none' })
  } finally { loading.value = false; loadInFlight.value = false }
}
const payOnline = async (id: string, channel: 'wechat' | 'alipay') => {
  const operationKey = `${id}:${channel}`
  if (payingOrderKey.value) return
  payingOrderKey.value = operationKey
  try {
    if (channel === 'wechat') await bindWechatOpenIdSilently()
    const intent = await api.createPaymentIntent(id, channel)
    if (!intent.ready) { uni.showToast({ title: intent.message || '支付渠道尚未配置', icon: 'none' }); return }
    const result = await requestNativePayment(intent)
    if (result === 'redirected') { uni.showToast({ title: '已跳转支付，请完成付款后返回刷新订单', icon: 'none' }); return }
    if (result === 'unavailable') { uni.showToast({ title: '当前设备无法打开支付，请在支持的微信/支付宝环境操作', icon: 'none' }); return }
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (pageUnloaded) return
      const status = await api.paymentStatus(id)
      if (pageUnloaded) return
      if (status.paid) { uni.showToast({ title: (channel === 'alipay' ? '支付宝' : '微信') + '支付成功', icon: 'none' }); await loadAll(); return }
      if (attempt < 9) await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    if (pageUnloaded) return
    uni.showToast({ title: '暂未收到支付平台回调，请稍后刷新订单', icon: 'none' })
  } catch (error: any) { uni.showToast({ title: error?.message || '支付失败', icon: 'none' }) } finally { payingOrderKey.value = '' }
}

const openPaymentProofModal = async (orderId: string) => {
  selectedOrderId.value = orderId; selectedProofImage.value = ''; paymentProofModalOpen.value = true
  try { Object.assign(paymentInfo, await api.paymentInfo()) } catch (error: any) {
    paymentProofModalOpen.value = false
    uni.showToast({ title: error?.message || '对公账户信息加载失败', icon: 'none' })
  }
}
const closePaymentProofModal = () => {
  if (uploading.value || proofConfirming.value) return
  paymentProofModalOpen.value = false; selectedOrderId.value = ''; selectedProofImage.value = ''
}
const copyTransferInfo = () => {
  const text = ['账户名称：' + (paymentInfo.accountName || ''), '开户银行：' + (paymentInfo.bankName || ''), '银行账号：' + (paymentInfo.accountNo || ''), paymentInfo.qrCodeText ? '收款备注：' + paymentInfo.qrCodeText : ''].filter(Boolean).join('\n')
  uni.setClipboardData({ data: text, success: () => uni.showToast({ title: '转账信息已复制', icon: 'none' }) })
}
const chooseProofImage = () => {
  if (uploading.value || proofConfirming.value) return
  uni.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: (result) => { selectedProofImage.value = result.tempFilePaths?.[0] || '' } })
}
const submitPaymentProof = async () => {
  if (!selectedOrderId.value || !selectedProofImage.value || uploading.value || proofConfirming.value) return
  proofConfirming.value = true
  try {
    let confirmation = false
    try { confirmation = await showClientConfirm({ title: '确认提交支付凭证', content: '提交后将进入管理端审核，确定继续吗？' }) } catch { confirmation = false; uni.showToast({ title: '确认弹窗打开失败，请重试', icon: 'none' }) }
    if (!confirmation) return
    uploading.value = true
    try {
      await uploadPaymentProof(selectedOrderId.value, selectedProofImage.value)
      paymentProofModalOpen.value = false
      selectedOrderId.value = ''
      selectedProofImage.value = ''
      uni.showToast({ title: '凭证已上传，等待审核', icon: 'none' }); await loadAll()
    } catch (error: any) { uni.showToast({ title: error?.message || '凭证上传失败，请重试', icon: 'none' }) } finally { uploading.value = false }
  } finally { proofConfirming.value = false }
}

const cancelOrder = async (id: string) => {
  if (cancellingOrderId.value || cancelConfirming.value) return
  cancelConfirming.value = true
  try {
    let confirmation = false
    try { confirmation = await showClientConfirm({ title: '确认取消报名', content: '取消后本次报名将不再保留待支付状态，确定继续吗？' }) } catch { confirmation = false; uni.showToast({ title: '确认弹窗打开失败，请重试', icon: 'none' }) }
    if (!confirmation) return
    cancellingOrderId.value = id
    try { await api.cancelOrder(id); uni.showToast({ title: '报名已取消', icon: 'none' }); await loadAll() } catch (error: any) { uni.showToast({ title: error?.message || '取消失败', icon: 'none' }) } finally { cancellingOrderId.value = '' }
  } finally { cancelConfirming.value = false }
}
const openOrderDetail = async (id: string) => {
  if (detailLoading.value) return
  detailLoading.value = true
  try {
    orderDetail.value = await api.getOrder(id)
  } catch (error: any) {
    uni.showToast({ title: error?.message || '订单详情加载失败', icon: 'none' })
  } finally {
    detailLoading.value = false
  }
}
const openPaymentDetail = async (id: string) => {
  if (detailLoading.value) return
  detailLoading.value = true
  try {
    paymentDetail.value = await api.getOrder(id)
  } catch (error: any) {
    uni.showToast({ title: error?.message || '支付详情加载失败', icon: 'none' })
  } finally {
    detailLoading.value = false
  }
}
const toggleInvoiceOrder = (id: string, checked: boolean) => {
  if (invoicedOrderIds.value.has(id)) return
  selectedInvoiceOrderIds.value = checked ? [...new Set([...selectedInvoiceOrderIds.value, id])] : selectedInvoiceOrderIds.value.filter((item) => item !== id)
}
const openInvoiceDialog = (id?: string) => {
  if (id) toggleInvoiceOrder(id, true)
  if (!selectedInvoiceOrderIds.value.length) return uni.showToast({ title: '请先选择已支付订单', icon: 'none' })
  reapplyInvoiceId.value = ''
  invoiceForm.title = ''
  invoiceForm.taxNo = ''
  invoiceForm.email = ''
  invoiceDialogOpen.value = true
}
const openInvoiceReapply = (invoice: Invoice) => {
  if (invoice.status !== '已驳回' || !invoice.orderIds?.length) return uni.showToast({ title: '该申请没有可重新提交的订单', icon: 'none' })
  reapplyInvoiceId.value = invoice.id
  selectedInvoiceOrderIds.value = [...invoice.orderIds]
  invoiceForm.title = invoice.title || ''
  invoiceForm.taxNo = invoice.taxNo || ''
  invoiceForm.email = invoice.email || ''
  invoiceDialogOpen.value = true
}
const closeInvoiceDialog = () => { if (invoiceSubmitting.value || invoiceConfirming.value) return; invoiceDialogOpen.value = false; reapplyInvoiceId.value = '' }
const openInvoiceDetail = (invoice: Invoice) => { invoiceDetail.value = invoice }
const closeInvoiceDetail = () => { invoiceDetail.value = null }
const openReapplyFromDetail = (invoice: Invoice) => { closeInvoiceDetail(); openInvoiceReapply(invoice) }
const openFileFromDetail = (invoice: Invoice) => { closeInvoiceDetail(); openInvoiceFile(invoice) }
const submitInvoice = async () => {
  if (invoiceSubmitting.value || invoiceConfirming.value) return
  if (!invoiceForm.title.trim() || !invoiceForm.taxNo.trim() || !invoiceForm.email.trim()) return uni.showToast({ title: '请填写完整开票信息', icon: 'none' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoiceForm.email.trim())) return uni.showToast({ title: '请输入正确的邮箱地址', icon: 'none' })
  invoiceConfirming.value = true
  try {
    let confirmation = false
    try { confirmation = await showClientConfirm({ title: '确认提交开票申请', content: `将为 ${selectedInvoiceOrderIds.value.length} 笔订单提交开票申请，确定继续吗？` }) } catch { confirmation = false; uni.showToast({ title: '确认弹窗打开失败，请重试', icon: 'none' }) }
    if (!confirmation) return
    invoiceSubmitting.value = true
    try {
      if (reapplyInvoiceId.value) await api.reapplyInvoice(reapplyInvoiceId.value, invoiceForm.title.trim(), invoiceForm.taxNo.trim(), invoiceForm.email.trim())
      else await api.createInvoice(invoiceForm.title.trim(), invoiceForm.taxNo.trim(), invoiceForm.email.trim(), selectedInvoiceOrderIds.value)
      selectedInvoiceOrderIds.value = []
      invoiceForm.title = ''
      invoiceForm.taxNo = ''
      invoiceForm.email = ''
      reapplyInvoiceId.value = ''
      // The normal close handler intentionally blocks while submitting. Close
      // explicitly after a successful request so the completed form cannot
      // remain visible with zero selected orders.
      invoiceDialogOpen.value = false
      uni.showToast({ title: '开票申请已提交', icon: 'none' }); await loadAll()
    } catch (error: any) { uni.showToast({ title: error?.message || '开票申请失败', icon: 'none' }) } finally { invoiceSubmitting.value = false }
  } finally { invoiceConfirming.value = false }
}
const openInvoiceFile = async (invoice: Invoice) => {
  if (invoice.invoiceFileStatus !== '已上传') return uni.showToast({ title: '电子发票文件尚未上传', icon: 'none' })
  try {
    const filePath = await downloadInvoiceFile(invoice.id)
    uni.openDocument({ filePath, showMenu: true, fail: () => uni.showToast({ title: '当前设备无法打开该发票文件', icon: 'none' }) })
  } catch (error: any) { uni.showToast({ title: error?.message || '电子发票下载失败', icon: 'none' }) }
}
const openCourseDetail = (courseId: string) => { uni.navigateTo({ url: '/pages/detail/detail?id=' + courseId }) }
const goOrderLogin = () => goLogin('/pages/business/business')
const showBusinessPage = () => {
  isLoggedIn.value = Boolean(tokenStorage.getAccessToken())
  if (!isLoggedIn.value) return
  const targetInvoiceId = consumeBusinessTargetInvoice()
  if (targetInvoiceId) pendingInvoiceDetailId.value = targetInvoiceId
  if (consumeBusinessTargetTab()) tab.value = 'invoices'
  void loadAll()
}
onShow(showBusinessPage)
onUnload(() => { pageUnloaded = true })
onShareAppMessage(() => ({ title: '我的订单', path: '/pages/business/business' }))
</script>

<style scoped lang="scss">
.page { min-height: 100vh; padding: 40rpx 32rpx calc(140rpx + env(safe-area-inset-bottom)); background: #f6f8fb; }
.business-topbar { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box; height: calc(92rpx + var(--status-bar-height)); margin: -40rpx -32rpx 28rpx; padding: var(--status-bar-height) 32rpx 0; color: #243956; background: rgba(255, 255, 255, .82); backdrop-filter: blur(18px); box-shadow: 0 4rpx 16rpx rgba(21, 70, 158, .08); }.business-topbar .topbar-title { position: absolute; left: 0; right: 0; top: calc(var(--status-bar-height) + 12rpx); bottom: -12rpx; display: flex; align-items: center; justify-content: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #243956; font-size: 30rpx; font-weight: 800; pointer-events: none; }.business-topbar .topbar-actions { display: flex; align-items: center; justify-content: flex-end; gap: 22rpx; min-width: 180rpx; }.business-topbar .topbar-link, .business-topbar .topbar-refresh { color: #2f80ed; font-size: 22rpx; font-weight: 800; }.business-topbar .topbar-refresh.disabled { opacity: .5; }
.login-hint { display: flex; flex-direction: column; align-items: center; margin: 180rpx -32rpx 0; padding: 0; }.login-hint-icon { display: grid; place-items: center; width: 132rpx; height: 132rpx; border: 2rpx solid #cfe0f5; border-radius: 50%; color: #2f80ed; background: #eaf3ff; font-size: 64rpx; font-weight: 900; line-height: 1; }.login-hint-text { display: block; width: 60%; margin-top: 46rpx; color: #8492a7; font-size: 30rpx; line-height: 1.7; text-align: center; }.login-hint-btn { width: 60%; height: 88rpx; margin-top: 60rpx; border: 0; border-radius: $radius-pill; color: #17366d; background: $yellow; font-size: 28rpx; line-height: 88rpx; font-weight: 800; }.login-hint-btn::after { border: 0; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 20rpx; }.page-header-actions { display: flex; align-items: center; gap: 20rpx; }.refresh-link { color: $blue; font-size: 23rpx; }.refresh-link.disabled { opacity: .55; }
.eyebrow { display: block; color: #8b98aa; font-size: 18rpx; letter-spacing: 2rpx; }
.page-title { display: block; margin-top: 8rpx; color: $navy; font-size: 40rpx; font-weight: 900; }
.invoice-link { color: $blue; font-size: 23rpx; }
.invoice-footer-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 12rpx; margin-top: 8rpx; }
.invoice-time { display: block; min-width: 0; margin-top: 0; }
.invoice-card-actions { display: flex; width: auto; min-width: 0; align-items: center; justify-content: flex-end; gap: 12rpx; margin-top: 0; }
.invoice-card-actions button { display: block; flex: 0 0 auto; width: auto !important; min-width: 0 !important; }
.retry-invoice-button { box-sizing: border-box; width: fit-content !important; height: 54rpx; margin: 0; padding: 0 20rpx; border: 1rpx solid #b9d2f5; border-radius: 999rpx; color: $blue; background: #f5f9ff; font-size: 21rpx; line-height: 52rpx; }
.retry-invoice-button::after { border: 0; }
.invoice-file-button { margin-top: 0; align-self: center; }
.tabs { display: flex; gap: 12rpx; margin: 28rpx 0 20rpx; overflow-x: auto; white-space: nowrap; }
.tab { padding: 16rpx 24rpx; border-radius: $radius-pill; color: $muted; background: #edf0f4; font-size: 22rpx; }
.tab.active { color: $navy; background: $yellow; font-weight: 800; }
.card { border-radius: $radius-lg; background: #fff; box-shadow: 0 8rpx 28rpx rgba(32, 62, 113, .07); }
.empty-state { padding: 68rpx 30rpx; color: $muted; text-align: center; font-size: 24rpx; }.error-state { display: flex; flex-direction: column; align-items: center; margin-bottom: 18rpx; padding: 28rpx 24rpx; color: $muted; text-align: center; }.error-title { color: $navy; font-size: 25rpx; font-weight: 800; }.error-hint { margin-top: 8rpx; line-height: 1.5; }.retry-button { width: 210rpx; height: 60rpx; margin-top: 16rpx; border: 0; border-radius: $radius-pill; color: $navy; background: $yellow; font-size: 21rpx; line-height: 60rpx; font-weight: 800; }.retry-button::after { border: 0; }
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
.status { flex: 0 0 auto; padding: 7rpx 13rpx; border-radius: $radius-pill; color: $blue; background: #eaf3ff; font-size: 20rpx; }.status.rejected { color: #b65c20; background: #fff1e8; }
.status.success { color: #178a5a; background: #e4f8ef; }
.status.warning { color: #ad6b00; background: #fff3d0; }
.status.muted { color: #7c8796; background: #eef1f4; }
.order-meta { display: flex; flex-wrap: wrap; gap: 12rpx 20rpx; margin-top: 18rpx; color: $muted; font-size: 21rpx; }
.amount { color: #d56d1c; font-weight: 800; }
.order-actions { display: flex; align-items: flex-start; justify-content: space-between; gap: 12rpx; margin-top: 22rpx; }
.order-action-main { display: flex; flex: 1 1 auto; min-width: 0; flex-wrap: wrap; align-items: center; gap: 12rpx; }
.order-action-main .status-hint { flex: 1 0 100%; }
.cancel-order-button { flex: 0 0 auto; align-self: center; margin-left: auto !important; }
.order-actions button { box-sizing: border-box; min-width: 142rpx; height: 62rpx; margin: 0; padding: 0 20rpx; border: 1rpx solid #d7e0eb; border-radius: $radius-pill; color: $navy; background: #fff; font-size: 20rpx; line-height: 60rpx; font-weight: 700; box-shadow: none; }
.order-actions button::after { border: 0; }
.order-actions button[disabled] { opacity: .55; }
.outline-button { border-color: #c9d9ec !important; color: $blue !important; background: #fff !important; }
.primary-button { border-color: $yellow !important; color: $navy !important; background: $yellow !important; font-weight: 800; }
.offline-button { border-color: #a9ccf5 !important; color: #2368c7 !important; background: #f2f8ff !important; font-weight: 800; }
.text-button { min-width: auto !important; height: auto !important; padding: 0 6rpx !important; border: 0 !important; color: $muted !important; background: transparent !important; font-weight: 500 !important; line-height: 62rpx !important; }
.text-button:active { color: $danger !important; background: transparent !important; }
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

.modal-mask { position: fixed; inset: 0; z-index: 1000; z-index: var(--client-business-modal-layer, 1000); display: flex; align-items: center; justify-content: center; box-sizing: border-box; padding: 32rpx 24rpx calc(32rpx + env(safe-area-inset-bottom)); background: rgba(20, 43, 74, .48); }
.modal-mask { z-index: var(--client-business-modal-layer, 1000) !important; }
.payment-proof-modal { display: flex; flex-direction: column; box-sizing: border-box; width: 100%; max-width: 680rpx; height: min(calc(100vh - 64rpx - env(safe-area-inset-bottom)), 1180rpx); max-height: calc(100vh - 64rpx - env(safe-area-inset-bottom)); margin-top: 120rpx; overflow: hidden; border-radius: 28rpx; background: #fff; }
.modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; padding: 30rpx 30rpx 22rpx; border-bottom: 1rpx solid #edf0f4; }
.modal-title { display: block; color: $navy; font-size: 30rpx; font-weight: 900; }
.modal-subtitle { display: block; margin-top: 8rpx; color: $muted; font-size: 19rpx; }
.close-button { width: 46rpx; height: 46rpx; color: #8996a8; font-size: 44rpx; line-height: 38rpx; text-align: center; }
.modal-scroll { flex: 1 1 auto; min-height: 0; height: auto; max-height: none; }
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
.upload-area { display: flex; align-items: center; justify-content: center; min-height: 280rpx; margin-top: 20rpx; border: 2rpx dashed #b9d7ff; border-radius: 16rpx; background: #f4f9ff; }.upload-area.disabled { opacity: .55; pointer-events: none; }
.upload-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30rpx; }
.upload-icon { width: 72rpx; height: 72rpx; border-radius: 50%; color: #fff; background: $blue; font-size: 54rpx; line-height: 68rpx; text-align: center; }
.upload-title { margin-top: 16rpx; color: $navy; font-size: 24rpx; font-weight: 800; }
.upload-caption, .replace-hint { display: block; margin-top: 8rpx; color: $muted; font-size: 19rpx; text-align: center; }
.proof-preview { display: block; width: 100%; height: 320rpx; }
.modal-footer { display: flex; flex: 0 0 auto; gap: 14rpx; padding: 18rpx 28rpx calc(28rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid #edf0f4; background: #fff; }
.modal-footer button { flex: 1; height: 76rpx; margin: 0; border-radius: $radius-pill; font-size: 23rpx; line-height: 76rpx; }
.cancel-button { border: 1rpx solid #dfe5ed; color: $navy; background: #fff; }
.submit-button { border: 0; color: $navy; background: $yellow; font-weight: 800; }
.submit-button[disabled] { opacity: .45; }
.invoice-dialog { box-sizing: border-box; display: flex; flex-direction: column; width: calc(100% - 64rpx); max-width: 680rpx; max-height: calc(100vh - 120rpx); margin-top: 120rpx; overflow: hidden; padding: 0; }
.invoice-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding-bottom: 8rpx; }
.invoice-detail-modal { box-sizing: border-box; display: flex; flex-direction: column; width: calc(100% - 64rpx); max-width: 680rpx; max-height: calc(100vh - 120rpx); margin-top: 120rpx; overflow: hidden; border-radius: 28rpx; background: #fff; }
.invoice-detail-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 0 30rpx 12rpx; }
.invoice-detail-section { margin-top: 22rpx; padding: 4rpx 22rpx; border: 1rpx solid #e4eaf2; border-radius: 18rpx; background: #fbfcfe; }
.invoice-detail-row { display: flex; align-items: flex-start; gap: 18rpx; padding: 18rpx 0; border-bottom: 1rpx solid #edf0f4; }
.invoice-detail-row:last-child { border-bottom: 0; }
.invoice-detail-label { flex: 0 0 150rpx; color: $muted; font-size: 21rpx; }
.invoice-detail-value { flex: 1; color: $navy; font-size: 22rpx; line-height: 1.45; word-break: break-all; }
.invoice-detail-value.rejected { color: $danger; }
.invoice-detail-actions { border-radius: 0 0 28rpx 28rpx; }
.invoice-detail-button { min-height: 48rpx; margin: 0; padding: 0 14rpx; border: 1rpx solid #b9d7ff; border-radius: $radius-pill; color: $blue; background: #f4f9ff; font-size: 20rpx; line-height: 46rpx; }
.dialog-hint { display: block; margin: 16rpx 30rpx 0; color: $muted; font-size: 21rpx; }
.invoice-field { box-sizing: border-box; display: block; width: calc(100% - 60rpx); height: 74rpx; margin: 18rpx 30rpx 0; padding: 0 20rpx; border: 1rpx solid #dce4ee; border-radius: 14rpx; color: $navy; background: #fbfcfe; font-size: 22rpx; }
.dialog-actions { display: flex; flex: 0 0 auto; gap: 14rpx; margin: 0; padding: 18rpx 30rpx calc(28rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid #edf0f4; background: #fff; }
.dialog-actions button { flex: 1; height: 68rpx; margin: 0; border-radius: $radius-pill; font-size: 22rpx; line-height: 68rpx; }
@media (min-width: 700px) { .payment-proof-modal { width: 680rpx; } }
</style>
