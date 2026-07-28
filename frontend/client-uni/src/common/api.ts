import { tokenStorage } from './auth'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3100/api'
let refreshing: Promise<string> | null = null

export interface ApiCourse { id: string; title: string; subtitle: string; category: string; date: string; location: string; instructor: string; price: number; capacity: number; enrolled: number; seatsLeft: number; status: string; description: string; descriptionRichText?: string }
export interface ApiBanner { id: string; title: string; courseId: string; sort: number; enabled: boolean; startsAt: string; endsAt: string }
export interface ApiOrderQuote { courseId: string; participantCount: number; unitPrice: number; originalAmount: number; discount: number; amount: number; discountRate: number }

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
        if (response.statusCode === 401) { tokenStorage.clear(); uni.reLaunch({ url: '/pages/login/login' }); reject(new Error('登录已过期')); return }
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

export const api = {
  login: (username: string, password: string) => request<{ accessToken: string; refreshToken: string; user: { username: string } }>({ url: '/auth/login', method: 'POST', data: { username, password } }),
  listCourses: (params?: { keyword?: string; category?: string }) => request<{ items: ApiCourse[] }>({ url: '/courses', data: params }),
  listBanners: () => request<{ items: ApiBanner[] }>({ url: '/banners' }),
  getCourse: (id: string) => request<ApiCourse>({ url: `/courses/${id}` }),
  getRegistrationTemplate: (id: string) => request<{ courseId: string; version: number; fields: Array<{ key: string; label: string; type: string; required: boolean; options?: string[] }> }>({ url: `/courses/${id}/registration-template` }),
  quoteOrder: (courseId: string, participantCount: number) => request<ApiOrderQuote>({ url: '/orders/quote', method: 'POST', data: { courseId, participantCount } }),
  createOrder: (courseId: string, participants: Array<Record<string, string>>, paymentMethod: 'online' | 'offline' = 'online') => request<{ id: string }>({ url: '/orders', method: 'POST', data: { courseId, participants: participants.map((data) => ({ data })), paymentMethod } }),
  listOrders: () => request<{ items: Array<{ id: string; courseId: string; participantCount: number; amount: number; status: string; paymentMethod?: string; createdAt: string }> }>({ url: '/orders' }),
  listPreviews: () => request<{ items: Array<{ id: string; courseId: string; courseTitle: string; viewedAt: string }> }>({ url: '/previews' }),
  payOrder: (id: string, method: 'online' | 'offline', proof?: string, channel?: 'wechat' | 'alipay') => request<{ status: string }>({ url: `/orders/${id}/pay`, method: 'POST', data: { method, proof, channel } }),
  uploadPaymentProof,
  cancelOrder: (id: string) => request<{ status: string }>({ url: `/orders/${id}/cancel`, method: 'POST' }),
  profile: () => request<{ name: string; company: string; points: number; registeredAt: string }>({ url: '/profile' }),
  updateProfile: (data: Record<string, string>) => request<{ name: string }>({ url: '/profile', method: 'PATCH', data }),
  changePassword: () => request<{ success: boolean }>({ url: '/profile/password', method: 'POST' }),
  submitFeedback: (content: string) => request<{ id: string }>({ url: '/feedback', method: 'POST', data: { content, category: '建议反馈' } }),
  listInvoices: () => request<{ items: Array<{ id: string; status: string; title: string; taxNo?: string; email?: string; invoiceNo?: string; orderIds?: string[]; createdAt: string }> }>({ url: '/invoices' }),
  createInvoice: (title: string, taxNo: string, email: string, orderIds: string[] = []) => request<{ id: string }>({ url: '/invoices', method: 'POST', data: { title, taxNo, email, orderIds } }),
  paymentInfo: () => request<{ accountName: string; bankName: string; accountNo: string; qrCodeText: string; onlineWechatEnabled: boolean; onlineAlipayEnabled: boolean }>({ url: '/payment-settings/public' }),
  recordPreview: (courseId: string) => request<{ id: string }>({ url: `/courses/${courseId}/preview`, method: 'POST' }),
}
