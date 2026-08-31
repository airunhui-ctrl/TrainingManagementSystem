/// <reference path="./globals.d.ts" />
import { createHash, createPrivateKey, generateKeyPairSync, privateEncrypt } from 'node:crypto'
import { buildXypaySignString, createXypayOrderNo, createXypayJsapiPaymentIntent, verifyXypayNotification, verifyXypaySign, xypayTimestamp } from '../src/xypay-sign'

describe('星驿付签名、JSAPI 下单与异步通知', () => {
  const saved = Object.fromEntries([
    'XYPAY_BASE_URL', 'XYPAY_AGET_ID', 'XYPAY_CUST_ID', 'XYPAY_PUBLIC_KEY', 'XYPAY_NOTIFY_URL', 'WECHAT_APP_ID',
  ].map((key) => [key, process.env[key]]))

  const originalFetch = global.fetch
  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    global.fetch = originalFetch
  })

  test('签名串按 ASCII 排序、保留空串并跳过 null', () => {
    expect(buildXypaySignString({ b: '', A: '1', c: null, a: '2' })).toBe('A=1&a=2&b=')
  })

  test('星驿付时间戳固定使用东八区业务日期', () => {
  // 2026-01-01 20:30:05 UTC is already 2026-01-02 04:30:05 in Beijing.
  expect(xypayTimestamp(new Date('2026-01-01T20:30:05.000Z'))).toBe('20260102043005')
})

test('重付订单号保持唯一且不超过 40 位', () => {
    const first = createXypayOrderNo('HX-1760000000000-abcdef')
    const second = createXypayOrderNo('HX-1760000000000-abcdef')
    expect(first).not.toBe(second)
    expect(first.length).toBeLessThanOrEqual(40)
    expect(first).toMatch(/^[A-Za-z0-9]+$/)
  })

  test('JSAPI 下单返回参数映射为小程序 requestPayment 结构', async () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    process.env.XYPAY_BASE_URL = 'https://xypay.test'
    process.env.XYPAY_AGET_ID = 'AGET'
    process.env.XYPAY_CUST_ID = 'CUST'
    process.env.XYPAY_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    process.env.XYPAY_NOTIFY_URL = 'https://api.example.com/api/payments/postar/notify'
    process.env.WECHAT_APP_ID = 'wx-app'
    const responseBody = JSON.stringify({
      code: '000000',
      data: {
        threeOrderNo: 'trade1',
        orderNo: 'xypay-1',
        jsapiAppid: 'wx-app',
        jsapiTimestamp: '1730000000',
        jsapiNoncestr: 'nonce',
        jsapiPackage: 'prepay_id=prepay-1',
        jsapiSignType: 'RSA',
        jsapiPaySign: 'pay-sign',
      },
    })
    const calls: Array<[any, RequestInit]> = []
    global.fetch = (async (input: any, init: RequestInit) => {
      calls.push([input, init])
      return new Response(responseBody, { status: 200 })
    }) as unknown as typeof fetch

    const result = await createXypayJsapiPaymentIntent(0.01, 'trade1', { clientIp: '::ffff:1.2.3.4', openId: 'openid-1' })
    const request = calls[0][1]
    const body = JSON.parse(String(request.body)) as Record<string, any>
    expect(calls[0][0]).toBe('https://xypay.test/yyfsevr/order/pay')
    expect(body).toMatchObject({ agetId: 'AGET', custId: 'CUST', orderNo: 'trade1', openid: 'openid-1', payWay: '1', traType: '8', txamt: 1, ip: '1.2.3.4', wxAppid: 'wx-app' })
    expect(body.sign).toMatch(/^[A-Za-z0-9+/=]+$/)
    expect(result).toMatchObject({
      ready: true,
      providerTradeNo: 'xypay-1',
      payload: { appId: 'wx-app', package: 'prepay_id=prepay-1', signType: 'RSA' },
    })
  })

  test('异步通知必须验签并解析三方单号和分转元金额', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    process.env.XYPAY_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    process.env.XYPAY_AGET_ID = 'AGET'
    process.env.XYPAY_CUST_ID = 'CUST'
    const body: Record<string, any> = {
      AGET_ID: 'AGET',
      CUST_ID: 'CUST',
      THREE_ORDER_NO: 'trade1',
      ORDER_NO: 'xypay-1',
      T_PAY_NO: 'wx-pay-1',
      TXAMT: '1',
      ORDER_STATUS: '1',
    }
    const digest = createHash('sha256').update(buildXypaySignString(body)).digest('hex')
    body.sign = privateEncrypt({ key: createPrivateKey(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()), padding: 1 }, Buffer.from(digest)).toString('base64')
    expect(verifyXypaySign(body)).toBe(true)
    expect(verifyXypayNotification(body)).toMatchObject({ outTradeNo: 'trade1', providerTradeNo: 'xypay-1', amount: 0.01 })
  })
})