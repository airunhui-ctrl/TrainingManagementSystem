/// <reference path="./globals.d.ts" />
import { PrismaService } from '../src/prisma.service'
import { MvpService } from '../src/mvp/mvp.service'
import { createTestDatabase, TestDatabase } from './test-utils'

describe('P10 学员档案真实业务场景', () => {
  let fixture: TestDatabase
  let db: PrismaService
  let mvp: MvpService

  beforeAll(async () => {
    fixture = createTestDatabase()
    db = new PrismaService()
    await db.$connect()
    mvp = new MvpService(db)
  })

  afterAll(async () => {
    await db.$disconnect()
    fixture.cleanup()
  })

  test('一个账号可以替多个学员报名，并可切换默认报名人', async () => {
    const participants = [
      { name: '多人报名甲', phone: '13500000041', company: '多人企业', role: '负责人' },
      { name: '多人报名乙', phone: '13500000042', company: '多人企业', role: '学员' },
    ]
    const order = await mvp.createOrder('u-demo', 'course-1', participants, 'offline')
    expect(order.participantCount).toBe(2)

    const students = await db.student.findMany({ where: { phoneNormalized: { in: participants.map(item => item.phone) } } })
    expect(students).toHaveLength(2)
    expect(await db.enrollment.count({ where: { orderId: order.id } })).toBe(2)

    const accountStudents = (await mvp.listAccountStudents('u-demo')).items
    expect(accountStudents.filter(item => students.some(student => student.id === item.id))).toHaveLength(2)
    await mvp.setAccountDefaultStudent('u-demo', students[1].id)
    expect((await mvp.listAccountStudents('u-demo')).items[0].id).toBe(students[1].id)
  })

  test('模板必填字段校验失败时不留下订单或学员半成品', async () => {
    const before = { orders: await db.order.count(), students: await db.student.count(), enrollments: await db.enrollment.count() }
    await expect(mvp.createOrder('u-demo', 'course-2', [{ name: '缺字段学员', phone: '13500000043', company: '缺字段企业' }], 'offline')).rejects.toThrow('企业规模')
    expect(await db.order.count()).toBe(before.orders)
    expect(await db.student.count()).toBe(before.students)
    expect(await db.enrollment.count()).toBe(before.enrollments)
  })
})
