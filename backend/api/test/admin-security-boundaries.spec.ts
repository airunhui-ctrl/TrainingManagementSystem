/// <reference path="./globals.d.ts" />
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AddressInfo } from 'node:net'
import { createTestDatabase, TestDatabase } from './test-utils'
import { MvpService } from '../src/mvp/mvp.service'
import { PrismaService } from '../src/prisma.service'

describe('管理端权限与敏感数据边界', () => {
  let fixture: TestDatabase
  let app: INestApplication
  let baseUrl = ''
  let demoToken = ''
  let adminToken = ''
  let operatorToken = ''
  let db: PrismaService

  const request = async (path: string, init: RequestInit = {}, token?: string) => {
    const headers = new Headers(init.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers })
    const contentType = response.headers.get('content-type') || ''
    const data = contentType.includes('json') ? await response.json() : await response.arrayBuffer()
    return { response, data: data as any }
  }

  const login = async (username: string) => {
    const result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password: '123456' }) })
    expect(result.response.status).toBe(201)
    return result.data
  }

  beforeAll(async () => {
    fixture = createTestDatabase()
    const { AppModule } = await import('../src/app.module')
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.listen(0, '127.0.0.1')
    db = app.get(PrismaService)
    const address = app.getHttpServer().address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}/api`
    demoToken = (await login('demo')).accessToken
    adminToken = (await login('admin')).accessToken
    operatorToken = (await login('operator')).accessToken
  })

  afterAll(async () => {
    if (app) await app.close()
    fixture.cleanup()
  })

  test('所有管理端读取和写入入口都拒绝普通用户', async () => {
    const cases: Array<{ method: string; path: string; body?: string }> = [
      { method: 'GET', path: '/admin/courses' },
      { method: 'POST', path: '/admin/courses', body: '{}' },
      { method: 'GET', path: '/admin/dashboard' },
      { method: 'GET', path: '/admin/integration-readiness' },
      { method: 'GET', path: '/admin/orders' },
      { method: 'GET', path: '/admin/banners' },
      { method: 'POST', path: '/admin/banners', body: '{}' },
      { method: 'DELETE', path: '/admin/banners/missing' },
      { method: 'GET', path: '/admin/templates' },
      { method: 'POST', path: '/admin/templates', body: '{}' },
      { method: 'GET', path: '/admin/enrollments' },
      { method: 'GET', path: '/admin/enrollment-records' },
      { method: 'GET', path: '/admin/enrollment-summary' },
      { method: 'GET', path: '/admin/student-profiles' },
      { method: 'GET', path: '/admin/student-profiles/export' },
      { method: 'POST', path: '/admin/student-profiles/match', body: '{}' },
      { method: 'GET', path: '/admin/student-profiles/missing/relationships' },
      { method: 'POST', path: '/admin/student-profiles/missing/relationships', body: JSON.stringify({ userId: 'u-demo' }) },
      { method: 'DELETE', path: '/admin/student-profiles/missing/relationships/u-demo' },
      { method: 'POST', path: '/admin/student-profiles/missing/relationships/u-demo/default' },
      { method: 'GET', path: '/admin/student-profiles/missing/enrollments' },
      { method: 'POST', path: '/admin/student-profiles/missing/merge', body: JSON.stringify({ targetId: 'missing-target' }) },
      { method: 'GET', path: '/admin/users' },
      { method: 'POST', path: '/admin/users/missing/enabled', body: JSON.stringify({ enabled: false }) },
      { method: 'POST', path: '/admin/users/missing/reset-password' },
      { method: 'GET', path: '/admin/payment-settings' },
      { method: 'PATCH', path: '/admin/payment-settings', body: '{}' },
      { method: 'GET', path: '/admin/discount-rules' },
      { method: 'POST', path: '/admin/discount-rules', body: '{}' },
      { method: 'GET', path: '/admin/feedbacks' },
      { method: 'POST', path: '/admin/feedbacks/missing/resolve', body: '{}' },
      { method: 'GET', path: '/admin/messages' },
      { method: 'POST', path: '/admin/messages', body: '{}' },
      { method: 'GET', path: '/admin/points' },
      { method: 'POST', path: '/admin/points/missing/adjust', body: '{}' },
      { method: 'GET', path: '/admin/configs' },
      { method: 'PUT', path: '/admin/configs/test-key', body: '{}' },
      { method: 'GET', path: '/admin/audits' },
    ]
    const results = await Promise.all(cases.map(({ method, path, body }) => request(path, { method, body }, demoToken)))
    results.forEach(({ response, data }, index) => {
      if (response.status !== 403) throw new Error(`${cases[index].method} ${cases[index].path} returned HTTP ${response.status}: ${JSON.stringify(data)}`)
    })
  })

  test('报名履历和学员列表默认脱敏，受保护详情才揭示敏感字段', async () => {
    const created = await request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        courseId: 'course-1',
        participants: [{ data: { name: '边界测试学员', phone: '13900000091', company: '边界测试企业' } }],
        paymentMethod: 'offline',
      }),
    }, demoToken)
    expect(created.response.status).toBe(201)
    const enrollments = await request('/admin/enrollment-records?page=1&pageSize=5', {}, adminToken)
    expect(enrollments.response.status).toBe(200)
    const enrollment = enrollments.data.items?.find((item: any) => item.phone)
    if (!enrollment) throw new Error(`报名履历列表没有可验证数据：${JSON.stringify(enrollments.data)}`)
    expect(enrollment.phone).toMatch(/^1\d{2}\*{4}\d{4}$/)
    expect(enrollment).not.toHaveProperty('formPayload')

    const enrollmentDetail = await request(`/admin/enrollment-records/${encodeURIComponent(enrollment.id)}`, {}, adminToken)
    expect(enrollmentDetail.response.status).toBe(200)
    expect(enrollmentDetail.data.phone).toMatch(/^1\d{10}$/)
    expect(enrollmentDetail.data.formPayload).toBeTruthy()

    const operatorEnrollmentDetail = await request(`/admin/enrollment-records/${encodeURIComponent(enrollment.id)}`, {}, operatorToken)
    expect(operatorEnrollmentDetail.response.status).toBe(200)
    expect(operatorEnrollmentDetail.data.phone).toMatch(/^1\d{2}\*{4}\d{4}$/)
    expect(operatorEnrollmentDetail.data.formPayload).toBeUndefined()

    const profiles = await request('/admin/student-profiles?page=1&pageSize=5', {}, adminToken)
    expect(profiles.response.status).toBe(200)
    const profile = profiles.data.items?.find((item: any) => item.phone)
    if (!profile) throw new Error(`学员档案列表没有可验证数据：${JSON.stringify(profiles.data)}`)
    expect(profile.phone).toMatch(/^1\d{2}\*{4}\d{4}$/)
    expect(profile.phoneNormalized).toBeUndefined()
    if (profile.email) expect(profile.email).toContain('***')

    const profileDetail = await request(`/admin/student-profiles/${encodeURIComponent(profile.id)}`, {}, adminToken)
    expect(profileDetail.response.status).toBe(200)
    expect(profileDetail.data.phone).toMatch(/^1\d{10}$/)
    expect(profileDetail.data.phoneNormalized).toBe(profileDetail.data.phone)

    const operatorProfileDetail = await request(`/admin/student-profiles/${encodeURIComponent(profile.id)}`, {}, operatorToken)
    expect(operatorProfileDetail.response.status).toBe(200)
    expect(operatorProfileDetail.data.phone).toMatch(/^1\d{2}\*{4}\d{4}$/)
    expect(operatorProfileDetail.data.phoneNormalized).toBeUndefined()

    const maskedExport = await request('/admin/student-profiles/export?limit=20', {}, adminToken)
    expect(maskedExport.response.status).toBe(200)
    expect(maskedExport.response.headers.get('content-disposition')).toBe('attachment; filename="student-profiles-masked.json"')
    expect(maskedExport.data.sensitiveFieldsMasked).toBe(true)
    const exportedMasked = maskedExport.data.items?.find((item: any) => item.id === profile.id)
    expect(exportedMasked?.phone).toMatch(/^1\d{2}\*{4}\d{4}$/)
    expect(exportedMasked?.phoneNormalized).toBeUndefined()

    const revealedExport = await request('/admin/student-profiles/export?reveal=true&limit=20', {}, adminToken)
    expect(revealedExport.response.status).toBe(200)
    expect(revealedExport.response.headers.get('content-disposition')).toBe('attachment; filename="student-profiles.json"')
    expect(revealedExport.data.sensitiveFieldsMasked).toBe(false)
    const exportedRevealed = revealedExport.data.items?.find((item: any) => item.id === profile.id)
    expect(exportedRevealed?.phone).toMatch(/^1\d{10}$/)
    expect(exportedRevealed?.phoneNormalized).toBe(exportedRevealed.phone)

    const operatorRevealedExport = await request('/admin/student-profiles/export?reveal=true&limit=20', {}, operatorToken)
    expect(operatorRevealedExport.response.status).toBe(200)
    expect(operatorRevealedExport.response.headers.get('content-disposition')).toBe('attachment; filename="student-profiles-masked.json"')
    expect(operatorRevealedExport.data.sensitiveFieldsMasked).toBe(true)
    const operatorExported = operatorRevealedExport.data.items?.find((item: any) => item.id === profile.id)
    expect(operatorExported?.phone).toMatch(/^1\d{2}\*{4}\d{4}$/)
    expect(operatorExported?.phoneNormalized).toBeUndefined()

    await db.student.create({ data: { id: 'stu-legacy-short-phone', name: '短号码历史档案', phone: '123132', phoneNormalized: '123132', status: 'active' } })
    const legacyExport = await request('/admin/student-profiles/export?keyword=%E7%9F%AD%E5%8F%B7%E7%A0%81%E5%8E%86%E5%8F%B2%E6%A1%A3%E6%A1%88', {}, adminToken)
    expect(legacyExport.response.status).toBe(200)
    expect(legacyExport.data.sensitiveFieldsMasked).toBe(true)
    expect(legacyExport.data.items?.[0]?.phone).toBe('******')
  })

  test('账号停用/重置密码会立即吊销旧 access token，且学员关系不能跨账号操作', async () => {
    const oldToken = (await login('demo')).accessToken
    expect((await request('/admin/users/u-demo/enabled', { method: 'POST', body: JSON.stringify({ enabled: false }) }, adminToken)).response.status).toBe(201)
    expect((await request('/auth/me', {}, oldToken)).response.status).toBe(401)
    expect((await request('/admin/users/u-demo/enabled', { method: 'POST', body: JSON.stringify({ enabled: true }) }, adminToken)).response.status).toBe(201)

    const activeToken = (await login('demo')).accessToken
    const reset = await request('/admin/users/u-demo/reset-password', { method: 'POST' }, adminToken)
    expect(reset.response.status).toBe(201)
    expect((await request('/auth/me', {}, activeToken)).response.status).toBe(401)
    const relogin = await request('/auth/login', { method: 'POST', body: JSON.stringify({ username: 'demo', password: reset.data.resetPassword }) })
    expect(relogin.response.status).toBe(201)

    const created = await request('/students', { method: 'POST', body: JSON.stringify({ name: '跨账号关系学员', phone: '13900000092', company: '权限隔离企业' }) }, relogin.data.accessToken)
    expect(created.response.status).toBe(201)
    const studentId = created.data.id
    for (const operation of [
      { method: 'PATCH', path: `/students/${encodeURIComponent(studentId)}`, body: JSON.stringify({ company: '不应修改' }) },
      { method: 'POST', path: `/students/${encodeURIComponent(studentId)}/default` },
      { method: 'DELETE', path: `/students/${encodeURIComponent(studentId)}` },
    ]) {
      expect((await request(operation.path, { method: operation.method, body: operation.body }, adminToken)).response.status).toBe(404)
    }
  })

  test('不能停用当前登录管理员或最后一个启用管理员', async () => {
    const self = await request('/admin/users/u-admin/enabled', { method: 'POST', body: JSON.stringify({ enabled: false }) }, adminToken)
    expect(self.response.status).toBe(400)
    expect(String(self.data.message || self.data)).toContain('当前登录')

    const operatorDisabled = await request('/admin/users/u-operator/enabled', { method: 'POST', body: JSON.stringify({ enabled: false }) }, adminToken)
    expect(operatorDisabled.response.status).toBe(201)
    const service = app.get(MvpService)
    await expect(service.setUserEnabled('u-admin', false, 'operator')).rejects.toThrow('最后一个启用')
    await expect(service.setUserEnabled('u-operator', true, 'admin')).resolves.toMatchObject({ enabled: true })
  })
})
