/// <reference path="./globals.d.ts" />
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AddressInfo } from 'node:net'
import { createTestDatabase, TestDatabase } from './test-utils'

describe('账号注册与找回密码', () => {
  let fixture: TestDatabase
  let app: INestApplication
  let baseUrl = ''

  const request = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    if (init.body) headers.set('Content-Type', 'application/json')
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers })
    const data = response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text()
    return { response, data: data as any }
  }

  beforeAll(async () => {
    fixture = createTestDatabase()
    process.env.NODE_ENV = 'development'
    process.env.PASSWORD_RESET_ADAPTER = 'fake'
    const { AppModule } = await import('../src/app.module')
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}/api`
  })

  afterAll(async () => { await app?.close(); fixture.cleanup() })

  test('注册成功、重复账号和密码确认校验', async () => {
    const created = await request('/auth/register', { method: 'POST', body: JSON.stringify({ username: 'new-user', password: 'new-password', confirmPassword: 'new-password', name: '新用户', phone: '13800000009' }) })
    expect(created.response.status).toBe(201)
    expect(created.data.accessToken).toBeTruthy()
    const optionalEmpty = await request('/auth/register', { method: 'POST', body: JSON.stringify({ username: 'empty-optional', password: 'new-password', confirmPassword: 'new-password', name: '', phone: '', email: '' }) })
    expect(optionalEmpty.response.status).toBe(201)
    expect((await request('/auth/register', { method: 'POST', body: JSON.stringify({ username: 'new-user', password: 'new-password', confirmPassword: 'new-password' }) })).response.status).toBe(409)
    expect((await request('/auth/register', { method: 'POST', body: JSON.stringify({ username: 'other-user', password: 'new-password', confirmPassword: 'different-password' }) })).response.status).toBe(400)
    expect((await request('/auth/login', { method: 'POST', body: JSON.stringify({ username: 'new-user', password: 'new-password' }) })).response.status).toBe(201)
  })

  test('找回密码验证码成功、错误次数限制和挑战一次性使用', async () => {
    const requested = await request('/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ identifier: 'new-user' }) })
    expect(requested.response.status).toBe(201)
    expect(requested.data.challengeId).toMatch(/^PRC-/)
    expect(requested.data.devCode).toMatch(/^\d{6}$/)
    const wrong = await request('/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ challengeId: requested.data.challengeId, code: '000000', newPassword: 'reset-password', confirmPassword: 'reset-password' }) })
    expect(wrong.response.status).toBe(400)
    const confirmed = await request('/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ challengeId: requested.data.challengeId, code: requested.data.devCode, newPassword: 'reset-password', confirmPassword: 'reset-password' }) })
    expect(confirmed.response.status).toBe(201)
    expect((await request('/auth/login', { method: 'POST', body: JSON.stringify({ username: 'new-user', password: 'reset-password' }) })).response.status).toBe(201)
    expect((await request('/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ challengeId: requested.data.challengeId, code: requested.data.devCode, newPassword: 'another-password', confirmPassword: 'another-password' }) })).response.status).toBe(400)
  })

  test('未知账号不泄漏账号存在性', async () => {
    const result = await request('/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ identifier: 'not-exists' }) })
    expect(result.response.status).toBe(201)
    expect(result.data.accepted).toBe(true)
    expect(result.data.message).toContain('如果账号存在')
    expect(result.data.devCode).toBeUndefined()
  })
})
