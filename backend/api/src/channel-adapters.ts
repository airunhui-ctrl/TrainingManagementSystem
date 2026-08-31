import { createHash, createSign, createVerify, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createXypayJsapiPaymentIntent, isXypayEnabled } from './xypay-sign'

export type WechatIdentity = { openId: string; unionId?: string; sessionKey?: string }
export type PaymentIntentResult = { ready: boolean; payload: Record<string, any> | null; message: string; providerTradeNo?: string }
export type PaymentNotification = { outTradeNo: string; providerTradeNo?: string; amount: number; payload: Record<string, any> }

const secretValue = (value?: string) => {
  const source = String(value || '').trim()
  if (!source) return ''
  if (source.includes('-----BEGIN')) return source.replace(/\\n/g, '\n')
  if (existsSync(source)) return readFileSync(source, 'utf8')
  return source
}

const wechatPrivateKey = () => secretValue(process.env.WECHAT_PAY_PRIVATE_KEY || process.env.WECHAT_PAY_PRIVATE_KEY_FILE)
const wechatPlatformCertificate = () => secretValue(process.env.WECHAT_PAY_PLATFORM_CERTIFICATE || process.env.WECHAT_PAY_PLATFORM_CERTIFICATE_FILE)
const alipayPrivateKey = () => secretValue(process.env.ALIPAY_PRIVATE_KEY || process.env.ALIPAY_PRIVATE_KEY_FILE)
const alipayPublicKey = () => secretValue(process.env.ALIPAY_PUBLIC_KEY || process.env.ALIPAY_PUBLIC_KEY_FILE)

const secretConfigured = (value?: string, file?: string) => {
  const source = String(value || '').trim()
  const filePath = String(file || '').trim()
  if (source.includes('-----BEGIN')) return true
  if (source) return true
  return Boolean(filePath && existsSync(filePath))
}
const httpsUrlConfigured = (value?: string) => /^https:\/\//i.test(String(value || '').trim())

/**
 * 返回不包含密钥内容的渠道配置状态，供管理端部署验收使用。
 * 该结果只说明“是否配置/缺什么”，不会返回 AppSecret、私钥或 API Key。
 */
