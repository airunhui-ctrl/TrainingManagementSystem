/// <reference path="./globals.d.ts" />
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AddressInfo } from 'node:net'
import { createTestDatabase, TestDatabase } from './test-utils'

describe('P1 非支付写操作闭环', () => {
  let fixture: TestDatabase
  let app: INestApplication
  let baseUrl = ''
  let adminToken = ''
  let demoToken = ''

  const request = async (path: string, init: RequestInit = {}, token?: string) => {
    const headers = new Headers(init.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers })
    const contentType = response.headers.get('content-type') || ''
    const data = contentType.includes('json') ? await response.json() : await response.text()
    return { response, data: data as any }
  }

  const login = async (username: string) => {
    const result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password: '123456' }) })
    expect(result.response.status).toBe(201)
    return result.data.accessToken as string
  }

  const createOfflineOrder = async (token: string, phone: string) => {
    const result = await request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        courseId: 'course-1',
        paymentMethod: 'offline',
        participants: [{ data: { name: `P1 测试学员 ${phone.slice(-4)}`, phone, company: 'P1 测试企业', role: '学员' } }],
      }),
    }, token)
    expect(result.response.status).toBe(201)
    return result.data
  }

  const uploadProof = async (orderId: string, token: string, fileName = 'proof.png') => {
    const form = new FormData()
    form.append('file', new Blob([Buffer.from('p1-payment-proof')], { type: 'image/png' }), fileName)
    return request(`/orders/${encodeURIComponent(orderId)}/payment-proof`, { method: 'POST', body: form }, token)
  }

  const uploadInvoice = async (invoiceId: string, fileName = 'invoice.pdf') => {
    const form = new FormData()
    form.append('file', new Blob([Buffer.from('%PDF-1.4 P1 invoice')], { type: 'application/pdf' }), fileName)
    return request(`/admin/invoices/${encodeURIComponent(invoiceId)}/file`, { method: 'POST', body: form }, adminToken)
  }

  beforeAll(async () => {
    fixture = createTestDatabase()
    const { AppModule } = await import('../src/app.module')
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}/api`
    adminToken = await login('admin')
    demoToken = await login('demo')
  })

  afterAll(async () => {
    if (app) await app.close()
    fixture.cleanup()
  })

  test('订单取消、线下凭证审核和重复操作均有状态门禁', async () => {
    const cancellable = await createOfflineOrder(demoToken, '13900000031')
    expect((await request(`/orders/${cancellable.id}/cancel`, { method: 'POST' }, demoToken)).response.status).toBe(201)
    expect((await request(`/orders/${cancellable.id}/cancel`, { method: 'POST' }, demoToken)).response.status).toBe(400)

    const order = await createOfflineOrder(demoToken, '13900000032')
    const uploaded = await uploadProof(order.id, demoToken)
    expect(uploaded.response.status).toBe(201)
    expect(uploaded.data.order.status).toBe('待审核')
    expect((await uploadProof(order.id, demoToken, 'duplicate.png')).response.status).toBe(400)

    const rejected = await request(`/admin/orders/${encodeURIComponent(order.id)}/review`, { method: 'POST', body: JSON.stringify({ approved: false, remark: '凭证不清晰，请重新上传' }) }, adminToken)
    expect(rejected.response.status).toBe(201)
    expect(rejected.data.status).toBe('待支付')
    expect(rejected.data.paymentProofStatus).toBe('rejected')
    expect(rejected.data.paymentProofRemark).toContain('不清晰')

    expect((await uploadProof(order.id, demoToken, 'replacement.png')).response.status).toBe(201)
    const approved = await request(`/admin/orders/${encodeURIComponent(order.id)}/review`, { method: 'POST', body: JSON.stringify({ approved: true, remark: '凭证已核验' }) }, adminToken)
    expect(approved.response.status).toBe(201)
    expect(approved.data.status).toBe('已支付')
    expect((await request(`/admin/orders/${encodeURIComponent(order.id)}/review`, { method: 'POST', body: JSON.stringify({ approved: true }) }, adminToken)).response.status).toBe(400)

    const audits = await request('/admin/audits?keyword=%E7%BA%BF%E4%B8%8B%E6%94%AF%E4%BB%98%E5%AE%A1%E6%A0%B8', {}, adminToken)
    expect(audits.response.status).toBe(200)
    expect(audits.data.items.some((item: any) => item.action === '线下支付审核通过' && String(item.detail).includes(order.id))).toBe(true)

    const enrollmentRecords = await request(`/admin/enrollment-records?keyword=${encodeURIComponent(order.id)}&page=1&pageSize=20`, {}, adminToken)
    expect(enrollmentRecords.response.status).toBe(200)
    expect(enrollmentRecords.data.items.some((item: any) => item.orderId === order.id)).toBe(true)
    const enrollmentId = enrollmentRecords.data.items.find((item: any) => item.orderId === order.id)?.id
    expect(enrollmentId).toBeTruthy()
    expect((await request(`/admin/enrollment-records/${encodeURIComponent(enrollmentId)}`, {}, adminToken)).response.status).toBe(200)
  })

  test('开票通过/驳回、重新申请和重复处理均受状态门禁保护', async () => {
    const paidOrder = await createOfflineOrder(demoToken, '13900000033')
    expect((await uploadProof(paidOrder.id, demoToken)).response.status).toBe(201)
    expect((await request(`/admin/orders/${encodeURIComponent(paidOrder.id)}/review`, { method: 'POST', body: JSON.stringify({ approved: true, remark: '到账' }) }, adminToken)).response.status).toBe(201)

    const invoice = await request('/invoices', { method: 'POST', body: JSON.stringify({ title: 'P1 测试企业', taxNo: '91350000P1TEST01', email: 'p1@example.com', orderIds: [paidOrder.id] }) }, demoToken)
    expect(invoice.response.status).toBe(201)
    expect((await request(`/admin/invoices/${invoice.data.id}/process`, { method: 'POST', body: JSON.stringify({ approved: true }) }, adminToken)).response.status).toBe(400)
    const processed = await request(`/admin/invoices/${invoice.data.id}/process`, { method: 'POST', body: JSON.stringify({ approved: true, invoiceNo: 'P1-INV-0001' }) }, adminToken)
    expect(processed.response.status).toBe(201)
    expect(processed.data.status).toBe('已开票')
    const uploadedInvoice = await uploadInvoice(invoice.data.id)
    expect(uploadedInvoice.response.status).toBe(201)
    expect(uploadedInvoice.data.invoiceFileStatus).toBe('已上传')
    expect((await uploadInvoice(invoice.data.id, 'duplicate-invoice.pdf')).response.status).toBe(400)
    expect((await request(`/admin/invoices/${encodeURIComponent(invoice.data.id)}/file`, {}, adminToken)).response.status).toBe(200)
    expect((await request(`/admin/invoices/${invoice.data.id}/process`, { method: 'POST', body: JSON.stringify({ approved: false, rejectReason: '不应重复处理' }) }, adminToken)).response.status).toBe(400)

    const rejectedOrder = await createOfflineOrder(demoToken, '13900000034')
    expect((await uploadProof(rejectedOrder.id, demoToken)).response.status).toBe(201)
    expect((await request(`/admin/orders/${encodeURIComponent(rejectedOrder.id)}/review`, { method: 'POST', body: JSON.stringify({ approved: true }) }, adminToken)).response.status).toBe(201)
    const rejectedInvoice = await request('/invoices', { method: 'POST', body: JSON.stringify({ title: 'P1 可重申请企业', taxNo: '91350000P1TEST02', email: 'p1-retry@example.com', orderIds: [rejectedOrder.id] }) }, demoToken)
    expect(rejectedInvoice.response.status).toBe(201)
    expect((await request(`/admin/invoices/${rejectedInvoice.data.id}/process`, { method: 'POST', body: JSON.stringify({ approved: false, rejectReason: '资料需要补充' }) }, adminToken)).response.status).toBe(201)
    const retry = await request('/invoices', { method: 'POST', body: JSON.stringify({ title: 'P1 可重申请企业', taxNo: '91350000P1TEST02', email: 'p1-retry@example.com', orderIds: [rejectedOrder.id] }) }, demoToken)
    expect(retry.response.status).toBe(201)

    const closeOrder = await createOfflineOrder(demoToken, '13900000035')
    const closed = await request(`/admin/orders/${encodeURIComponent(closeOrder.id)}/close`, { method: 'POST' }, adminToken)
    expect(closed.response.status).toBe(201)
    expect(closed.data.status).toBe('已取消')
    expect((await request(`/admin/orders/${encodeURIComponent(closeOrder.id)}/close`, { method: 'POST' }, adminToken)).response.status).toBe(400)

    const refundOrder = await createOfflineOrder(demoToken, '13900000036')
    expect((await uploadProof(refundOrder.id, demoToken)).response.status).toBe(201)
    expect((await request(`/admin/orders/${encodeURIComponent(refundOrder.id)}/review`, { method: 'POST', body: JSON.stringify({ approved: true }) }, adminToken)).response.status).toBe(201)
    const refunded = await request(`/admin/orders/${encodeURIComponent(refundOrder.id)}/refund`, { method: 'POST' }, adminToken)
    expect(refunded.response.status).toBe(201)
    expect(refunded.data.status).toBe('已取消')
    expect((await request(`/admin/orders/${encodeURIComponent(refundOrder.id)}/refund`, { method: 'POST' }, adminToken)).response.status).toBe(400)
  })
})
