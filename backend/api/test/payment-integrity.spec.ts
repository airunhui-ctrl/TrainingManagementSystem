/// <reference path="./globals.d.ts" />
import { PrismaService } from '../src/prisma.service'
import { MvpService } from '../src/mvp/mvp.service'
import { createTestDatabase, TestDatabase } from './test-utils'

describe('在线支付必须经过渠道回调确认', () => {
  let fixture: TestDatabase
  let db: PrismaService
  let mvp: MvpService

  beforeAll(async () => {
    fixture = createTestDatabase()
    process.env.NODE_ENV = 'test'
    process.env.PAYMENT_ADAPTER = 'fake'
    db = new PrismaService()
    await db.$connect()
    mvp = new MvpService(db)
  })

  afterAll(async () => { await db.$disconnect(); fixture.cleanup() })

  test('客户端不能直接把待支付订单改成已支付，已验证回调可幂等入账', async () => {
    const order = await mvp.createOrder('u-demo', 'course-1', [{ name: '支付校验学员', phone: '13600000071', company: '支付校验企业' }], 'online')
    await mvp.createPaymentIntent('u-demo', order.id, 'wechat')
    await expect(mvp.payOrder('u-demo', order.id, 'online', undefined, 'wechat')).rejects.toThrow('不能由客户端直接确认')
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('待支付')

    const paid = await mvp.confirmExternalPayment({ channel: 'wechat', outTradeNo: order.id, providerTradeNo: 'wx-trade-71', amount: order.amount, payload: { trade_state: 'SUCCESS' } })
    expect(paid.status).toBe('已支付')
    const repeated = await mvp.confirmExternalPayment({ channel: 'wechat', outTradeNo: order.id, providerTradeNo: 'wx-trade-71', amount: order.amount, payload: { trade_state: 'SUCCESS' } })
    expect(repeated.status).toBe('已支付')
    expect((await db.paymentTransaction.findUniqueOrThrow({ where: { outTradeNo: order.id } })).status).toBe('paid')
  })
})