export function getIntegrationReadiness() {
  const nodeEnv = String(process.env.NODE_ENV || 'development').trim().toLowerCase()
  const paymentAdapter = String(process.env.PAYMENT_ADAPTER || (nodeEnv === 'production' ? 'disabled' : 'fake')).trim()
  const wechatAdapter = String(process.env.WECHAT_ADAPTER || (nodeEnv === 'production' ? 'real' : 'fake')).trim()
  const wechatProduct = String(process.env.WECHAT_PAY_PRODUCT || 'h5').trim().toLowerCase()
  const postarEnabled = String(process.env.PAYMENT_CHANNEL_POSTAR || '').trim() === '1'
  const wechatMissing: string[] = []
  if (!String(process.env.WECHAT_PAY_MCH_ID || '').trim()) wechatMissing.push('WECHAT_PAY_MCH_ID')
  if (!String(process.env.WECHAT_PAY_APP_ID || process.env.WECHAT_APP_ID || '').trim()) wechatMissing.push('WECHAT_PAY_APP_ID')
  if (!String(process.env.WECHAT_PAY_SERIAL_NO || '').trim()) wechatMissing.push('WECHAT_PAY_SERIAL_NO')
  if (!secretConfigured(process.env.WECHAT_PAY_PRIVATE_KEY, process.env.WECHAT_PAY_PRIVATE_KEY_FILE)) wechatMissing.push('WECHAT_PAY_PRIVATE_KEY[_FILE]')
  if (!String(process.env.WECHAT_PAY_API_V3_KEY || '').trim()) wechatMissing.push('WECHAT_PAY_API_V3_KEY')
  if (!secretConfigured(process.env.WECHAT_PAY_PLATFORM_CERTIFICATE, process.env.WECHAT_PAY_PLATFORM_CERTIFICATE_FILE)) wechatMissing.push('WECHAT_PAY_PLATFORM_CERTIFICATE[_FILE]')
  if (!String(process.env.WECHAT_PAY_NOTIFY_URL || '').trim()) wechatMissing.push('WECHAT_PAY_NOTIFY_URL')
  const alipayMissing: string[] = []
  if (!String(process.env.ALIPAY_APP_ID || '').trim()) alipayMissing.push('ALIPAY_APP_ID')
  if (!secretConfigured(process.env.ALIPAY_PRIVATE_KEY, process.env.ALIPAY_PRIVATE_KEY_FILE)) alipayMissing.push('ALIPAY_PRIVATE_KEY[_FILE]')
  if (!secretConfigured(process.env.ALIPAY_PUBLIC_KEY, process.env.ALIPAY_PUBLIC_KEY_FILE)) alipayMissing.push('ALIPAY_PUBLIC_KEY[_FILE]')
  if (!String(process.env.ALIPAY_NOTIFY_URL || '').trim()) alipayMissing.push('ALIPAY_NOTIFY_URL')
  if (!String(process.env.ALIPAY_RETURN_URL || '').trim()) alipayMissing.push('ALIPAY_RETURN_URL')
  const productionHttpsRequired = nodeEnv === 'production'
  const wechatNotifyHttps = httpsUrlConfigured(process.env.WECHAT_PAY_NOTIFY_URL)
  const alipayNotifyHttps = httpsUrlConfigured(process.env.ALIPAY_NOTIFY_URL)
  const alipayReturnHttps = httpsUrlConfigured(process.env.ALIPAY_RETURN_URL)
  if (productionHttpsRequired && !wechatNotifyHttps) wechatMissing.push('WECHAT_PAY_NOTIFY_URL(HTTPS)')
  if (productionHttpsRequired && !alipayNotifyHttps) alipayMissing.push('ALIPAY_NOTIFY_URL(HTTPS)')
  if (productionHttpsRequired && !alipayReturnHttps) alipayMissing.push('ALIPAY_RETURN_URL(HTTPS)')
  const postarMissing: string[] = []
  if (postarEnabled) {
    if (!String(process.env.XYPAY_BASE_URL || '').trim()) postarMissing.push('XYPAY_BASE_URL')
    if (!String(process.env.XYPAY_AGET_ID || '').trim()) postarMissing.push('XYPAY_AGET_ID')
    if (!String(process.env.XYPAY_CUST_ID || '').trim()) postarMissing.push('XYPAY_CUST_ID')
    if (!secretConfigured(process.env.XYPAY_PUBLIC_KEY, process.env.XYPAY_PUBLIC_KEY_FILE)) postarMissing.push('XYPAY_PUBLIC_KEY[_FILE]')
    if (!String(process.env.XYPAY_NOTIFY_URL || '').trim()) postarMissing.push('XYPAY_NOTIFY_URL')
    if (!String(process.env.WECHAT_APP_ID || '').trim()) postarMissing.push('WECHAT_APP_ID')
    if (productionHttpsRequired && !httpsUrlConfigured(process.env.XYPAY_NOTIFY_URL)) postarMissing.push('XYPAY_NOTIFY_URL(HTTPS)')
  }
  const postarConfigured = !postarEnabled || (paymentAdapter === 'real' && postarMissing.length === 0)
  const paymentConfigured = paymentAdapter === 'real'
    ? (postarEnabled ? postarMissing.length === 0 : wechatMissing.length === 0)
    : paymentAdapter === 'fake' && nodeEnv !== 'production'
  const alipayConfigured = paymentAdapter === 'real' ? alipayMissing.length === 0 : paymentAdapter === 'fake' && nodeEnv !== 'production'
  return {
    nodeEnv,
    paymentAdapter,
    wechatLogin: { adapter: wechatAdapter, configured: wechatAdapter === 'fake' ? nodeEnv !== 'production' : Boolean(String(process.env.WECHAT_APP_ID || '').trim() && String(process.env.WECHAT_APP_SECRET || '').trim()), productionSafe: wechatAdapter === 'real' && Boolean(String(process.env.WECHAT_APP_ID || '').trim() && String(process.env.WECHAT_APP_SECRET || '').trim()), missing: wechatAdapter === 'real' ? [!String(process.env.WECHAT_APP_ID || '').trim() ? 'WECHAT_APP_ID' : '', !String(process.env.WECHAT_APP_SECRET || '').trim() ? 'WECHAT_APP_SECRET' : ''].filter(Boolean) : [] },
    wechatPayment: { adapter: paymentAdapter, product: postarEnabled ? 'postar-jsapi' : wechatProduct, configured: paymentConfigured, productionSafe: paymentAdapter === 'real' && (postarEnabled ? postarMissing.length === 0 : wechatMissing.length === 0), callbackHttps: postarEnabled ? httpsUrlConfigured(process.env.XYPAY_NOTIFY_URL) : wechatNotifyHttps, missing: paymentAdapter === 'real' && !postarEnabled ? wechatMissing : [] },
    postarPayment: { enabled: postarEnabled, adapter: paymentAdapter, configured: postarConfigured, productionSafe: postarEnabled && paymentAdapter === 'real' && postarMissing.length === 0, callbackHttps: httpsUrlConfigured(process.env.XYPAY_NOTIFY_URL), missing: postarEnabled && paymentAdapter === 'real' ? postarMissing : [] },
    alipayPayment: { adapter: paymentAdapter, configured: alipayConfigured, productionSafe: paymentAdapter === 'real' && alipayMissing.length === 0, callbackHttps: alipayNotifyHttps, returnUrlHttps: alipayReturnHttps, missing: paymentAdapter === 'real' ? alipayMissing : [] },
  }
}

