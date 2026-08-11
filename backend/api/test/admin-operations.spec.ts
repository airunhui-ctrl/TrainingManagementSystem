/// <reference path="./globals.d.ts" />
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AddressInfo } from 'node:net'
import { createTestDatabase, TestDatabase } from './test-utils'

describe('管理端非支付操作闭环', () => {
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
    return result.data
  }

  const expectSuccess = (result: { response: Response; data: any }) => {
    expect([200, 201, 204]).toContain(result.response.status)
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
    const address = app.getHttpServer().address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}/api`
    adminToken = (await login('admin')).accessToken
    demoToken = (await login('demo')).accessToken
  })

  afterAll(async () => { if (app) await app.close(); fixture.cleanup() })

  test('课程、Banner、报名模板的新增/编辑/删除操作可完成', async () => {
    const banner = expectSuccess(await request('/admin/banners', {
      method: 'POST',
      body: JSON.stringify({ id: 'BANNER-OPS-001', title: '操作闭环 Banner', courseId: 'course-1', sort: 99, enabled: true, startsAt: '2026-01-01', endsAt: '2026-12-31' }),
    }, adminToken))
    expect(banner.id).toBe('BANNER-OPS-001')
    expectSuccess(await request('/admin/banners', { method: 'POST', body: JSON.stringify({ ...banner, enabled: false }) }, adminToken))
    expectSuccess(await request('/admin/banners/BANNER-OPS-001', { method: 'DELETE' }, adminToken))

    const template = expectSuccess(await request('/admin/templates', {
      method: 'POST',
      body: JSON.stringify({ id: 'TPL-OPS-001', name: '操作闭环模板', fields: [{ key: 'name', label: '姓名', type: 'text', required: true }] }),
    }, adminToken))
    expect(template.id).toBe('TPL-OPS-001')
    expectSuccess(await request('/admin/templates/TPL-OPS-001', { method: 'PATCH', body: JSON.stringify({ name: '操作闭环模板（已编辑）', fields: [{ key: 'name', label: '姓名', type: 'text', required: true }, { key: 'phone', label: '手机号', type: 'phone', required: true }] }) }, adminToken))
    expectSuccess(await request('/admin/templates/TPL-OPS-001', { method: 'DELETE' }, adminToken))

    const course = expectSuccess(await request('/admin/courses', {
      method: 'POST',
      body: JSON.stringify({ id: 'COURSE-OPS-001', title: '操作闭环课程', subtitle: '', category: '01', date: '2026-12-01 09:00', location: '线上', instructor: '测试讲师', price: 100, originalPrice: 100, specialPrice: null, capacity: 20, enrolled: 0, status: '报名中', registrationDeadline: null, registrationTemplateId: 'tpl-basic', allowMultiParticipant: true, description: '测试课程' }),
    }, adminToken))
    expect(course.id).toBe('COURSE-OPS-001')
    expect(course.category).toBe('综合管理')
    expect(course.categoryCode).toBe('01')
    expectSuccess(await request('/admin/courses/COURSE-OPS-001', { method: 'PATCH', body: JSON.stringify({ title: '操作闭环课程（已编辑）', status: '已下架' }) }, adminToken))
    const refreshedCourseList = expectSuccess(await request('/admin/courses?keyword=COURSE-OPS-001&page=1&pageSize=20', {}, adminToken))
    expect(refreshedCourseList.items.some((item: any) => item.id === 'COURSE-OPS-001' && item.title === '操作闭环课程（已编辑）' && item.status === '已下架')).toBe(true)
    expect((await request('/admin/courses/COURSE-OPS-001', { method: 'PATCH', body: JSON.stringify({ enrolled: 1 }) }, adminToken)).response.status).toBe(400)
    expectSuccess(await request('/admin/courses/COURSE-OPS-001', { method: 'DELETE' }, adminToken))
    const deletedCourseList = expectSuccess(await request('/admin/courses?keyword=COURSE-OPS-001&page=1&pageSize=20', {}, adminToken))
    expect(deletedCourseList.items.some((item: any) => item.id === 'COURSE-OPS-001')).toBe(false)

    const auditResult = expectSuccess(await request('/admin/audits?keyword=%E6%93%8D%E4%BD%9C%E9%97%AD%E7%8E%AF%E8%AF%BE%E7%A8%8B', {}, adminToken))
    expect(auditResult.items.some((item: any) => item.action === '课程维护' && String(item.detail).includes('操作闭环课程'))).toBe(true)
    expect(auditResult.items.some((item: any) => item.action === '课程删除' && String(item.detail).includes('操作闭环课程'))).toBe(true)
  })

  test('课程分类使用数字字典下拉并兼容历史中文分类', async () => {
    const categories = expectSuccess(await request('/admin/course-categories', {}, adminToken))
    expect(categories.items.some((item: any) => item.code === '01' && item.label === '综合管理')).toBe(true)
    expect(categories.items.some((item: any) => item.code === '02' && item.label === '人才管理')).toBe(true)

    const course = expectSuccess(await request('/admin/courses', {
      method: 'POST',
      body: JSON.stringify({ id: 'COURSE-CAT-001', title: '字典分类课程', subtitle: '', category: '人才管理', date: '2026-12-01 09:00', location: '线上', instructor: '测试讲师', price: 100, originalPrice: 100, specialPrice: null, capacity: 20, enrolled: 0, status: '待发布', registrationDeadline: null, registrationTemplateId: 'tpl-basic', allowMultiParticipant: true, description: '字典分类测试' }),
    }, adminToken))
    expect(course.category).toBe('人才管理')
    expect(course.categoryCode).toBe('02')

    const list = expectSuccess(await request('/admin/courses?keyword=COURSE-CAT-001&page=1&pageSize=20', {}, adminToken))
    expect(list.items[0].categoryCode).toBe('02')
    const invalid = await request('/admin/courses', {
      method: 'POST',
      body: JSON.stringify({ id: 'COURSE-CAT-INVALID', title: '非法分类课程', subtitle: '', category: '不存在的分类', date: '2026-12-01 09:00', location: '线上', instructor: '测试讲师', price: 100, originalPrice: 100, specialPrice: null, capacity: 20, enrolled: 0, status: '待发布', registrationDeadline: null, registrationTemplateId: 'tpl-basic', allowMultiParticipant: true, description: '非法分类测试' }),
    }, adminToken)
    expect(invalid.response.status).toBe(400)
    expectSuccess(await request('/admin/courses/COURSE-CAT-001', { method: 'DELETE' }, adminToken))
  })

  test('报名模板已关联报名中课程时禁止修改', async () => {
    const templates = expectSuccess(await request('/admin/templates', {}, adminToken))
    const lockedTemplate = templates.items.find((item: any) => item.id === 'tpl-basic')
    expect(lockedTemplate?.locked).toBe(true)
    expect((await request('/admin/templates/tpl-basic', { method: 'PATCH', body: JSON.stringify({ name: '不应成功', fields: [{ key: 'name', label: '姓名', type: 'text', required: true }] }) }, adminToken)).response.status).toBe(400)

    const free = expectSuccess(await request('/admin/templates', {
      method: 'POST',
      body: JSON.stringify({ id: 'TPL-FREE-001', name: '未关联模板', fields: [{ key: 'name', label: '姓名', type: 'text', required: true }] }),
    }, adminToken))
    expect(free.id).toBe('TPL-FREE-001')
    expectSuccess(await request('/admin/templates/TPL-FREE-001', { method: 'PATCH', body: JSON.stringify({ name: '未关联模板（已编辑）', fields: [{ key: 'name', label: '姓名', type: 'text', required: true }] }) }, adminToken))
    expectSuccess(await request('/admin/templates/TPL-FREE-001', { method: 'DELETE' }, adminToken))
  })

  test('优惠规则、消息、系统配置和积分操作可完成并保留结果', async () => {
    const rule = expectSuccess(await request('/admin/discount-rules', { method: 'POST', body: JSON.stringify({ id: 'RULE-OPS-001', minPeople: 99, discountRate: 0.88, courseIds: ['course-1'], enabled: true }) }, adminToken))
    expect(rule.id).toBe('RULE-OPS-001')
    expectSuccess(await request('/admin/discount-rules', { method: 'POST', body: JSON.stringify({ id: 'RULE-OPS-001', minPeople: 99, discountRate: 0.88, courseIds: ['course-1'], enabled: false }) }, adminToken))
    expectSuccess(await request('/admin/discount-rules/RULE-OPS-001', { method: 'DELETE' }, adminToken))

    const message = expectSuccess(await request('/admin/messages', { method: 'POST', body: JSON.stringify({ title: '操作闭环消息', content: '仅用于接口回归', channel: '站内消息', targetUserIds: ['u-demo'], targetCourseIds: [], enabled: true }) }, adminToken))
    expect(message.id).toBeTruthy()
    expect((await request(`/admin/messages/${encodeURIComponent(message.id)}/enabled`, { method: 'POST', body: JSON.stringify({}) }, adminToken))).toMatchObject({ response: { status: 400 } })
    expectSuccess(await request(`/admin/messages/${encodeURIComponent(message.id)}`, { method: 'PATCH', body: JSON.stringify({ title: '操作闭环消息（已编辑）', content: '编辑后的回归内容', channel: '站内消息', targetUserIds: ['u-demo'], targetCourseIds: [], enabled: true }) }, adminToken))
    expectSuccess(await request(`/admin/messages/${encodeURIComponent(message.id)}/enabled`, { method: 'POST', body: JSON.stringify({ enabled: false }) }, adminToken))
    expectSuccess(await request(`/admin/messages/${encodeURIComponent(message.id)}`, { method: 'DELETE' }, adminToken))

    const config = expectSuccess(await request('/admin/configs/ops-test-key', { method: 'PUT', body: JSON.stringify({ value: 'ok', description: '操作回归配置' }) }, adminToken))
    expect(config.value).toBe('ok')
    const configs = expectSuccess(await request('/admin/configs', {}, adminToken))
    expect(configs.items.some((item: any) => item.key === 'ops-test-key' && item.value === 'ok')).toBe(true)

    const adjusted = expectSuccess(await request('/admin/points/u-demo/adjust', { method: 'POST', body: JSON.stringify({ points: 7, reason: '管理端操作回归' }) }, adminToken))
    expect(adjusted.userId).toBe('u-demo')
    const ledger = expectSuccess(await request('/admin/points/u-demo/ledger?page=1&pageSize=20', {}, adminToken))
    expect(ledger.items.some((item: any) => item.points === 7 && item.reason === '管理端操作回归')).toBe(true)
  })

  test('运营模块的冲突、已读幂等和非法输入均有明确门禁', async () => {
    const ruleA = expectSuccess(await request('/admin/discount-rules', { method: 'POST', body: JSON.stringify({ id: 'RULE-GUARD-A', minPeople: 8, discountRate: 0.9, courseIds: ['course-1'], enabled: true }) }, adminToken))
    const ruleB = expectSuccess(await request('/admin/discount-rules', { method: 'POST', body: JSON.stringify({ id: 'RULE-GUARD-B', minPeople: 8, discountRate: 0.85, courseIds: ['course-1'], enabled: true }) }, adminToken))
    expect(ruleB.conflicts).toContain(ruleA.id)
    expect((await request('/admin/discount-rules/RULE-GUARD-B', { method: 'DELETE' }, adminToken)).response.status).toBe(200)
    expect((await request('/admin/discount-rules/RULE-GUARD-A', { method: 'DELETE' }, adminToken)).response.status).toBe(200)

    const message = expectSuccess(await request('/admin/messages', {
      method: 'POST',
      body: JSON.stringify({ title: '已读幂等回归', content: '只用于运营状态回归', channel: '站内消息', targetUserIds: ['u-demo'], startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 60_000).toISOString(), enabled: true }),
    }, adminToken))
    const beforeRead = expectSuccess(await request('/messages', {}, demoToken))
    expect(beforeRead.items.find((item: any) => item.id === message.id)?.readAt).toBeNull()
    expect((await request(`/messages/${encodeURIComponent(message.id)}/read`, { method: 'POST' }, demoToken)).response.status).toBe(201)
    expect((await request(`/messages/${encodeURIComponent(message.id)}/read`, { method: 'POST' }, demoToken)).response.status).toBe(201)
    const afterRead = expectSuccess(await request('/messages', {}, demoToken))
    expect(afterRead.items.find((item: any) => item.id === message.id)?.readAt).toEqual(expect.any(String))
    const adminMessages = expectSuccess(await request('/admin/messages', {}, adminToken))
    expect(adminMessages.items.find((item: any) => item.id === message.id)?.readCount).toBe(1)
    expect((await request(`/admin/messages/${encodeURIComponent(message.id)}`, { method: 'DELETE' }, adminToken)).response.status).toBe(200)

    expect((await request('/admin/configs/invalid%20key', { method: 'PUT', body: JSON.stringify({ value: 'x' }) }, adminToken)).response.status).toBe(400)
    expect((await request('/admin/points/u-demo/adjust', { method: 'POST', body: JSON.stringify({ points: 0, reason: '不应写入' }) }, adminToken)).response.status).toBe(400)
  })

  test('消息启停并发请求只允许一次状态迁移和审计', async () => {
    const message = expectSuccess(await request('/admin/messages', {
      method: 'POST',
      body: JSON.stringify({ title: '消息并发启停回归', content: '只用于并发状态门禁', channel: '站内消息', targetUserIds: ['u-demo'], targetCourseIds: [], enabled: false }),
    }, adminToken))

    const results = await Promise.all([
      request(`/admin/messages/${encodeURIComponent(message.id)}/enabled`, { method: 'POST', body: JSON.stringify({ enabled: true }) }, adminToken),
      request(`/admin/messages/${encodeURIComponent(message.id)}/enabled`, { method: 'POST', body: JSON.stringify({ enabled: true }) }, adminToken),
    ])
    expect(results.map((result) => result.response.status).sort()).toEqual([201, 400])

    const messages = expectSuccess(await request('/admin/messages', {}, adminToken))
    expect(messages.items.find((item: any) => item.id === message.id)?.enabled).toBe(true)
    const audits = expectSuccess(await request(`/admin/audits?keyword=${encodeURIComponent(message.id)}`, {}, adminToken))
    expect(audits.items.filter((item: any) => item.action === '启用消息').length).toBe(1)

    expectSuccess(await request(`/admin/messages/${encodeURIComponent(message.id)}`, { method: 'DELETE' }, adminToken))
  })

  test('优惠规则和系统配置重复保存不重复写维护审计', async () => {
    const rulePayload = { id: 'RULE-IDEMP-001', minPeople: 77, discountRate: 0.91, courseIds: ['course-1'], enabled: false }
    const ruleAuditAction = encodeURIComponent('优惠规则维护')
    const ruleAuditsBefore = expectSuccess(await request(`/admin/audits?action=${ruleAuditAction}`, {}, adminToken))
    expectSuccess(await request('/admin/discount-rules', { method: 'POST', body: JSON.stringify(rulePayload) }, adminToken))
    const repeatedRules = await Promise.all([
      request('/admin/discount-rules', { method: 'POST', body: JSON.stringify(rulePayload) }, adminToken),
      request('/admin/discount-rules', { method: 'POST', body: JSON.stringify(rulePayload) }, adminToken),
    ])
    expect(repeatedRules.every((result) => [200, 201].includes(result.response.status))).toBe(true)
    const ruleAuditsAfter = expectSuccess(await request(`/admin/audits?action=${ruleAuditAction}`, {}, adminToken))
    expect(ruleAuditsAfter.items.length - ruleAuditsBefore.items.length).toBe(1)
    expectSuccess(await request('/admin/discount-rules/RULE-IDEMP-001', { method: 'DELETE' }, adminToken))

    const configPayload = { value: 'idempotent-value', description: '重复保存审计回归' }
    const configAuditAction = encodeURIComponent('系统配置维护')
    const configAuditsBefore = expectSuccess(await request(`/admin/audits?action=${configAuditAction}`, {}, adminToken))
    expectSuccess(await request('/admin/configs/idempotent-test-key', { method: 'PUT', body: JSON.stringify(configPayload) }, adminToken))
    const repeatedConfigs = await Promise.all([
      request('/admin/configs/idempotent-test-key', { method: 'PUT', body: JSON.stringify(configPayload) }, adminToken),
      request('/admin/configs/idempotent-test-key', { method: 'PUT', body: JSON.stringify(configPayload) }, adminToken),
    ])
    expect(repeatedConfigs.every((result) => result.response.status === 200)).toBe(true)
    const configAuditsAfter = expectSuccess(await request(`/admin/audits?action=${configAuditAction}`, {}, adminToken))
    expect(configAuditsAfter.items.length - configAuditsBefore.items.length).toBe(1)
  })

  test('用户启停/密码重置和反馈回复均受状态门禁保护', async () => {
    expect((await request('/admin/users/u-demo/enabled', { method: 'POST', body: JSON.stringify({}) }, adminToken))).toMatchObject({ response: { status: 400 } })
    const tokenBeforeDisable = demoToken
    expectSuccess(await request('/admin/users/u-demo/enabled', { method: 'POST', body: JSON.stringify({ enabled: false }) }, adminToken))
    expect((await request('/auth/me', {}, tokenBeforeDisable)).response.status).toBe(401)
    expectSuccess(await request('/admin/users/u-demo/enabled', { method: 'POST', body: JSON.stringify({ enabled: true }) }, adminToken))
    expect((await request('/auth/me', {}, tokenBeforeDisable)).response.status).toBe(401)
    demoToken = (await login('demo')).accessToken
    const reset = expectSuccess(await request('/admin/users/u-demo/reset-password', { method: 'POST' }, adminToken))
    expect(reset.username).toBe('demo')
    expect(reset.resetPassword).toMatch(/^Temp-/)
    expect((await request('/auth/me', {}, demoToken)).response.status).toBe(401)
    demoToken = (await request('/auth/login', { method: 'POST', body: JSON.stringify({ username: 'demo', password: reset.resetPassword }) })).data.accessToken

    const feedback = expectSuccess(await request('/feedback', { method: 'POST', body: JSON.stringify({ category: '操作回归', content: '反馈处理闭环验证' }) }, demoToken))
    const resolved = expectSuccess(await request(`/admin/feedbacks/${encodeURIComponent(feedback.id)}/resolve`, { method: 'POST', body: JSON.stringify({ reply: '已完成回归验证' }) }, adminToken))
    expect(resolved.status).toBe('已处理')
    const repeated = await request(`/admin/feedbacks/${encodeURIComponent(feedback.id)}/resolve`, { method: 'POST', body: JSON.stringify({ reply: '不应重复处理' }) }, adminToken)
    expect(repeated.response.status).toBe(400)
  })

  test('普通用户不能访问管理接口，待发布课程不出现在公共课程列表', async () => {
    const denied = await request('/admin/courses', {}, demoToken)
    expect(denied.response.status).toBe(403)

    const hidden = expectSuccess(await request('/admin/courses', {
      method: 'POST',
      body: JSON.stringify({ id: 'COURSE-HIDDEN-OPS', title: 'Hidden course permission check', subtitle: '', category: '01', date: '2026-12-01 09:00', location: 'online', instructor: 'tester', price: 100, originalPrice: 100, specialPrice: null, capacity: 20, enrolled: 0, status: '待发布', registrationDeadline: null, registrationTemplateId: 'tpl-basic', allowMultiParticipant: true, description: 'hidden course' }),
    }, adminToken))
    expect(hidden.status).toBe('待发布')

    const publicList = expectSuccess(await request('/courses?keyword=Hidden%20course%20permission%20check'))
    expect(publicList.items.some((item: any) => item.id === 'COURSE-HIDDEN-OPS')).toBe(false)

    const adminList = expectSuccess(await request('/admin/courses?keyword=Hidden%20course%20permission%20check', {}, adminToken))
    expect(adminList.items.some((item: any) => item.id === 'COURSE-HIDDEN-OPS')).toBe(true)
    expectSuccess(await request('/admin/courses/COURSE-HIDDEN-OPS', { method: 'DELETE' }, adminToken))
  })

  test('用户、学员档案和反馈列表支持按 ID/用户 ID 刷新查询', async () => {
    const userResult = expectSuccess(await request('/admin/users?keyword=u-demo&page=1&pageSize=20', {}, adminToken))
    expect(userResult.items.some((item: any) => item.id === 'u-demo')).toBe(true)

    const student = expectSuccess(await request('/students', {
      method: 'POST',
      body: JSON.stringify({ name: '列表搜索学员', phone: '13800000098', company: '列表搜索企业' }),
    }, demoToken))
    const studentResult = expectSuccess(await request(`/admin/student-profiles?keyword=${encodeURIComponent(student.id)}&page=1&pageSize=20`, {}, adminToken))
    expect(studentResult.items.some((item: any) => item.id === student.id)).toBe(true)

    const feedback = expectSuccess(await request('/feedback', { method: 'POST', body: JSON.stringify({ category: '列表搜索', content: '反馈 ID 和用户 ID 查询验证' }) }, demoToken))
    const feedbackById = expectSuccess(await request(`/admin/feedbacks?keyword=${encodeURIComponent(feedback.id)}&page=1&pageSize=20`, {}, adminToken))
    expect(feedbackById.items.some((item: any) => item.id === feedback.id)).toBe(true)
    const feedbackByUser = expectSuccess(await request('/admin/feedbacks?keyword=u-demo&page=1&pageSize=20', {}, adminToken))
    expect(feedbackByUser.items.some((item: any) => item.id === feedback.id && item.userId === 'u-demo')).toBe(true)
  })

  test('编辑接口对不存在资源返回 404，反馈空回复返回 400', async () => {
    expect((await request('/admin/courses/COURSE-NOT-FOUND', { method: 'PATCH', body: JSON.stringify({ title: '不应创建' }) }, adminToken)).response.status).toBe(404)
    expect((await request('/admin/templates/TPL-NOT-FOUND', { method: 'PATCH', body: JSON.stringify({ name: '不应创建', fields: [{ key: 'name', label: '姓名', type: 'text', required: true }] }) }, adminToken)).response.status).toBe(404)
    expect((await request('/admin/messages/MSG-NOT-FOUND', { method: 'PATCH', body: JSON.stringify({ title: '不应创建', content: '不应创建', channel: '站内消息' }) }, adminToken)).response.status).toBe(404)
    const feedback = expectSuccess(await request('/feedback', { method: 'POST', body: JSON.stringify({ category: '边界回归', content: '空回复回归' }) }, demoToken))
    expect((await request(`/admin/feedbacks/${encodeURIComponent(feedback.id)}/resolve`, { method: 'POST', body: JSON.stringify({ reply: null }) }, adminToken)).response.status).toBe(400)
  })
})
