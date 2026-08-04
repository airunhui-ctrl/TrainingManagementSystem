/// <reference path="./globals.d.ts" />
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AddressInfo } from 'node:net'
import { createTestDatabase, TestDatabase } from './test-utils'

describe('生产化 API 闭环', () => {
  let fixture: TestDatabase
  let app: INestApplication
  let baseUrl: string
  let demoToken = ''
  let adminToken = ''

  const start = async () => {
    const { AppModule } = await import('../src/app.module')
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}/api`
  }

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
    await start()
    demoToken = (await login('demo')).accessToken
    adminToken = (await login('admin')).accessToken
  })

  afterAll(async () => { if (app) await app.close(); fixture.cleanup() })

  test('普通用户被管理接口拒绝，管理员和 operator 均归入管理员角色', async () => {
    expect((await request('/admin/dashboard', {}, demoToken)).response.status).toBe(403)
    expect((await request('/admin/dashboard', {}, adminToken)).response.status).toBe(200)
    expect((await login('operator')).user.role).toBe('admin')
    const reconciliation = await request('/admin/student-domain/reconciliation', {}, adminToken)
    expect(reconciliation.response.status).toBe(200)
    expect(reconciliation.data.canSwitch).toBe(true)
    expect((await request('/admin/student-domain/read-mode', {}, adminToken)).data.mode).toBe('legacy')
    const readiness = await request('/admin/integration-readiness', {}, adminToken)
    expect(readiness.response.status).toBe(200)
    expect(readiness.data.channels.wechatPayment).toHaveProperty('missing')
    expect(JSON.stringify(readiness.data)).not.toContain(process.env.JWT_SECRET || '')
  })

  test('刷新令牌轮换、旧令牌吊销且 refresh token 不能冒充 access token', async () => {
    const first = await login('demo')
    const rotated = await request('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: first.refreshToken }) })
    expect(rotated.response.status).toBe(201)
    expect(rotated.data.refreshToken).not.toBe(first.refreshToken)
    expect((await request('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: first.refreshToken }) })).response.status).toBe(401)
    expect((await request('/auth/me', {}, rotated.data.refreshToken)).response.status).toBe(401)
    demoToken = rotated.data.accessToken
  })

  test('报名重复校验、在线支付、开票处理、退款和分页筛选通过接口闭环', async () => {
    const participant = { name: '接口学员', phone: '13900000002', company: '接口企业' }
    const created = await request('/orders', { method: 'POST', body: JSON.stringify({ courseId: 'course-1', participants: [{ data: participant }], paymentMethod: 'online' }) }, demoToken)
    expect(created.response.status).toBe(201)
    expect((await request('/orders', { method: 'POST', body: JSON.stringify({ courseId: 'course-1', participants: [{ data: participant }] }) }, demoToken)).response.status).toBe(400)
    const pending = await request(`/admin/orders?keyword=${created.data.id}&status=待支付&page=1&pageSize=10`, {}, adminToken)
    expect(pending.response.status).toBe(200)
    expect(pending.data.items.every((item: any) => item.status === '待支付')).toBe(true)
    expect((await request(`/orders/${created.data.id}/pay`, { method: 'POST', body: JSON.stringify({ method: 'online', channel: 'wechat' }) }, demoToken)).response.status).toBe(400)
    const intent = await request(`/orders/${created.data.id}/payment-intent`, { method: 'POST', body: JSON.stringify({ channel: 'wechat' }) }, demoToken)
    expect(intent.response.status).toBe(201)
    expect(intent.data.ready).toBe(false)
    const offline = await request('/orders', { method: 'POST', body: JSON.stringify({ courseId: 'course-1', participants: [{ data: { name: '开票学员', phone: '13900000012', company: '接口企业' } }], paymentMethod: 'offline' }) }, demoToken)
    const invoiceProof = new FormData(); invoiceProof.append('file', new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], { type: 'image/png' }), 'invoice-proof.png')
    expect((await request(`/orders/${offline.data.id}/payment-proof`, { method: 'POST', body: invoiceProof }, demoToken)).response.status).toBe(201)
    expect((await request(`/admin/orders/${offline.data.id}/review`, { method: 'POST', body: JSON.stringify({ approved: true, remark: '到账' }) }, adminToken)).response.status).toBe(201)
    const invoice = await request('/invoices', { method: 'POST', body: JSON.stringify({ title: '接口企业', taxNo: '91350200API', email: 'api@example.com', orderIds: [offline.data.id] }) }, demoToken)
    expect(invoice.response.status).toBe(201)
    expect((await request(`/admin/invoices/${invoice.data.id}/process`, { method: 'POST', body: JSON.stringify({ approved: true, invoiceNo: 'API-001' }) }, adminToken)).data.status).toBe('已开票')
    expect((await request(`/admin/orders/${offline.data.id}/refund`, { method: 'POST' }, adminToken)).data.status).toBe('已取消')
    const filtered = await request('/admin/orders?keyword=course-1&page=1&pageSize=1', {}, adminToken)
    expect(filtered.data.pageSize).toBe(1)
    expect(filtered.data.total).toBeGreaterThanOrEqual(1)
  })

  test('本地凭证校验、上传、受控访问和审核通过接口闭环', async () => {
    const created = await request('/orders', { method: 'POST', body: JSON.stringify({ courseId: 'course-1', participants: [{ data: { name: '凭证学员', phone: '13900000003', company: '凭证企业' } }], paymentMethod: 'offline' }) }, demoToken)
    const invalid = new FormData(); invalid.append('file', new Blob(['not-an-image'], { type: 'text/plain' }), 'proof.txt')
    expect((await request(`/orders/${created.data.id}/payment-proof`, { method: 'POST', body: invalid }, demoToken)).response.status).toBe(400)
    const form = new FormData(); form.append('file', new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], { type: 'image/png' }), 'proof.png')
    const uploaded = await request(`/orders/${created.data.id}/payment-proof`, { method: 'POST', body: form }, demoToken)
    expect(uploaded.response.status).toBe(201)
    expect(uploaded.data.file.status).toBe('pending')
    expect((await request(`/admin/orders/${created.data.id}/payment-proof`, {}, demoToken)).response.status).toBe(403)
    expect((await request(`/admin/orders/${created.data.id}/payment-proof/file`, {}, adminToken)).response.status).toBe(200)
    expect((await request(`/admin/orders/${created.data.id}/review`, { method: 'POST', body: JSON.stringify({ approved: true, remark: '到账' }) }, adminToken)).data.status).toBe('已支付')
  })

  test('重启应用后订单、发票、凭证和审计仍可查询', async () => {
    const before = await request('/admin/orders?page=1&pageSize=100', {}, adminToken)
    const invoiceBefore = await request('/admin/invoices?page=1&pageSize=100', {}, adminToken)
    const auditBefore = await request('/admin/audits', {}, adminToken)
    await app.close()
    await start()
    adminToken = (await login('admin')).accessToken
    const after = await request('/admin/orders?page=1&pageSize=100', {}, adminToken)
    const invoiceAfter = await request('/admin/invoices?page=1&pageSize=100', {}, adminToken)
    const auditAfter = await request('/admin/audits', {}, adminToken)
    const firstAuditAction = auditAfter.data.items[0]?.action
    if (firstAuditAction) {
      const filteredAudits = await request(`/admin/audits?action=${encodeURIComponent(firstAuditAction)}`, {}, adminToken)
      expect(filteredAudits.response.status).toBe(200)
      expect(filteredAudits.data.items.every((item: any) => item.action === firstAuditAction)).toBe(true)
    }
    expect(after.data.total).toBe(before.data.total)
    expect(invoiceAfter.data.total).toBe(invoiceBefore.data.total)
    expect(auditAfter.data.items.length).toBeGreaterThanOrEqual(auditBefore.data.items.length)
  })
})