const wechatAuthorization = (method: string, uri: string, body: string) => {
  const mchid = String(process.env.WECHAT_PAY_MCH_ID || '').trim()
  const serial = String(process.env.WECHAT_PAY_SERIAL_NO || '').trim()
  const key = wechatPrivateKey()
  if (!mchid || !serial || !key) throw new Error('微信支付商户号、证书序列号或商户私钥未配置')
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = randomBytes(16).toString('hex')
  const message = `${method}\n${uri}\n${timestamp}\n${nonce}\n${body}\n`
  const signer = createSign('RSA-SHA256'); signer.update(message); signer.end()
  const signature = signer.sign(key, 'base64')
  return { header: `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${serial}",signature="${signature}"`, timestamp, nonce }
}

const wechatRequest = async (method: string, uri: string, body: Record<string, any>) => {
  const text = JSON.stringify(body)
  const auth = wechatAuthorization(method, uri, text)
  const response = await fetch(`https://api.mch.weixin.qq.com${uri}`, { method, headers: { Authorization: auth.header, 'Content-Type': 'application/json', Accept: 'application/json' }, body: text })
  const payload = await response.json().catch(() => ({})) as Record<string, any>
  if (!response.ok) throw new Error(`微信支付下单失败：${response.status} ${payload.message || payload.code || ''}`.trim())
  return payload
}

export function createWechatJsapiPaymentParams(appId: string, prepayId: string, now = Date.now()) {
  const timeStamp = Math.floor(now / 1000).toString()
  const nonceStr = randomBytes(16).toString('hex')
  const packageValue = `prepay_id=${prepayId}`
  const message = `${appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`
  const signer = createSign('RSA-SHA256'); signer.update(message); signer.end()
  const signature = signer.sign(wechatPrivateKey(), 'base64')
  return { appId, timeStamp, nonceStr, package: packageValue, signType: 'RSA', paySign: signature }
}

