import { BadRequestException } from '@nestjs/common'
import { sendAliyunSms } from '../sms/aliyun-sms'

export type PasswordResetDeliveryInput = {
  challengeId: string
  identifier: string
  targetType: 'phone'
  code: string
}

function requiredSmsEnv(name: string) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new BadRequestException(`阿里云短信缺少配置：${name}`)
  return value
}

function aliyunSmsReadiness(templateKey: string) {
  const required = ['ALIYUN_SMS_ACCESS_KEY_ID', 'ALIYUN_SMS_ACCESS_KEY_SECRET', 'ALIYUN_SMS_SIGN_NAME', templateKey]
  const missing = required.filter((key) => !String(process.env[key] || '').trim())
  return { configured: missing.length === 0, missing }
}

export function getPasswordResetReadiness() {
  const nodeEnv = String(process.env.NODE_ENV || 'development').trim().toLowerCase()
  const mode = process.env.PASSWORD_RESET_ADAPTER || (nodeEnv === 'production' ? 'webhook' : 'fake')
  if (mode === 'fake') {
    return { mode, configured: nodeEnv !== 'production', productionSafe: false, webhookConfigured: false, missing: [] }
  }
  if (mode === 'disabled') {
    return { mode, configured: false, productionSafe: false, webhookConfigured: false, missing: ['PASSWORD_RESET_ADAPTER=disabled'] }
  }
  if (mode === 'aliyun') {
    const { configured, missing } = aliyunSmsReadiness('ALIYUN_SMS_TEMPLATE_CODE_PASSWORD_RESET')
    return { mode, configured, productionSafe: configured, webhookConfigured: false, missing }
  }
  const webhookConfigured = Boolean(String(process.env.PASSWORD_RESET_WEBHOOK_URL || '').trim())
  return {
    mode,
    configured: mode === 'webhook' && webhookConfigured,
    productionSafe: mode === 'webhook' && webhookConfigured,
    webhookConfigured,
    missing: mode === 'webhook' && !webhookConfigured ? ['PASSWORD_RESET_WEBHOOK_URL'] : [],
  }
}

export async function deliverPasswordResetCode(input: PasswordResetDeliveryInput) {
  const mode = process.env.PASSWORD_RESET_ADAPTER || (process.env.NODE_ENV === 'production' ? 'webhook' : 'fake')
  if (mode === 'fake') {
    if (process.env.NODE_ENV === 'production') throw new BadRequestException('生产环境禁止使用 fake 密码找回渠道')
    console.info(`[password-reset] challenge=${input.challengeId} code=${input.code}`)
    return { delivered: false, devCode: input.code }
  }
  if (mode === 'disabled') throw new BadRequestException('密码找回渠道尚未配置，请联系管理员')
  if (mode === 'aliyun') {
    return sendAliyunSms({
      phone: input.identifier,
      signName: requiredSmsEnv('ALIYUN_SMS_SIGN_NAME'),
      templateCode: requiredSmsEnv('ALIYUN_SMS_TEMPLATE_CODE_PASSWORD_RESET'),
      templateParam: { code: input.code },
      accessKeyId: requiredSmsEnv('ALIYUN_SMS_ACCESS_KEY_ID'),
      accessKeySecret: requiredSmsEnv('ALIYUN_SMS_ACCESS_KEY_SECRET'),
      regionId: String(process.env.ALIYUN_SMS_REGION_ID || '').trim() || undefined,
      endpoint: String(process.env.ALIYUN_SMS_ENDPOINT || '').trim() || undefined,
    })
  }
  if (mode !== 'webhook') throw new BadRequestException(`未知密码找回适配器模式：${mode}`)

  const url = String(process.env.PASSWORD_RESET_WEBHOOK_URL || '').trim()
  if (!url) throw new BadRequestException('PASSWORD_RESET_WEBHOOK_URL 尚未配置')
  const token = String(process.env.PASSWORD_RESET_WEBHOOK_TOKEN || '').trim()
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({
      type: 'password_reset',
      challengeId: input.challengeId,
      identifier: input.identifier,
      targetType: input.targetType,
      code: input.code,
      expiresInMinutes: 10,
    }),
  })
  if (!response.ok) throw new BadRequestException(`密码找回渠道发送失败：${response.status}`)
  return { delivered: true }
}
