/// <reference path="./globals.d.ts" />
import { PrismaService } from '../src/prisma.service'
import { MvpService } from '../src/mvp/mvp.service'
import { createTestDatabase, TestDatabase } from './test-utils'

describe('P4 学员档案、关系、履历与合并 API', () => {
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

  test('分页档案、关系授权、匹配候选、履历查询和软合并可追溯', async () => {
    const first = await mvp.createOrder('u-demo', 'course-1', [{ name: '档案甲', phone: '13700000031', company: '档案企业', role: 'HR' }], 'offline')
    const second = await mvp.createOrder('u-demo', 'course-1', [{ name: '档案乙', phone: '13700000032', company: '档案企业', role: 'HR' }], 'offline')
    const student1 = await db.student.findFirstOrThrow({ where: { phoneNormalized: '13700000031' } })
    const student2 = await db.student.findFirstOrThrow({ where: { phoneNormalized: '13700000032' } })

    const page = await mvp.listStudentProfilesPage('档案', undefined, 1, 10)
    expect(page.total).toBe(2)
    expect(page.items.find((item) => item.id === student1.id)?.phone).toBe('137****0031')
    expect((await mvp.getStudentProfile(student1.id, true)).phone).toBe('13700000031')

    await mvp.updateStudentProfile(student1.id, { department: '人力资源', email: 'profile@example.com' }, 'admin')
    await mvp.grantStudentRelationship(student1.id, 'u-admin', '运营授权', 'admin')
    await mvp.setDefaultStudentRelationship(student1.id, 'u-admin', 'admin')
    expect((await mvp.listStudentRelationships(student1.id)).find((item) => item.userId === 'u-admin')?.isDefault).toBe(true)
    expect((await mvp.matchStudentCandidates({ phone: '137 0000 0031' })).items[0].id).toBe(student1.id)
    expect((await mvp.listStudentEnrollments(student1.id))[0].orderId).toBe(first.id)
    expect((await mvp.listEnrollmentRecords('档案甲', undefined, 1, 10)).items[0].studentId).toBe(student1.id)

    const before = await db.enrollment.count({ where: { studentId: student1.id } })
    const merged = await mvp.mergeStudents(student2.id, student1.id, 'admin')
    expect(merged.status).toBe('merged')
    expect((await db.student.findUniqueOrThrow({ where: { id: student2.id } })).mergedIntoId).toBe(student1.id)
    expect(await db.enrollment.count({ where: { studentId: student1.id } })).toBe(before + 1)
    await mvp.revokeStudentRelationship(student1.id, 'u-admin', 'admin')
    expect((await mvp.listStudentRelationships(student1.id)).find((item) => item.userId === 'u-admin')?.status).toBe('revoked')
    await expect(mvp.setStudentStatus(student1.id, 'inactive', 'admin')).resolves.toMatchObject({ status: 'inactive' })
    expect((await mvp.listStudentProfilesPage(undefined, 'inactive', 1, 10)).total).toBe(1)
    expect(second.id).toBeDefined()
  })

  test('P7 双读对账无差异后可切换新读并可回退旧读', async () => {
    const report = await mvp.reconcileStudentDomain()
    expect(report.canSwitch).toBe(true)
    expect(report.differences.total).toBe(0)
    expect(await mvp.getStudentReadMode()).toBe('legacy')
    await expect(mvp.setStudentReadMode('new', 'admin')).resolves.toMatchObject({ mode: 'new', rollbackAvailable: true })
    expect((await mvp.listCompatEnrollments()).length).toBeGreaterThanOrEqual(1)
    expect((await mvp.listCompatStudents()).length).toBeGreaterThanOrEqual(1)
    await expect(mvp.setStudentReadMode('legacy', 'admin')).resolves.toMatchObject({ mode: 'legacy', rollbackAvailable: true })
    expect(await mvp.getStudentReadMode()).toBe('legacy')
  })
})
