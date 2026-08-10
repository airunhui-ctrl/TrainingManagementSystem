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
    const enrollmentPage = await mvp.listEnrollmentRecords('档案甲', undefined, 1, 10)
    expect(enrollmentPage.items[0].studentId).toBe(student1.id)
    expect(enrollmentPage.items[0].phone).toBe('137****0031')
    expect(enrollmentPage.items[0].formPayload).toBeUndefined()
    const enrollmentDetail = await mvp.getEnrollmentRecord(enrollmentPage.items[0].id, true)
    expect(enrollmentDetail.phone).toBe('13700000031')
    expect(enrollmentDetail.formPayload).toMatchObject({ name: '档案甲', phone: '13700000031' })
    await mvp.getEnrollmentRecord(enrollmentPage.items[0].id, true, 'admin')
    await mvp.getStudentProfile(student1.id, true, 'admin')
    const detailAuditActions = (await db.auditLog.findMany({ where: { action: { in: ['查看报名履历', '查看学员档案'] } } })).map(item => item.action)
    expect(detailAuditActions).toEqual(expect.arrayContaining(['查看报名履历', '查看学员档案']))

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
    const newModeEnrollments = await mvp.listCompatEnrollments()
    expect(newModeEnrollments.length).toBeGreaterThanOrEqual(1)
    expect(newModeEnrollments.every((item) => Boolean(item.paymentStatus))).toBe(true)
    expect((await mvp.listCompatStudents()).length).toBeGreaterThanOrEqual(1)
    await expect(mvp.setStudentReadMode('legacy', 'admin')).resolves.toMatchObject({ mode: 'legacy', rollbackAvailable: true })
    expect(await mvp.getStudentReadMode()).toBe('legacy')
  })

  test('学员档案导出按筛选、上限和脱敏策略返回并留痕', async () => {
    await mvp.createOrder('u-demo', 'course-2', [{ name: '导出甲', phone: '13600000041', company: '导出企业', companySize: '50-200人' }], 'offline')
    await mvp.createOrder('u-demo', 'course-2', [{ name: '导出乙', phone: '13600000042', company: '导出企业', companySize: '50-200人' }], 'offline')
    const masked = await mvp.exportStudentProfiles('导出', undefined, false, 'admin', 1)
    expect(masked.total).toBe(2)
    expect(masked.items).toHaveLength(1)
    expect(masked.truncated).toBe(true)
    expect(masked.sensitiveFieldsMasked).toBe(true)
    expect(masked.items[0].phone).toMatch(/^136\*{4}\d{4}$/)

    const revealed = await mvp.exportStudentProfiles('导出甲', undefined, true, 'admin', 1000)
    expect(revealed.total).toBe(1)
    expect(revealed.sensitiveFieldsMasked).toBe(false)
    expect(revealed.items[0].phone).toBe('13600000041')
    expect((await db.auditLog.findMany({ where: { action: '导出学员档案' }, orderBy: { createdAt: 'desc' }, take: 2 })).some(item => item.detail.includes('脱敏'))).toBe(true)
  })

  test('学员档案更新和合并目标具备后端边界保护', async () => {
    await mvp.createOrder('u-demo', 'course-1', [{ name: '边界学员甲', phone: '13900000071', company: '边界企业' }], 'offline')
    await mvp.createOrder('u-demo', 'course-1', [{ name: '边界学员乙', phone: '13900000072', company: '边界企业' }], 'offline')
    const source = await db.student.findFirstOrThrow({ where: { phoneNormalized: '13900000071' } })
    const target = await db.student.findFirstOrThrow({ where: { phoneNormalized: '13900000072' } })

    await expect(mvp.updateStudentProfile(source.id, { name: ' ' }, 'admin')).rejects.toThrow('姓名不能为空')
    await expect(mvp.updateStudentProfile(source.id, { phone: 'not-a-phone' }, 'admin')).rejects.toThrow('手机号格式不正确')
    await expect(mvp.updateStudentProfile(source.id, { email: 'not-an-email' }, 'admin')).rejects.toThrow('邮箱格式不正确')

    await mvp.mergeStudents(source.id, target.id, 'admin')
    await expect(mvp.updateStudentProfile(source.id, { department: '不应更新' }, 'admin')).rejects.toThrow('已合并')
    await expect(mvp.setStudentStatus(source.id, 'active', 'admin')).rejects.toThrow('已合并')
    await expect(mvp.grantStudentRelationship(source.id, 'u-admin', '代理报名', 'admin')).rejects.toThrow('已合并')

    await mvp.createOrder('u-demo', 'course-1', [{ name: '边界学员丙', phone: '13900000073', company: '边界企业' }], 'offline')
    const third = await db.student.findFirstOrThrow({ where: { phoneNormalized: '13900000073' } })
    await expect(mvp.mergeStudents(third.id, source.id, 'admin')).rejects.toThrow('已合并的目标')
  })

  test('账号只能操作自己被授权的学员档案', async () => {
    const created = await mvp.createAccountStudent('u-demo', { name: '越权边界学员', phone: '13900000081', company: '权限企业' })
    const studentId = String(created.id)
    expect((await mvp.listAccountStudents('u-demo')).items.some(item => item.id === studentId)).toBe(true)
    expect((await mvp.listAccountStudents('u-admin')).items.some(item => item.id === studentId)).toBe(false)
    await expect(mvp.updateAccountStudent('u-admin', studentId, { company: '不应修改' })).rejects.toThrow('不在当前账号授权范围内')
    await expect(mvp.setAccountDefaultStudent('u-admin', studentId)).rejects.toThrow('不在当前账号授权范围内')
    await expect(mvp.revokeAccountStudent('u-admin', studentId)).rejects.toThrow('账号与学员关系不存在')
  })

  test('我的学员新增入口拒绝非法邮箱并规范化手机号', async () => {
    await expect(mvp.createAccountStudent('u-demo', { name: '非法邮箱学员', phone: '13800000091', email: 'not-an-email' })).rejects.toThrow('邮箱格式不正确')
    const created = await mvp.createAccountStudent('u-demo', { name: '规范化学员', phone: '138 0000 0092', email: 'Student@Example.com' })
    expect(created.phone).toBe('13800000092')
    expect(created.email).toBe('student@example.com')
  })
})
