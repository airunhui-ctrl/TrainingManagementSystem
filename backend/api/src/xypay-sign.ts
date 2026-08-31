import { createHash, publicDecrypt, publicEncrypt, randomBytes, constants as cryptoConstants, createPublicKey, KeyObject } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import type { PaymentIntentResult, PaymentNotification } from './channel-adapters'

export type XypayOrderQueryResult = {
  status: 'paid' | 'pending' | 'failed' | 'not_found'
  amount: number
  providerTradeNo?: string
  payload: Record<string, any>
}

const xypayValue = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export const buildXypaySignString = (params: Record<string, any>): string => {
  return Object.keys(params)
    .filter((key) => params[key] !== null && params[key] !== undefined)
    .sort()
    .map((key) => `${key}=${xypayValue(params[key])}`)
    .join('&')
}

export const xypayPublicKey = (): KeyObject => {
  const source = String(process.env.XYPAY_PUBLIC_KEY || process.env.XYPAY_PUBLIC_KEY_FILE || '').trim()
  if (!source) throw new Error('星驿付平台公钥未配置')
  const content = source.includes('-----BEGIN')
    ? source.replace(/\\n/g, '\n')
    : existsSync(source) ? readFileSync(source, 'utf8') : source
  const compact = content.replace(/\s+/g, '')
  try {
    if (content.includes('-----BEGIN')) return createPublicKey(content)
    return createPublicKey({ key: Buffer.from(compact, 'base64'), format: 'der', type: 'spki' })
  } catch {
    throw new Error('星驿付平台公钥格式无效，请使用 PEM 或 Base64 SPKI 公钥')
  }
}

export const signXypayRequest = (params: Record<string, any>): string => {
  const digest = createHash('sha256').update(buildXypaySignString(params)).digest('hex')
  const encrypted = publicEncrypt(
    { key: xypayPublicKey(), padding: cryptoConstants.RSA_PKCS1_PADDING },
    Buffer.from(digest, 'utf8'),
  )
  return encrypted.toString('base64')
}

export const verifyXypaySign = (body: Record<string, any>): boolean => {
  const signature = String(body?.sign || '').trim()
  if (!signature) return false
  const params = { ...body }
  delete params.sign
  const digest = createHash('sha256').update(buildXypaySignString(params)).digest('hex')
  try {
    const decrypted = publicDecrypt(
      { key: xypayPublicKey(), padding: cryptoConstants.RSA_PKCS1_PADDING },
      Buffer.from(signature, 'base64'),
    )
    return decrypted.toString('utf8') === digest
  } catch {
    return false
  }
}

export const isXypayEnabled = (): boolean => {
  return String(process.env.PAYMENT_CHANNEL_POSTAR || '').trim() === '1'
}

export const createXypayOrderNo = (orderId: string): string => {
  const random = randomBytes(6).toString('hex')
  const value = `${String(orderId).replace(/[^A-Za-z0-9]/g, '')}${Date.now().toString(36)}${random}`
  return value.slice(-40)
}

const xypayCommonParams = () => {
  const baseUrl = String(process.env.XYPAY_BASE_URL || '').trim().replace(/\/+$/, '')
  const agetId = String(process.env.XYPAY_AGET_ID || '').trim()
  const custId = String(process.env.XYPAY_CUST_ID || '').trim()
  if (!baseUrl || !agetId || !custId) throw new Error('星驿付网关、机构编号或商户编号未配置')
  return { baseUrl, agetId, custId }
}

const normalizeClientIp = (value: string): string => {
  const source = value.trim()
  return source.startsWith('::ffff:') ? source.slice(7) : source
}
export const XYPAY_TIME_ZONE = 'Asia/Shanghai'

// Postar uses Beijing business dates. Containers often run in UTC, so never
// derive request timestamps from the host/container local timezone.
const xypayDateTimeParts = (value: Date) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: XYPAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value])) as Record<string, string>
  return {
    date: `${parts.year}${parts.month}${parts.day}`,
    time: `${parts.hour}${parts.minute}${parts.second}`,
  }
}

export const xypayOrderDate = (value: Date) => xypayDateTimeParts(value).date
export const xypayTimestamp = (now = new Date()) => {
  const { date, time } = xypayDateTimeParts(now)
  return `${date}${time}`
}