const alipayGateway = () => String(process.env.ALIPAY_GATEWAY_URL || 'https://openapi.alipay.com/gateway.do').trim()
const alipaySignedUrl = (method: string, params: Record<string, string>) => {
  const appId = String(process.env.ALIPAY_APP_ID || '').trim()
  const key = alipayPrivateKey()
  if (!appId || !key) throw new Error('支付宝 app_id 或应用私钥未配置')
  const common: Record<string, string> = { app_id: appId, method, format: 'JSON', charset: 'utf-8', sign_type: 'RSA2', timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '), version: '1.0', ...params }
  const signText = Object.keys(common).sort().map((name) => `${name}=${common[name]}`).join('&')
  const signer = createSign('RSA-SHA256'); signer.update(signText); signer.end()
  const sign = signer.sign(key, 'base64')
  const query = Object.entries({ ...common, sign }).map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join('&')
  return `${alipayGateway()}?${query}`
}

export async function resolveWechatIdentity(code: string, profile: Record<string, any> = {}, scene = process.env.WECHAT_LOGIN_SCENE || 'mini_program'): Promise<WechatIdentity> {
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
  const endpoint = scene === 'mini_program'
    ? `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`
    : `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`
  const response = await fetch(endpoint)
  if (!response.ok) throw new Error(`微信 code2Session 请求失败：${response.status}`)
  const payload = await response.json() as { openid?: string; unionid?: string; session_key?: string; errcode?: number; errmsg?: string }
  if (!payload.openid || payload.errcode) throw new Error(payload.errmsg || '微信登录凭证无效')
  return { openId: payload.openid, unionId: payload.unionid, sessionKey: payload.session_key }
}

export async function createPaymentIntent(channel: 'wechat' | 'alipay', amount: number, orderId: string, context: { clientIp?: string; openId?: string } = {}): Promise<PaymentIntentResult> {
  const mode = process.env.PAYMENT_ADAPTER || (process.env.NODE_ENV === 'production' ? 'disabled' : 'fake')
  if (mode === 'fake') return { ready: false, payload: null, message: '开发环境未配置真实支付，已禁用原生支付并保留二维码回退' }
  if (mode === 'disabled') return { ready: false, payload: null, message: '支付渠道未启用，请联系管理员配置商户参数' }
  if (mode !== 'real') return { ready: false, payload: null, message: `未知支付适配器模式：${mode}` }
  if (channel === 'wechat' && isXypayEnabled()) return createXypayJsapiPaymentIntent(amount, orderId, context)
  const merchant = channel === 'wechat' ? process.env.WECHAT_PAY_MCH_ID : process.env.ALIPAY_APP_ID
  if (!merchant) return { ready: false, payload: null, message: `${channel === 'wechat' ? '微信支付' : '支付宝'}商户参数未配置` }
  if (channel === 'wechat') {
    const appId = String(process.env.WECHAT_PAY_APP_ID || process.env.WECHAT_APP_ID || '').trim()
    const notifyUrl = String(process.env.WECHAT_PAY_NOTIFY_URL || '').trim()
    const product = String(process.env.WECHAT_PAY_PRODUCT || 'h5').trim().toLowerCase()
    if (!appId || !notifyUrl) return { ready: false, payload: null, message: '微信支付 app_id 或异步通知地址未配置' }
    const endpoint = product === 'native' ? '/v3/pay/transactions/native' : product === 'jsapi' ? '/v3/pay/transactions/jsapi' : '/v3/pay/transactions/h5'
    const request: Record<string, any> = { appid: appId, mchid: merchant, description: `培训课程订单 ${orderId}`, out_trade_no: orderId, notify_url: notifyUrl, amount: { total: Math.round(amount * 100), currency: 'CNY' } }
    if (product === 'jsapi') {
      if (!context.openId) return { ready: false, payload: null, message: '微信 JSAPI 支付需要绑定小程序 openid' }
      request.payer = { openid: context.openId }
    } else if (product !== 'native') {
      request.scene_info = { payer_client_ip: String(context.clientIp || process.env.WECHAT_PAY_CLIENT_IP || '127.0.0.1'), h5_info: { type: String(process.env.WECHAT_PAY_H5_TYPE || 'Wap') } }
    }
    const response = await wechatRequest('POST', endpoint, request)
    if (product === 'native' && response.code_url) return { ready: true, payload: { codeUrl: response.code_url }, message: '微信支付订单已创建，请扫码支付' }
    if (product === 'jsapi' && response.prepay_id) return { ready: true, payload: createWechatJsapiPaymentParams(appId, String(response.prepay_id)), message: '微信 JSAPI 支付订单已创建' }
    if (response.h5_url) return { ready: true, payload: { redirectUrl: response.h5_url }, message: '微信支付订单已创建，正在跳转支付' }
    return { ready: false, payload: null, message: '微信支付未返回可用支付参数' }
  }
  const notifyUrl = String(process.env.ALIPAY_NOTIFY_URL || '').trim()
  if (!notifyUrl) return { ready: false, payload: null, message: '支付宝异步通知地址未配置' }
  const returnUrl = String(process.env.ALIPAY_RETURN_URL || '').trim()
  if (!returnUrl) return { ready: false, payload: null, message: '支付宝同步返回地址未配置' }
  const paymentUrl = alipaySignedUrl('alipay.trade.wap.pay', { notify_url: notifyUrl, return_url: returnUrl, product_code: 'QUICK_WAP_WAY', biz_content: JSON.stringify({ out_trade_no: orderId, total_amount: Number(amount).toFixed(2), subject: `培训课程订单 ${orderId}`, product_code: 'QUICK_WAP_WAY' }) })
  return { ready: true, payload: { redirectUrl: paymentUrl }, message: '支付宝支付订单已创建，正在跳转支付' }
}

export function verifyWechatNotification(headers: Record<string, any>, rawBody: string | Buffer): PaymentNotification {
  const timestamp = String(headers['wechatpay-timestamp'] || headers['Wechatpay-Timestamp'] || '')
  const nonce = String(headers['wechatpay-nonce'] || headers['Wechatpay-Nonce'] || '')
  const signature = String(headers['wechatpay-signature'] || headers['Wechatpay-Signature'] || '')
  const certificate = wechatPlatformCertificate()
  if (!timestamp || !nonce || !signature || !certificate) throw new Error('微信支付回调验签参数或平台证书未配置')
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '')
  const verifier = createVerify('RSA-SHA256'); verifier.update(`${timestamp}\n${nonce}\n${body}\n`); verifier.end()
  if (!verifier.verify(certificate, signature, 'base64')) throw new Error('微信支付回调验签失败')
  const envelope = JSON.parse(body) as { resource?: { algorithm?: string; ciphertext?: string; nonce?: string; associated_data?: string } }
  const resource = envelope.resource
  const apiKey = String(process.env.WECHAT_PAY_API_V3_KEY || '')
  if (!resource?.ciphertext || !resource.nonce || !apiKey || resource.algorithm !== 'AEAD_AES_256_GCM') throw new Error('微信支付回调密文配置不完整')
  const encrypted = Buffer.from(resource.ciphertext, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(apiKey), Buffer.from(resource.nonce))
  decipher.setAAD(Buffer.from(resource.associated_data || ''))
  decipher.setAuthTag(encrypted.subarray(encrypted.length - 16))
  const decrypted = Buffer.concat([decipher.update(encrypted.subarray(0, encrypted.length - 16)), decipher.final()])
  const transaction = JSON.parse(decrypted.toString('utf8')) as { out_trade_no?: string; transaction_id?: string; trade_state?: string; amount?: { total?: number; currency?: string } }
  if (transaction.trade_state !== 'SUCCESS' || !transaction.out_trade_no || !transaction.amount?.total) throw new Error('微信支付交易尚未成功或回调数据不完整')
  return { outTradeNo: transaction.out_trade_no, providerTradeNo: transaction.transaction_id, amount: transaction.amount.total / 100, payload: transaction as any }
}

export function verifyAlipayNotification(body: Record<string, any>): PaymentNotification {
  const signature = String(body.sign || '')
  const publicKey = alipayPublicKey()
  if (!signature || !publicKey) throw new Error('支付宝回调签名或支付宝公钥未配置')
  const signText = Object.keys(body).filter((key) => !['sign', 'sign_type'].includes(key) && body[key] !== undefined && body[key] !== '').sort().map((key) => `${key}=${body[key]}`).join('&')
  const verifier = createVerify('RSA-SHA256'); verifier.update(signText); verifier.end()
  if (!verifier.verify(publicKey, signature, 'base64')) throw new Error('支付宝回调验签失败')
  if (String(body.trade_status) !== 'TRADE_SUCCESS' && String(body.trade_status) !== 'TRADE_FINISHED') throw new Error('支付宝交易尚未成功')
  const amount = Number(body.total_amount)
  if (!body.out_trade_no || !Number.isFinite(amount)) throw new Error('支付宝回调数据不完整')
  return { outTradeNo: String(body.out_trade_no), providerTradeNo: String(body.trade_no || ''), amount, payload: body }
}