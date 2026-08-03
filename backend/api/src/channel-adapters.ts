import { createHash } from 'node:crypto'

export type WechatIdentity = { openId: string; unionId?: string; sessionKey?: string }
export type PaymentIntentResult = { ready: boolean; payload: Record<string, any> | null; message: string }

export async function resolveWechatIdentity(code: string, profile: Record<string, any> = {}): Promise<WechatIdentity> {
  const mode = process.env.WECHAT_ADAPTER || (process.env.NODE_ENV === 'production' ? 'real' : 'fake')
  if (mode === 'fake') {
    if (process.env.NODE_ENV === 'production') throw new Error('生产环境禁止使用 fake 微信适配器')
    const identity = String(profile.openId || profile.unionId || profile.deviceId || code || '').trim()
    if (!identity) throw new Error('微信登录凭证无效')
    return { openId: `mock:${createHash('sha256').update(identity).digest('hex').slice(0, 32)}` }
  }
  if (mode !== 'real') throw new Error(`未知微信适配器模式：${mode}`)
  const appId = String(process.env.WECHAT_APP_ID || '').trim()
  const appSecret = String(process.env.WECHAT_APP_SECRET || '').trim()
  if (!appId || !appSecret || !code) throw new Error('微信登录渠道未完成生产配置')
  const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`)
  if (!response.ok) throw new Error(`微信 code2Session 请求失败：${response.status}`)
  const payload = await response.json() as { openid?: string; unionid?: string; session_key?: string; errcode?: number; errmsg?: string }
  if (!payload.openid || payload.errcode) throw new Error(payload.errmsg || '微信登录凭证无效')
  return { openId: payload.openid, unionId: payload.unionid, sessionKey: payload.session_key }
}

export async function createPaymentIntent(channel: 'wechat' | 'alipay', amount: number, orderId: string): Promise<PaymentIntentResult> {
  const mode = process.env.PAYMENT_ADAPTER || (process.env.NODE_ENV === 'production' ? 'disabled' : 'fake')
  if (mode === 'fake') return { ready: false, payload: null, message: '开发环境未配置真实支付，已禁用原生支付并保留二维码回退' }
  if (mode === 'disabled') return { ready: false, payload: null, message: '支付渠道未启用，请联系管理员配置商户参数' }
  if (mode !== 'real') return { ready: false, payload: null, message: `未知支付适配器模式：${mode}` }
  const merchant = channel === 'wechat' ? process.env.WECHAT_PAY_MCH_ID : process.env.ALIPAY_APP_ID
  if (!merchant) return { ready: false, payload: null, message: `${channel === 'wechat' ? '微信支付' : '支付宝'}商户参数未配置` }
  // 真实 SDK/签名服务在部署侧注入；业务层只消费统一结果，禁止用占位 payload 冒充成功。
  return { ready: false, payload: null, message: `${channel === 'wechat' ? '微信支付' : '支付宝'} adapter 已启用但尚未注入签名服务（订单 ${orderId}，金额 ${amount}）` }
}
