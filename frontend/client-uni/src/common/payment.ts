import type { PaymentIntent } from './api'

export type NativePaymentResult = 'success' | 'redirected' | 'unavailable'

/**
 * 小程序原生支付适配层：后端返回 ready=true 和对应 payload 后，
 * 这里会调用 UniApp 的原生支付能力；未配置商户参数时返回 unavailable，
 * 由页面继续展示模拟二维码或其他回退方式。
 */
export function requestNativePayment(intent: PaymentIntent): Promise<NativePaymentResult> {
  const redirectUrl = String(intent.payload?.redirectUrl || '').trim()
  // 微信 H5 支付返回 h5_url，必须由浏览器跳转到微信收银台；
  // 不能交给 uni.requestPayment（该 API 只适用于小程序/原生端支付）。
  if (redirectUrl && typeof window !== 'undefined' && typeof window.location?.assign === 'function') {
    window.location.assign(redirectUrl)
    return Promise.resolve('redirected')
  }
  // JSAPI 也可能运行在微信内置浏览器中。此时使用微信桥接对象，
  // 而不是普通浏览器的 window.location 或小程序 requestPayment。
  const jsapiPayload = intent.payload || {}
  const bridge = typeof window !== 'undefined' ? (window as any).WeixinJSBridge : null
  if (bridge && jsapiPayload.appId && jsapiPayload.timeStamp && jsapiPayload.nonceStr && jsapiPayload.package && jsapiPayload.paySign) {
    return new Promise((resolve, reject) => {
      bridge.invoke('getBrandWCPayRequest', {
        appId: String(jsapiPayload.appId),
        timeStamp: String(jsapiPayload.timeStamp),
        nonceStr: String(jsapiPayload.nonceStr),
        package: String(jsapiPayload.package),
        signType: String(jsapiPayload.signType || 'RSA'),
        paySign: String(jsapiPayload.paySign),
      }, (result: any) => {
        if (String(result?.err_msg || '').toLowerCase().includes(':ok')) resolve('success')
        else reject(new Error(result?.err_msg || '微信支付已取消'))
      })
    })
  }
  const requestPayment = (uni as any).requestPayment
  if (!intent.ready || typeof requestPayment !== 'function' || !intent.payload) return Promise.resolve('unavailable')
  return new Promise((resolve, reject) => {
    requestPayment({ provider: intent.provider, ...intent.payload, success: () => resolve('success'), fail: (error: any) => reject(new Error(error?.errMsg || '支付已取消')) })
  })
}
