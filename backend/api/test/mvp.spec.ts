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
  })

  test('阶梯优惠、重复报名、支付、开票和退款形成稳定状态流转', async () => {
    expect((await mvp.quote('course-1', 3)).discountRate).toBe(0.2)
    const participant = { name: '测试学员', phone: '13900000001', company: '测试企业' }
    const order = await mvp.createOrder('u-demo', 'course-1', [participant], 'online')
    await expect(mvp.createOrder('u-demo', 'course-1', [participant], 'online')).rejects.toThrow('已报名本课程')
    expect((await mvp.payOrder('u-demo', order.id, 'online', undefined, 'alipay')).status).toBe('已支付')
    const invoice = await mvp.createInvoice('u-demo', { title: '测试企业', taxNo: '91350200TEST', email: 'test@example.com', orderIds: [order.id] })
    expect(invoice.status).toBe('待处理')
    expect((await mvp.processInvoice(invoice.id, '已开票', 'TEST-001')).status).toBe('已开票')
    expect((await mvp.refundOrder(order.id)).status).toBe('已取消')
  })

  test('列表分页和关键词筛选由数据库执行', async () => {
    const result = await mvp.listCoursesPage('结构化面试', undefined, 1, 1)
    expect(result.total).toBe(1)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('course-1')
  })
})
