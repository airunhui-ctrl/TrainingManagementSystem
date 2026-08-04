/// <reference path="./globals.d.ts" />
import { createWechatJsapiPaymentParams } from '../src/channel-adapters'
import { generateKeyPairSync } from 'node:crypto'

describe('微信 JSAPI 支付参数签名', () => {
  test('生成小程序 requestPayment 所需参数', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const original = process.env.WECHAT_PAY_PRIVATE_KEY
    process.env.WECHAT_PAY_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    try {
      const result = createWechatJsapiPaymentParams('wx-app-test', 'wx-prepay-test', 1730000000000)
      expect(result).toMatchObject({ appId: 'wx-app-test', package: 'prepay_id=wx-prepay-test', signType: 'RSA' })
      expect(result.paySign).toMatch(/^[A-Za-z0-9+/=]+$/)
    } finally {
      if (original === undefined) delete process.env.WECHAT_PAY_PRIVATE_KEY
      else process.env.WECHAT_PAY_PRIVATE_KEY = original
    }
  })
})
