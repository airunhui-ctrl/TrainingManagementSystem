import { BadRequestException } from '@nestjs/common'
import { createHmac, randomBytes } from 'node:crypto'

export interface AliyunSmsSendInput {
  phone: string
  signName: string
  templateCode: string
  templateParam: Record<string, string | number>
  accessKeyId: string
  accessKeySecret: string
  regionId?: string
  endpoint?: string
}

export interface AliyunSmsResult {
  delivered: boolean
  requestId?: string
  bizId?: string
  devCode?: string
}

const DEFAULT_REGION = 'cn-hangzhou'
const DEFAULT_ENDPOINT = 'dysmsapi.aliyuncs.com'

export function percentEncode(value: string) {
  return encodeURIComponent(value)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~')
}

export type AliyunSmsSignedQuery = Record<string, string> & { Signature: string; stringToSign: string }

export function buildAliyunSmsQuery(input: AliyunSmsSendInput, now = new Date()): AliyunSmsSignedQuery {
  const timestamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z')
  const templateParam = JSON.stringify(input.templateParam)
  const params: Record<string, string> = {
    AccessKeyId: input.accessKeyId,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: input.phone,
    RegionId: input.regionId || DEFAULT_REGION,
    SignName: input.signName,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: randomBytes(12).toString('hex'),
    SignatureVersion: '1.0',
    TemplateCode: input.templateCode,
    TemplateParam: templateParam,
    Timestamp: timestamp,
    Version: '2017-05-25',
  }
  const canonicalized = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&')
  const stringToSign = `GET&%2F&${percentEncode(canonicalized)}`
  const signature = createHmac('sha1', `${input.accessKeySecret}&`)
    .update(stringToSign)
    .digest('base64')
  return { ...params, Signature: signature, stringToSign } as AliyunSmsSignedQuery
}

export async function sendAliyunSms(
  input: AliyunSmsSendInput,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = (input, init) => fetch(input, init),
): Promise<AliyunSmsResult> {
  const missing: string[] = []
  if (!String(input.accessKeyId || '').trim()) missing.push('AccessKeyId')
  if (!String(input.accessKeySecret || '').trim()) missing.push('AccessKeySecret')
  if (!String(input.signName || '').trim()) missing.push('SignName')
  if (!String(input.templateCode || '').trim()) missing.push('TemplateCode')
  if (!/^1\d{10}$/.test(String(input.phone || ''))) missing.push('PhoneNumbers')
  if (missing.length) throw new BadRequestException(`阿里云短信配置不完整：${missing.join('、')}`)

  const { stringToSign, ...query } = buildAliyunSmsQuery(input)
  const endpoint = String(input.endpoint || DEFAULT_ENDPOINT).replace(/^https?:\/\//, '').replace(/\/$/, '')
  const encodedQuery = Object.keys(query)
    .map((key) => `${percentEncode(key)}=${percentEncode(query[key])}`)
    .join('&')
  const response = await fetchImpl(`https://${endpoint}/?${encodedQuery}`, { method: 'GET' })
  let payload: Record<string, any> = {}
  try {
    payload = await response.json() as Record<string, any>
  } catch {
    payload = {}
  }
  if (!response.ok || payload.Code !== 'OK') {
    throw new BadRequestException(`阿里云短信发送失败：${payload.Code || response.status} ${payload.Message || ''}${payload.RequestId ? ` RequestId=${payload.RequestId}` : ''}`.trim())
  }
  return { delivered: true, requestId: payload.RequestId, bizId: payload.BizId }
}

