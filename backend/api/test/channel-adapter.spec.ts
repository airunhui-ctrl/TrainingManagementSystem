/// <reference path="./globals.d.ts" />
import { createPaymentIntent, resolveWechatIdentity } from '../src/channel-adapters'

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
})
