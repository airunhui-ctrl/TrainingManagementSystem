/// <reference path="./globals.d.ts" />
import { createCipheriv, createSign, generateKeyPairSync } from 'node:crypto'
import { verifyAlipayNotification, verifyWechatNotification } from '../src/channel-adapters'

describe('微信/支付宝回调验签与解密', () => {
  const original = { apiKey: process.env.WECHAT_PAY_API_V3_KEY, cert: process.env.WECHAT_PAY_PLATFORM_CERTIFICATE, publicKey: process.env.ALIPAY_PUBLIC_KEY }
  afterEach(() => {
    process.env.WECHAT_PAY_API_V3_KEY = original.apiKey
    process.env.WECHAT_PAY_PLATFORM_CERTIFICATE = original.cert
    process.env.ALIPAY_PUBLIC_KEY = original.publicKey
  })

  test('微信支付 v3 回调验签、AES-GCM 解密和金额解析', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    process.env.WECHAT_PAY_PLATFORM_CERTIFICATE = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const apiKey = '0123456789abcdef0123456789abcdef'
    process.env.WECHAT_PAY_API_V3_KEY = apiKey
    const nonce = Buffer.from('0123456789ab')
    const aad = Buffer.from('transaction')
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(apiKey), nonce)
    cipher.setAAD(aad)
    const plain = JSON.stringify({ out_trade_no: 'HX-WX-1', transaction_id: 'wx-transaction-1', trade_state: 'SUCCESS', amount: { total: 1234, currency: 'CNY' } })
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()])
    const body = JSON.stringify({ resource: { algorithm: 'AEAD_AES_256_GCM', ciphertext: encrypted.toString('base64'), nonce: nonce.toString('utf8'), associated_data: aad.toString('utf8') } })
    const timestamp = '1730000000'
    const requestNonce = 'notify-nonce'
    const signer = createSign('RSA-SHA256'); signer.update(`${timestamp}\n${requestNonce}\n${body}\n`); signer.end()
    const signature = signer.sign(privateKey, 'base64')
    const result = verifyWechatNotification({ 'wechatpay-timestamp': timestamp, 'wechatpay-nonce': requestNonce, 'wechatpay-signature': signature }, body)
    expect(result).toMatchObject({ outTradeNo: 'HX-WX-1', providerTradeNo: 'wx-transaction-1', amount: 12.34 })
  })

  test('支付宝 RSA2 回调验签和成功状态解析', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    process.env.ALIPAY_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const body: Record<string, any> = { app_id: '2024000000000000', out_trade_no: 'HX-ALI-1', trade_no: '202608040001', trade_status: 'TRADE_SUCCESS', total_amount: '12.34', seller_id: '2088000000000000', sign_type: 'RSA2' }
    const signText = Object.keys(body).filter((key) => !['sign', 'sign_type'].includes(key) && body[key] !== '').sort().map((key) => `${key}=${body[key]}`).join('&')
    const signer = createSign('RSA-SHA256'); signer.update(signText); signer.end()
    body.sign = signer.sign(privateKey, 'base64')
    expect(verifyAlipayNotification(body)).toMatchObject({ outTradeNo: 'HX-ALI-1', providerTradeNo: '202608040001', amount: 12.34 })
  })
})
