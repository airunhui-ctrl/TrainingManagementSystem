import { BadRequestException } from '@nestjs/common'

export type PhoneRegistrationDeliveryInput = {
  challengeId: string
  phone: string
  code: string
}

export function getPhoneRegistrationReadiness() {
  const nodeEnv = String(process.env.NODE_ENV || 'development').trim().toLowerCase()
  const mode = process.env.PHONE_REGISTRATION_ADAPTER || (nodeEnv === 'production' ? 'webhook' : 'fake')
  const webhookConfigured = Boolean(String(process.env.PHONE_REGISTRATION_WEBHOOK_URL || '').trim())
  return {
    mode,
    configured: mode === 'fake' ? nodeEnv !== 'production' : mode === 'webhook' && webhookConfigured,
    productionSafe: mode === 'webhook' && webhookConfigured,
    webhookConfigured,
    missing: mode === 'webhook' && !webhookConfigured ? ['PHONE_REGISTRATION_WEBHOOK_URL'] : [],
  }
}

export async function deliverPhoneRegistrationCode(input: PhoneRegistrationDeliveryInput) {
  const mode = process.env.PHONE_REGISTRATION_ADAPTER || (process.env.NODE_ENV === 'production' ? 'webhook' : 'fake')
  if (mode === 'fake') {
    if (process.env.NODE_ENV === 'production') throw new BadRequestException('生产环境禁止使用 fake 手机短信渠道')
    console.info(`[phone-registration] challenge=${input.challengeId} phone=${input.phone} code=${input.code}`)
    return { delivered: false, devCode: input.code }
  }
  if (mode === 'disabled') throw new BadRequestException('短信注册渠道尚未配置，请联系管理员')
  if (mode !== 'webhook') throw new BadRequestException(`未知短信注册适配器模式：${mode}`)
  const url = String(process.env.PHONE_REGISTRATION_WEBHOOK_URL || '').trim()
  if (!url) throw new BadRequestException('PHONE_REGISTRATION_WEBHOOK_URL 尚未配置')
  const token = String(process.env.PHONE_REGISTRATION_WEBHOOK_TOKEN || '').trim()
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ type: 'phone_registration', challengeId: input.challengeId, phone: input.phone, code: input.code, expiresInMinutes: 10 }),
  })
  if (!response.ok) throw new BadRequestException(`短信验证码发送失败：${response.status}`)
  return { delivered: true }
}