export async function createXypayJsapiPaymentIntent(
  amount: number,
  orderNo: string,
  context: { clientIp?: string; openId?: string } = {},
): Promise<PaymentIntentResult & { providerTradeNo?: string }> {
  const { baseUrl, agetId, custId } = xypayCommonParams()
  const notifyUrl = String(process.env.XYPAY_NOTIFY_URL || '').trim()
  const appId = String(process.env.WECHAT_APP_ID || '').trim()
  const openId = String(context.openId || '').trim()
  const clientIp = normalizeClientIp(String(context.clientIp || ''))
  if (!notifyUrl) throw new Error('星驿付异步通知地址未配置')
  if (!appId) throw new Error('微信小程序 AppID 未配置')
  if (!openId) throw new Error('微信 JSAPI 支付需要当前账号的小程序 openid')
  if (!clientIp) throw new Error('星驿付下单缺少消费者 IP')

  const amountFen = Math.round(Number(amount) * 100)
  if (!Number.isFinite(amountFen) || amountFen <= 0) throw new Error('支付金额无效')
  const params: Record<string, any> = {
    agetId,
    asyncNotify: notifyUrl,
    custId,
    ip: clientIp,
    openid: openId,
    orderNo,
    payWay: '1',
    timeStamp: xypayTimestamp(),
    traType: '8',
    txamt: amountFen,
    version: '1.0.0',
    wxAppid: appId,
  }
  const payload = { ...params, sign: signXypayRequest(params) }
  const response = await fetch(`${baseUrl}/yyfsevr/order/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await response.json().catch(() => ({})) as Record<string, any>
  if (!response.ok) throw new Error(`星驿付下单请求失败：HTTP ${response.status}`)
  if (String(result.code || '') !== '000000') throw new Error(`星驿付下单失败：${String(result.code || '')} ${String(result.msg || '')}`.trim())

  const data = (result.data || {}) as Record<string, any>
  const required = {
    appId: String(data.jsapiAppid || ''),
    timeStamp: String(data.jsapiTimestamp || ''),
    nonceStr: String(data.jsapiNoncestr || ''),
    package: String(data.jsapiPackage || ''),
    signType: String(data.jsapiSignType || ''),
    paySign: String(data.jsapiPaySign || ''),
  }
  if (String(data.threeOrderNo || '') !== orderNo || !required.appId || !required.timeStamp || !required.nonceStr || !required.package || !required.signType || !required.paySign) {
    throw new Error('星驿付未返回完整的微信 JSAPI 支付参数')
  }
  return {
    ready: true,
    payload: required,
    providerTradeNo: String(data.orderNo || '') || undefined,
    message: '微信 JSAPI 支付订单已创建',
  }
}

export async function queryXypayPayment(orderNo: string, orderTime: Date): Promise<XypayOrderQueryResult> {
  const { baseUrl, agetId, custId } = xypayCommonParams()
  const params: Record<string, any> = {
    agetId,
    custId,
    orderNo,
    orderTime: xypayOrderDate(orderTime),
    timeStamp: xypayTimestamp(),
    version: '1.0.0',
  }
  const request = { ...params, sign: signXypayRequest(params) }
  const response = await fetch(`${baseUrl}/yyfsevr/order/orderQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(request),
  })
  const result = await response.json().catch(() => ({})) as Record<string, any>
  if (!response.ok) throw new Error(`星驿付订单查询失败：HTTP ${response.status}`)
  const code = String(result.code || '')
  if (code === '000002') return { status: 'not_found', amount: 0, payload: result }
  if (code !== '000000') {
    return { status: code === '222222' || code === '-80000' ? 'pending' : 'failed', amount: 0, payload: result }
  }
  const data = (result.data || {}) as Record<string, any>
  const amountFen = Number(data.txamt || 0)
  const status = String(data.orderStatus || '')
  return {
    status: status === '1' ? 'paid' : status === '0' ? 'failed' : 'pending',
    amount: Number.isFinite(amountFen) ? amountFen / 100 : 0,
    providerTradeNo: String(data.orderNo || '') || undefined,
    payload: data,
  }
}

export function verifyXypayNotification(body: Record<string, any>): PaymentNotification {
  if (!verifyXypaySign(body)) throw new Error('星驿付回调验签失败')
  const status = String(body.ORDER_STATUS || '')
  if (status !== '1' && status !== '4') throw new Error(`星驿付回调状态暂不处理：${status}`)
  const outTradeNo = String(body.THREE_ORDER_NO || '').trim()
  const amountFen = Number(body.TXAMT)
  if (!outTradeNo || !Number.isFinite(amountFen)) throw new Error('星驿付回调订单号或金额不完整')
  const expectedAgetId = String(process.env.XYPAY_AGET_ID || '').trim()
  const expectedCustId = String(process.env.XYPAY_CUST_ID || '').trim()
  if (expectedAgetId && String(body.AGET_ID || '') !== expectedAgetId) throw new Error('星驿付回调机构编号不一致')
  if (expectedCustId && String(body.CUST_ID || '') !== expectedCustId) throw new Error('星驿付回调商户编号不一致')
  return {
    outTradeNo,
    providerTradeNo: String(body.ORDER_NO || '') || undefined,
    amount: amountFen / 100,
    payload: body,
  }
}