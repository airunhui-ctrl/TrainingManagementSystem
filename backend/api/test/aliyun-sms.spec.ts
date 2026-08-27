/// <reference path="./globals.d.ts" />
import { BadRequestException } from '@nestjs/common'
import { buildAliyunSmsQuery, percentEncode, sendAliyunSms, AliyunSmsSendInput } from '../src/sms/aliyun-sms'
import { deliverPhoneRegistrationCode, getPhoneRegistrationReadiness } from '../src/auth/phone-registration-delivery'
import { deliverPasswordResetCode, getPasswordResetReadiness } from '../src/auth/password-reset-delivery'

const ENV_KEYS = [
  'PHONE_REGISTRATION_ADAPTER',
  'PASSWORD_RESET_ADAPTER',
  'ALIYUN_SMS_ACCESS_KEY_ID',
  'ALIYUN_SMS_ACCESS_KEY_SECRET',
  'ALIYUN_SMS_SIGN_NAME',
  'ALIYUN_SMS_TEMPLATE_CODE_REGISTRATION',
  'ALIYUN_SMS_TEMPLATE_CODE_PASSWORD_RESET',
] as const

function saveEnv() {
  const saved: Record<string, string | undefined> = {}
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  return saved
}

function restoreEnv(saved: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
}

function okAliyunFetch() {
  return async () => new Response(JSON.stringify({ Code: 'OK', RequestId: 'req-adapter', BizId: 'biz-adapter' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('阿里云短信客户端', () => {
  const baseInput: AliyunSmsSendInput = {
    phone: '13800000001',
    signName: '测试签名',
    templateCode: 'SMS_TEST_001',
    templateParam: { code: '123456' },
    accessKeyId: 'test-key-id',
    accessKeySecret: 'test-key-secret',
  }

  test('RPC 参数包含短信发送所需字段和签名', () => {
    const query = buildAliyunSmsQuery(baseInput, new Date('2026-08-18T00:00:00.000Z'))
    expect(query.Action).toBe('SendSms')
    expect(query.Version).toBe('2017-05-25')
    expect(query.PhoneNumbers).toBe(baseInput.phone)
    expect(query.SignName).toBe(baseInput.signName)
    expect(query.TemplateCode).toBe(baseInput.templateCode)
    expect(query.TemplateParam).toContain('123456')
    expect(query.Signature).toBeTruthy()
    expect(query.Timestamp).toBe('2026-08-18T00:00:00Z')
    expect(query.SignatureNonce).toBeTruthy()
  })

  test('URL 编码与阿里云 RPC 特殊字符规则一致', () => {
    expect(percentEncode('+*~')).toBe('%2B%2A~')
    expect(percentEncode('a b')).toBe('a%20b')
  })

  test('发送成功时返回阿里云 RequestId 和 BizId', async () => {
    let capturedUrl = ''
    const fetchMock = async (url: string) => {
      capturedUrl = url
      return new Response(JSON.stringify({ Code: 'OK', RequestId: 'req-1', BizId: 'biz-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const result = await sendAliyunSms(baseInput, fetchMock)
    expect(result).toMatchObject({ delivered: true, requestId: 'req-1', bizId: 'biz-1' })
    expect(capturedUrl).toContain('Action=SendSms')
    expect(capturedUrl).toContain('PhoneNumbers=13800000001')
    expect(capturedUrl).toContain('Signature=')
  })

  test('阿里云返回非 OK 时抛出可读错误', async () => {
    const fetchMock = async () => new Response(JSON.stringify({ Code: 'isv.SMS_SIGNATURE_ILLEGAL', Message: '签名不合法', RequestId: 'req-error' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    await expect(sendAliyunSms(baseInput, fetchMock)).rejects.toThrow('RequestId=req-error')
  })

  test('缺少凭证或模板时拒绝发送', async () => {
    await expect(sendAliyunSms({ ...baseInput, accessKeySecret: '' })).rejects.toThrow(BadRequestException)
    await expect(sendAliyunSms({ ...baseInput, templateCode: '' })).rejects.toThrow('TemplateCode')
  })

  test('注册验证码 aliyun 模式调用客户端且 readiness 为已配置', async () => {
    const saved = saveEnv()
    const savedFetch = (globalThis as any).fetch
    try {
      process.env.PHONE_REGISTRATION_ADAPTER = 'aliyun'
      process.env.ALIYUN_SMS_ACCESS_KEY_ID = 'ak-test'
      process.env.ALIYUN_SMS_ACCESS_KEY_SECRET = 'sk-test'
      process.env.ALIYUN_SMS_SIGN_NAME = '测试签名'
      process.env.ALIYUN_SMS_TEMPLATE_CODE_REGISTRATION = 'SMS_REG_TEST'
      ;(globalThis as any).fetch = okAliyunFetch()
      const result = await deliverPhoneRegistrationCode({ challengeId: 'prg-adapter', phone: '13800000002', code: '123456' })
      expect(result).toMatchObject({ delivered: true, requestId: 'req-adapter', bizId: 'biz-adapter' })
      expect(getPhoneRegistrationReadiness()).toMatchObject({ mode: 'aliyun', configured: true, productionSafe: true })
    } finally {
      restoreEnv(saved)
      ;(globalThis as any).fetch = savedFetch
    }
  })

  test('找回密码 aliyun 模式调用客户端且 readiness 为已配置', async () => {
    const saved = saveEnv()
    const savedFetch = (globalThis as any).fetch
    try {
      process.env.PASSWORD_RESET_ADAPTER = 'aliyun'
      process.env.ALIYUN_SMS_ACCESS_KEY_ID = 'ak-test'
      process.env.ALIYUN_SMS_ACCESS_KEY_SECRET = 'sk-test'
      process.env.ALIYUN_SMS_SIGN_NAME = '测试签名'
      process.env.ALIYUN_SMS_TEMPLATE_CODE_PASSWORD_RESET = 'SMS_RESET_TEST'
      ;(globalThis as any).fetch = okAliyunFetch()
      const result = await deliverPasswordResetCode({ challengeId: 'prc-adapter', identifier: '13800000003', targetType: 'phone', code: '654321' })
      expect(result).toMatchObject({ delivered: true, requestId: 'req-adapter', bizId: 'biz-adapter' })
      expect(getPasswordResetReadiness()).toMatchObject({ mode: 'aliyun', configured: true, productionSafe: true })
    } finally {
      restoreEnv(saved)
      ;(globalThis as any).fetch = savedFetch
    }
  })
})

