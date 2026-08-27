import { tokenStorage } from './auth'

// H5 通过 Vite 代理访问 API，避免浏览器把 localhost 解析到错误的网络栈或触发跨域限制；
// 小程序等非 H5 平台继续使用可配置的后端绝对地址。
const BASE_URL = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? '/api' : 'http://localhost:3100/api')
export const apiAssetUrl = (value?: string | null) => {
  const source = String(value || '').trim()
  if (!source) return ''
  if (/^(data:|https?:\/\/)/i.test(source)) return source
  const path = source.startsWith('/api') ? source.slice(4) : source.startsWith('/') ? source : `/${source}`
  return `${BASE_URL.replace(/\/$/, '')}${path}`
}
let refreshing: Promise<string> | null = null

export interface ApiCourse { id: string; title: string; subtitle: string; category: string; date: string; location: string; instructor: string; image?: string | null; price: number; capacity: number; enrolled: number; seatsLeft: number; status: string; description: string; descriptionRichText?: string; registrationStartAt?: string | null; registrationEndAt?: string | null; maxParticipantsPerOrder?: number | null; specialPriceEndsAt?: string | null; specialPriceActive?: boolean }
export interface ApiBanner { id: string; title: string; courseId: string; sort: number; enabled: boolean; startsAt: string; endsAt: string }
export interface ApiOrderQuote { courseId: string; participantCount: number; unitPrice: number; originalAmount: number; discount: number; amount: number; discountRate: number }
export interface PaymentIntent { orderId: string; channel: 'wechat' | 'alipay'; provider: 'wxpay' | 'alipay'; amount: number; currency: string; ready: boolean; payload: Record<string, any> | null; message?: string }

function refreshAccessToken(): Promise<string> {
  const refreshToken = tokenStorage.getRefreshToken()
  if (!refreshToken) return Promise.reject(new Error('登录已过期'))
  if (!refreshing) refreshing = new Promise((resolve, reject) => {
    uni.request({
      url: `${BASE_URL}/auth/refresh`, method: 'POST', data: { refreshToken },
      success: (response) => {
        if (response.statusCode >= 400) { reject(new Error('登录已过期')); return }
        const result = response.data as { accessToken: string; refreshToken: string }
        tokenStorage.setTokens(result.accessToken, result.refreshToken)
        resolve(result.accessToken)
      },
      fail: reject,
    })
  }).finally(() => { refreshing = null })
  return refreshing
}

function performRequest<T>(options: UniApp.RequestOptions, retried: boolean): Promise<T> {
  const accessToken = tokenStorage.getAccessToken()
  return new Promise((resolve, reject) => {
    uni.request({
      ...options,
      url: `${BASE_URL}${options.url}`,
      header: { ...(options.header || {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      success: async (response) => {
        if (response.statusCode === 401 && !retried && tokenStorage.getRefreshToken()) {
          try { await refreshAccessToken(); resolve(await performRequest<T>(options, true)); return } catch { /* clear below */ }
        }
        if (response.statusCode === 401) {
          if (accessToken) { tokenStorage.clear(); uni.switchTab({ url: '/pages/index/index' }); reject(new Error('登录已过期')); return }
          // 未携带会话的匿名请求（如登录失败）只返回错误，不跳转首页
        }
        if (response.statusCode >= 400) {
          const payload = response.data as { message?: string | string[]; error?: string } | undefined
          const message = Array.isArray(payload?.message) ? payload.message.join('；') : payload?.message || payload?.error
          reject(new Error(message || `请求失败：${response.statusCode}`))
          return
        }
        resolve(response.data as T)
      },
      fail: reject,
    })
  })
}

export function request<T>(options: UniApp.RequestOptions): Promise<T> { return performRequest<T>(options, false) }

export function uploadPaymentProof(orderId: string, filePath: string): Promise<{ order: { status: string }; file: { path: string; status: string } }> {
  return performUpload(orderId, filePath, false)
}

export function downloadInvoiceFile(invoiceId: string): Promise<string> {
  const accessToken = tokenStorage.getAccessToken()
  return new Promise((resolve, reject) => {
    uni.downloadFile({
      url: `${BASE_URL}/invoices/${encodeURIComponent(invoiceId)}/file`,
      header: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      success: (response) => {
        if (response.statusCode >= 400) { reject(new Error(`发票文件下载失败：${response.statusCode}`)); return }
        resolve(response.tempFilePath)
      },
      fail: reject,
    })
  })
}

function performUpload(orderId: string, filePath: string, retried: boolean): Promise<{ order: { status: string }; file: { path: string; status: string } }> {
  const accessToken = tokenStorage.getAccessToken()
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: `${BASE_URL}/orders/${orderId}/payment-proof`,
      filePath,
      name: 'file',
      header: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      success: async (response) => {
        if (response.statusCode === 401 && !retried && tokenStorage.getRefreshToken()) {
          try { await refreshAccessToken(); resolve(await performUpload(orderId, filePath, true)); return } catch { tokenStorage.clear() }
        }
        if (response.statusCode >= 400) { reject(new Error(`上传失败：${response.statusCode}`)); return }
        try { resolve(JSON.parse(response.data as string) as { order: { status: string }; file: { path: string; status: string } }) } catch { reject(new Error('上传响应格式错误')) }
      },
      fail: reject,
    })
  })
}

