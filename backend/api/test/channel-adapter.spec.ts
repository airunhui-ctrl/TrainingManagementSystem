/// <reference path="./globals.d.ts" />
import { createPaymentIntent, getIntegrationReadiness, resolveWechatIdentity } from '../src/channel-adapters'
import { getPasswordResetReadiness } from '../src/auth/password-reset-delivery'

describe('外部渠道 adapter 边界', () => {
  const original = { node: process.env.NODE_ENV, wechat: process.env.WECHAT_ADAPTER, payment: process.env.PAYMENT_ADAPTER }
  const restore = () => {
    process.env.NODE_ENV = original.node
    process.env.WECHAT_ADAPTER = original.wechat
    process.env.PAYMENT_ADAPTER = original.payment
  }

  test('开发 fake 微信身份仅用于非生产环境', async () => {
    process.env.NODE_ENV = 'test'; process.env.WECHAT_ADAPTER = 'fake'
    await expect(resolveWechatIdentity('', { deviceId: 'adapter-test' })).resolves.toMatchObject({ openId: expect.stringMatching(/^mock:/) })
    process.env.NODE_ENV = 'production'
    await expect(resolveWechatIdentity('', { deviceId: 'adapter-test' })).rejects.toThrow('生产环境禁止使用 fake')
    restore()
  })

  test('未配置支付渠道不会返回可调用的成功 payload', async () => {
    process.env.NODE_ENV = 'production'; process.env.PAYMENT_ADAPTER = 'disabled'
    await expect(createPaymentIntent('wechat', 100, 'order-1')).resolves.toMatchObject({ ready: false, payload: null })
    process.env.PAYMENT_ADAPTER = 'real'; delete process.env.WECHAT_PAY_MCH_ID
    await expect(createPaymentIntent('wechat', 100, 'order-1')).resolves.toMatchObject({ ready: false, payload: null })
    restore()
  })

  test('配置自检只返回缺项，不暴露密钥内容', () => {
    const keys = ['NODE_ENV', 'PAYMENT_ADAPTER', 'WECHAT_ADAPTER', 'WECHAT_APP_ID', 'WECHAT_APP_SECRET', 'WECHAT_PAY_MCH_ID', 'WECHAT_PAY_APP_ID', 'WECHAT_PAY_SERIAL_NO', 'WECHAT_PAY_PRIVATE_KEY', 'WECHAT_PAY_API_V3_KEY', 'WECHAT_PAY_PLATFORM_CERTIFICATE', 'WECHAT_PAY_NOTIFY_URL', 'ALIPAY_APP_ID', 'ALIPAY_PRIVATE_KEY', 'ALIPAY_PUBLIC_KEY', 'ALIPAY_NOTIFY_URL', 'ALIPAY_RETURN_URL', 'PASSWORD_RESET_ADAPTER', 'PASSWORD_RESET_WEBHOOK_URL']
    const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
    try {
      process.env.NODE_ENV = 'production'
      process.env.PAYMENT_ADAPTER = 'real'
      process.env.WECHAT_ADAPTER = 'real'
      process.env.WECHAT_APP_SECRET = 'very-secret-value'
      for (const key of keys) if (!['NODE_ENV', 'PAYMENT_ADAPTER', 'WECHAT_ADAPTER'].includes(key)) delete process.env[key]
      process.env.WECHAT_APP_SECRET = 'very-secret-value'
      const readiness = getIntegrationReadiness()
      expect(readiness.wechatPayment.productionSafe).toBe(false)
      expect(readiness.wechatPayment.missing).toContain('WECHAT_PAY_MCH_ID')
      expect(readiness.alipayPayment.missing).toContain('ALIPAY_APP_ID')
      expect(readiness.wechatPayment.configured).toBe(false)
      expect(JSON.stringify(readiness)).not.toContain('very-secret-value')
      process.env.PASSWORD_RESET_ADAPTER = 'fake'
      expect(getPasswordResetReadiness().productionSafe).toBe(false)
    } finally {
      for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] }
    }
  })
})
