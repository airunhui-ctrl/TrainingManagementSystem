import { api } from './api'

const BUSINESS_TARGET_TAB_KEY = 'client-business-target-tab'

const openBusinessInvoices = () => {
  uni.setStorageSync(BUSINESS_TARGET_TAB_KEY, 'invoices')
  uni.switchTab({ url: '/pages/business/business' })
}

const openClientHome = () => uni.switchTab({ url: '/pages/index/index' })

export type InvoiceNoticeItem = { id: string; status: string; rejectReason?: string | null; retryOfInvoiceId?: string | null }

export const actionableRejectedInvoices = <T extends InvoiceNoticeItem>(items: T[]) => {
  const supersededIds = new Set(items.map((invoice) => invoice.retryOfInvoiceId).filter(Boolean) as string[])
  return items.filter((invoice) => invoice.status === '已驳回' && !supersededIds.has(invoice.id))
}

export const redirectAfterLogin = async () => {
  try {
    const result = await api.listInvoices()
    const rejected = actionableRejectedInvoices(result.items || [])
    if (!rejected.length) return openClientHome()
    const firstReason = rejected.find((invoice) => invoice.rejectReason)?.rejectReason
    const suffix = rejected.length > 1 ? `，共 ${rejected.length} 条` : ''
    uni.showModal({
      title: '有开票申请被驳回',
      content: `${firstReason ? `驳回原因：${firstReason}\n\n` : ''}请前往“订单 → 开票记录”修改信息后重新申请${suffix}。`,
      cancelText: '稍后处理',
      confirmText: '去开票记录',
      success: ({ confirm }) => confirm ? openBusinessInvoices() : openClientHome(),
      fail: openClientHome,
    })
  } catch {
    openClientHome()
  }
}

export const consumeBusinessTargetTab = () => {
  const target = uni.getStorageSync(BUSINESS_TARGET_TAB_KEY)
  if (target !== 'invoices') return false
  uni.removeStorageSync(BUSINESS_TARGET_TAB_KEY)
  return true
}
