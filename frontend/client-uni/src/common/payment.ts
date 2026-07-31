import type { PaymentIntent } from './api'

export type NativePaymentResult = 'success' | 'unavailable'

/**
 * 小程序原生支付适配层：后端返回 ready=true 和对应 payload 后，
 * 这里会调用 UniApp 的原生支付能力；未配置商户参数时返回 unavailable，
 * 由页面继续展示模拟二维码或其他回退方式。
 */
export function requestNativePayment(intent: PaymentIntent): Promise<NativePaymentResult> {
  const requestPayment = (uni as any).requestPayment
  if (!intent.ready || typeof requestPayment !== 'function' || !intent.payload) return Promise.resolve('unavailable')
  return new Promise((resolve, reject) => {
    requestPayment({ provider: intent.provider, ...intent.payload, success: () => resolve('success'), fail: (error: any) => reject(new Error(error?.errMsg || '支付已取消')) })
  })
}