export function uploadFeedbackAttachment(filePath: string): Promise<{ storedName: string; originalName: string; mimeType: string; size: number; url: string }> {
  const accessToken = tokenStorage.getAccessToken()
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: `${BASE_URL}/feedback/attachment`,
      filePath,
      name: 'file',
      header: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      success: async (response) => {
        if (response.statusCode === 401 && tokenStorage.getRefreshToken()) {
          try { await refreshAccessToken(); resolve(await uploadFeedbackAttachment(filePath)); return } catch { tokenStorage.clear() }
        }
        if (response.statusCode >= 400) { reject(new Error(`附件上传失败：${response.statusCode}`)); return }
        try { resolve(JSON.parse(response.data as string)) } catch { reject(new Error('附件上传响应格式错误')) }
      },
      fail: reject,
    })
  })
}

export const api = {
  login: (username: string, password: string) => request<{ accessToken: string; refreshToken: string; user: { username: string } }>({ url: '/auth/login', method: 'POST', data: { username, password } }),
  requestPhoneRegistrationCode: (phone: string) => request<{ accepted: boolean; challengeId?: string; phoneRegistered?: boolean; message: string; devCode?: string }>({ url: '/auth/register/sms/request', method: 'POST', data: { phone } }),
  registerByPhoneSms: (data: { challengeId: string; phone: string; code: string; password: string; confirmPassword: string; username: string; agreementVersion: string }) => request<{ accessToken: string; refreshToken: string; user: { username: string; role: string } }>({ url: '/auth/register/sms/confirm', method: 'POST', data }),
  requestPasswordReset: (phone: string) => request<{ accepted: boolean; challengeId: string; message: string; devCode?: string }>({ url: '/auth/password-reset/request', method: 'POST', data: { phone } }),
  confirmPasswordReset: (data: { challengeId: string; code: string; newPassword: string; confirmPassword: string }) => request<{ success: boolean; message: string }>({ url: '/auth/password-reset/confirm', method: 'POST', data }),
  wechatLogin: (code: string, profile: Record<string, any>, scene?: 'mini_program' | 'h5' | 'official_account') => request<{ accessToken: string; refreshToken: string; user: { username: string; role: string } }>({ url: '/auth/wechat-login', method: 'POST', data: { code, profile, ...(scene ? { scene } : {}) } }),
  listCourses: (params?: { keyword?: string; category?: string }) => request<{ items: ApiCourse[] }>({ url: '/courses', data: params }),
  listBanners: () => request<{ items: ApiBanner[] }>({ url: '/banners' }),
  getCourse: (id: string) => request<ApiCourse>({ url: `/courses/${id}` }),
  getRegistrationTemplate: (id: string) => request<{ courseId: string; version: number; fields: Array<{ key: string; label: string; type: string; required: boolean; options?: string[]; maxLength?: number; maxSelect?: number }> }>({ url: `/courses/${id}/registration-template` }),
  quoteOrder: (courseId: string, participantCount: number) => request<ApiOrderQuote>({ url: '/orders/quote', method: 'POST', data: { courseId, participantCount } }),
  createOrder: (courseId: string, participants: Array<Record<string, string> & { studentId?: string }>, paymentMethod: 'online' | 'offline' = 'online') => request<{ id: string; amount: number; originalAmount: number; discount: number; participantCount: number; status: string }>({ url: '/orders', method: 'POST', data: { courseId, participants: participants.map((item) => { const { studentId, ...data } = item; return { data, ...(studentId ? { studentId } : {}) } }), paymentMethod } }),
  listOrders: () => request<{ items: Array<{ id: string; courseId: string; participantCount: number; amount: number; status: string; paymentMethod?: string; paymentChannel?: string; paymentProof?: string; paymentProofStatus?: string; paymentProofRemark?: string; createdAt: string }> }>({ url: '/orders' }),
  getOrder: (id: string) => request<{ id: string; courseId: string; courseTitle?: string; participantCount: number; originalAmount: number; discount: number; amount: number; status: string; paymentMethod?: string; paymentChannel?: string; paymentProofStatus?: string; paymentProofRemark?: string; participants: Array<Record<string, string>>; createdAt: string; paymentTransactions: Array<{ id: string; channel: string; provider: string; outTradeNo: string; providerTradeNo?: string | null; amount: number; status: string; paidAt?: string | null; createdAt: string }> }>({ url: `/orders/${encodeURIComponent(id)}` }),
  listPreviews: () => request<{ items: Array<{ id: string; courseId: string; courseTitle: string; viewedAt: string }> }>({ url: '/previews' }),
  listStudents: () => request<{ items: Array<Record<string, any>> }>({ url: '/students' }),
  createStudent: (data: Record<string, any>) => request<Record<string, any>>({ url: '/students', method: 'POST', data }),
  updateStudent: (id: string, data: Record<string, any>) => request<Record<string, any>>({ url: `/students/${id}`, method: 'PATCH', data }),
  setDefaultStudent: (id: string) => request<{ items: Array<Record<string, any>> }>({ url: `/students/${id}/default`, method: 'POST' }),
  removeStudent: (id: string) => request<Record<string, any>>({ url: `/students/${id}`, method: 'DELETE' }),
  payOrder: (id: string, method: 'online' | 'offline', proof?: string, channel?: 'wechat' | 'alipay') => request<{ status: string }>({ url: `/orders/${id}/pay`, method: 'POST', data: { method, proof, channel } }),
  createPaymentIntent: (id: string, channel: 'wechat' | 'alipay') => request<PaymentIntent>({ url: `/orders/${id}/payment-intent`, method: 'POST', data: { channel } }),
  paymentStatus: (id: string) => request<{ orderId: string; orderStatus: string; paid: boolean; channel?: string | null; providerTradeNo?: string | null; transactionStatus?: string | null }>({ url: `/orders/${id}/payment-status` }),
  uploadPaymentProof,
  cancelOrder: (id: string) => request<{ status: string }>({ url: `/orders/${id}/cancel`, method: 'POST' }),
  profile: () => request<{ id: string; username: string; name: string; company: string; phone: string; gender: string; email: string; avatarText: string; points: number; registeredAt: string; lastLoginAt?: string | null }>({ url: '/profile' }),
  updateProfile: (data: Record<string, string>) => request<{ name: string }>({ url: '/profile', method: 'PATCH', data }),
  changePassword: (oldPassword: string, password: string) => request<{ success: boolean }>({ url: '/profile/password', method: 'POST', data: { oldPassword, password } }),
  acceptAgreement: () => request<{ agreementVersion: string; agreementAcceptedAt: string; agreementRequired: boolean }>({ url: '/profile/agreement', method: 'POST' }),
  submitFeedback: (content: string, category = '建议反馈', attachments: Array<{ storedName: string; originalName: string; mimeType: string; size: number; url: string }> = []) => request<{ id: string }>({ url: '/feedback', method: 'POST', data: { content, category, attachments } }),
  listMessages: () => request<{ items: Array<{ id: string; title: string; content: string; channel: string; createdAt: string; readAt?: string | null; startsAt?: string; endsAt?: string }>; unreadCount: number }>({ url: '/messages' }),
  markMessageRead: (id: string) => request<{ messageId: string; readAt: string }>({ url: `/messages/${id}/read`, method: 'POST' }),
  listInvoices: () => request<{ items: Array<{ id: string; status: string; title: string; taxNo?: string; email?: string; rejectReason?: string | null; retryOfInvoiceId?: string | null; invoiceNo?: string; orderIds?: string[]; invoiceFileStatus?: string; invoiceFileName?: string | null; invoiceFileUrl?: string | null; invoiceFileUploadedAt?: string | null; createdAt: string }> }>({ url: '/invoices' }),
  createInvoice: (title: string, taxNo: string, email: string, orderIds: string[] = []) => request<{ id: string }>({ url: '/invoices', method: 'POST', data: { title, taxNo, email, orderIds } }),
  reapplyInvoice: (invoiceId: string, title: string, taxNo: string, email: string) => request<{ id: string }>({ url: `/invoices/${encodeURIComponent(invoiceId)}/reapply`, method: 'POST', data: { title, taxNo, email, orderIds: [] } }),
  paymentInfo: () => request<{ accountName: string; bankName: string; accountNo: string; qrCodeText: string; wechatQrImage?: string; alipayQrImage?: string; onlineWechatEnabled: boolean; onlineAlipayEnabled: boolean }>({ url: '/payment-settings/public' }),
  recordPreview: (courseId: string) => request<{ id: string }>({ url: `/courses/${courseId}/preview`, method: 'POST' }),
}
