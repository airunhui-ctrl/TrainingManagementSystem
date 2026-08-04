import { BadRequestException } from '@nestjs/common'

export type PasswordResetDeliveryInput = {
  challengeId: string
  identifier: string
  targetType: 'username' | 'email' | 'phone'
  code: string
}

export function getPasswordResetReadiness() {
  const nodeEnv = String(process.env.NODE_ENV || 'development').trim().toLowerCase()
  const mode = process.env.PASSWORD_RESET_ADAPTER || (nodeEnv === 'production' ? 'webhook' : 'fake')
  const webhookConfigured = Boolean(String(process.env.PASSWORD_RESET_WEBHOOK_URL || '').trim())
  return {
    mode,
    configured: mode === 'fake' ? nodeEnv !== 'production' : mode === 'webhook' && webhookConfigured,
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
