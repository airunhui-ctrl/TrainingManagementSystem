/// <reference path="./globals.d.ts" />
import { PrismaService } from '../src/prisma.service'
import { MvpService } from '../src/mvp/mvp.service'
import { createTestDatabase, TestDatabase } from './test-utils'

describe('Prisma 业务仓储', () => {
  let fixture: TestDatabase
  let db: PrismaService
  let mvp: MvpService

  beforeAll(async () => {
    fixture = createTestDatabase()
    db = new PrismaService()
    await db.$connect()
    mvp = new MvpService(db)
  })

  afterAll(async () => { await db.$disconnect(); fixture.cleanup() })

  test('迁移与种子建立两角色及结构化业务表', async () => {
    expect(await db.user.count()).toBe(3)
    expect((await db.user.findUnique({ where: { username: 'demo' } }))?.role).toBe('user')
    expect((await db.user.findUnique({ where: { username: 'operator' } }))?.role).toBe('admin')
    expect(await db.course.count()).toBe(6)
    expect(await db.registrationTemplate.count()).toBe(2)
    expect(await db.student.count()).toBe(0)
    expect(await db.accountStudent.count()).toBe(0)
    expect(await db.registrationTemplateVersion.count()).toBe(0)
    expect(await db.enrollment.count()).toBe(0)
  })

  test('阶梯优惠、重复报名、支付、开票和退款形成稳定状态流转', async () => {
    expect((await mvp.quote('course-1', 3)).discountRate).toBe(0.2)
    const participant = { name: '测试学员', phone: '13900000001', company: '测试企业' }
    const order = await mvp.createOrder('u-demo', 'course-1', [participant], 'online')
    await expect(mvp.createOrder('u-demo', 'course-1', [participant], 'online')).rejects.toThrow('已报名本课程')
    await mvp.createPaymentIntent('u-demo', order.id, 'alipay')
    await expect(mvp.payOrder('u-demo', order.id, 'online', undefined, 'alipay')).rejects.toThrow('不能由客户端直接确认')
    expect((await mvp.confirmExternalPayment({ channel: 'alipay', outTradeNo: order.id, providerTradeNo: 'ali-test-1', amount: order.amount, payload: { trade_status: 'TRADE_SUCCESS' } })).status).toBe('已支付')
    const invoice = await mvp.createInvoice('u-demo', { title: '测试企业', taxNo: '91350200TEST', email: 'test@example.com', orderIds: [order.id] })
    expect(invoice.status).toBe('待处理')
    expect((await mvp.processInvoice(invoice.id, '已开票', 'TEST-001')).status).toBe('已开票')
    expect((await mvp.refundOrder(order.id)).status).toBe('已取消')
  })

  test('P3 下单兼容 studentId，事务双写并在越权时整体回滚', async () => {
    const participant = { name: '可复用学员', phone: '13800000021', company: '双写企业', companySize: '50-200人' }
    const first = await mvp.createOrder('u-demo', 'course-2', [participant], 'offline')
    const student = await db.student.findFirst({ where: { phoneNormalized: participant.phone } })
    expect(student?.name).toBe(participant.name)
    expect(await db.accountStudent.count({ where: { userId: 'u-demo', studentId: student!.id, status: 'active' } })).toBe(1)
    expect(await db.enrollment.count({ where: { orderId: first.id, studentId: student!.id } })).toBe(1)
    expect((await db.order.findUnique({ where: { id: first.id } }))?.participants).not.toContain('studentId')

    const reused = await mvp.createOrder('u-demo', 'course-1', [{ ...participant, studentId: student!.id }], 'online')
    expect(await db.enrollment.count({ where: { orderId: reused.id, studentId: student!.id } })).toBe(1)

    const beforeOrders = await db.order.count()
    await expect(mvp.createOrder('u-admin', 'course-2', [{ name: participant.name, phone: '13800000022', company: '越权企业', companySize: '50-200人', studentId: student!.id }], 'online')).rejects.toThrow('不属于当前账号')
    expect(await db.order.count()).toBe(beforeOrders)
    expect(await db.enrollment.count({ where: { studentId: student!.id } })).toBe(2)
  })

  test('列表分页和关键词筛选由数据库执行', async () => {
    const result = await mvp.listCoursesPage('结构化面试', undefined, 1, 1)
    expect(result.total).toBe(1)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('course-1')
  })

  test('个人微信/支付宝收款码可配置并由公开支付设置返回', async () => {
    const uploaded = await mvp.uploadPaymentQr('wechat', { originalname: 'wechat.png', mimetype: 'image/png', size: 4, buffer: Buffer.from('test') }, 'admin')
    expect(uploaded.url).toMatch(/^\/api\/media\/payment-settings\/payment-wechat-/)
    const settings = await mvp.getPublicPaymentSettings()
    expect(settings.wechatQrImage).toBe(uploaded.url)
    const file = await mvp.readPaymentSettingImage(uploaded.name)
    expect(file.mimeType).toBe('image/png')
    await expect(mvp.uploadPaymentQr('alipay', { originalname: 'alipay.exe', mimetype: 'application/octet-stream', size: 4, buffer: Buffer.from('test') }, 'admin')).rejects.toThrow('仅支持')
  })
})
