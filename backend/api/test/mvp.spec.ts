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
    expect((await db.user.findUnique({ where: { username: 'operator' } }))?.role).toBe('operator')
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
    expect((await mvp.listInvoices('u-demo')).find((item) => item.id === invoice.id)?.invoiceFileStatus).toBe('待上传')
    await expect(mvp.processInvoice(invoice.id, '已开票', 'TEST-002')).rejects.toThrow('待处理')
    const rejectedInvoice = await db.invoice.create({ data: { id: 'invoice-rejected-test', userId: 'u-demo', orderIds: '[]', payload: JSON.stringify({ title: '待驳回发票' }), status: '待处理' } })
    await expect(mvp.processInvoice(rejectedInvoice.id, '已驳回', '', 'operator', '抬头信息与订单不一致')).resolves.toMatchObject({ status: '已驳回', rejectReason: '抬头信息与订单不一致' })
    await expect(mvp.processInvoice('invoice-rejected-test-2', '已驳回', '', 'operator')).rejects.toThrow('开票申请不存在')
    expect((await mvp.refundOrder(order.id)).status).toBe('已取消')
  })

  test('线下支付凭证审核具有状态门禁，已处理订单不能重复审核', async () => {
    const order = await mvp.createOrder('u-demo', 'course-6', [{ name: '审核门禁学员', phone: '13900000031', company: '审核门禁企业' }], 'offline')
    await mvp.uploadPaymentProof('u-demo', order.id, { originalname: 'proof.png', mimetype: 'image/png', size: 4, buffer: Buffer.from('test') })
    await expect(mvp.reviewOffline(order.id, true, '已到账', 'operator')).resolves.toMatchObject({ status: '已支付' })
    await expect(mvp.reviewOffline(order.id, false, '重复处理', 'operator')).rejects.toThrow('只有待审核订单可以审核支付凭证')
    const proof = await db.paymentProof.findFirst({ where: { orderId: order.id } })
    expect(proof?.status).toBe('approved')
  })

  test('管理端可以关闭待支付订单并只回补一次名额', async () => {
    const before = await db.course.findUniqueOrThrow({ where: { id: 'course-5' }, select: { enrolled: true } })
    const order = await mvp.createOrder('u-demo', 'course-5', [{ name: '关闭订单学员', phone: '13900000032', company: '关闭订单企业', department: '人力资源' }], 'online')
    const occupied = await db.course.findUniqueOrThrow({ where: { id: 'course-5' }, select: { enrolled: true } })
    expect(occupied.enrolled).toBe(before.enrolled + 1)
    await expect(mvp.closeUnpaidOrder(order.id, 'operator')).resolves.toMatchObject({ id: order.id, status: '已取消' })
    const released = await db.course.findUniqueOrThrow({ where: { id: 'course-5' }, select: { enrolled: true } })
    expect(released.enrolled).toBe(before.enrolled)
    expect((await db.enrollment.findMany({ where: { orderId: order.id } })).every(item => item.status === 'cancelled')).toBe(true)
    await expect(mvp.closeUnpaidOrder(order.id, 'operator')).rejects.toThrow('只有待支付订单可以关闭')
    expect((await db.course.findUniqueOrThrow({ where: { id: 'course-5' }, select: { enrolled: true } })).enrolled).toBe(before.enrolled)
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

  test('课程状态和报名截止时间由后端统一拦截', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    await mvp.saveCourse({ id: 'course-6', status: '已下架', registrationDeadline: future }, 'admin')
    await expect(mvp.quote('course-6', 1)).rejects.toThrow('未开放报名')

    await mvp.saveCourse({ id: 'course-6', status: '报名中', registrationDeadline: past }, 'admin')
    await expect(mvp.createOrder('u-demo', 'course-6', [{ name: '截止学员', phone: '13900000008', company: '截止企业' }], 'offline')).rejects.toThrow('报名已截止')

    await mvp.saveCourse({ id: 'course-6', status: '报名中', registrationDeadline: future }, 'admin')
    await expect(mvp.quote('course-6', 1)).resolves.toMatchObject({ courseId: 'course-6' })
    await expect(mvp.getCourse('course-6')).resolves.toMatchObject({ registrationOpen: true, registrationClosedReason: null })
  })

  test('待发布课程只在管理端可见，公共列表和详情均隐藏', async () => {
    await mvp.saveCourse({ id: 'course-6', status: '待发布' }, 'admin')
    expect((await mvp.listCoursesPage(undefined, undefined, 1, 100)).items.some((item) => item.id === 'course-6')).toBe(false)
    await expect(mvp.getCourse('course-6')).rejects.toThrow('课程不存在')
    expect((await mvp.listAdminCoursesPage(undefined, undefined, 1, 100)).items.find((item) => item.id === 'course-6')?.status).toBe('待发布')
    await mvp.saveCourse({ id: 'course-6', status: '报名中' }, 'admin')
  })

  test('报名模板支持复制并阻止删除正在使用的模板', async () => {
    const fields = [{ key: 'name', label: '姓名', type: 'text' as const, required: true }]
    await mvp.saveTemplate('tpl-delete-test', { name: '待删除模板', fields }, 'admin')
    await expect(mvp.removeTemplate('tpl-delete-test', 'admin')).resolves.toMatchObject({ id: 'tpl-delete-test', deleted: true })
    const usedTemplate = await db.course.findUniqueOrThrow({ where: { id: 'course-1' }, select: { registrationTemplateId: true } })
    await expect(mvp.removeTemplate(String(usedTemplate.registrationTemplateId), 'admin')).rejects.toThrow('使用')
  })

  test('内容管理后端拒绝非法课程、Banner和模板字段', async () => {
    await expect(mvp.saveCourse({ id: 'course-invalid-title', title: ' ', registrationTemplateId: 'tpl-basic' }, 'admin')).rejects.toThrow('不能为空')
    await expect(mvp.saveCourse({ id: 'course-invalid-price', title: '非法价格课程', price: -1, registrationTemplateId: 'tpl-basic' }, 'admin')).rejects.toThrow('非负数字')
    await expect(mvp.saveCourse({ id: 'course-invalid-capacity', title: '非法名额课程', capacity: 2, enrolled: 3, registrationTemplateId: 'tpl-basic' }, 'admin')).rejects.toThrow('不能超过名额')

    await expect(mvp.saveBanner({ id: 'banner-invalid-title', title: ' ', courseId: 'course-1', sort: 1 }, 'admin')).rejects.toThrow('标题不能为空')
    await expect(mvp.saveBanner({ id: 'banner-invalid-date', title: '非法时间 Banner', courseId: 'course-1', sort: 1, startsAt: '2026-12-31', endsAt: '2026-01-01' }, 'admin')).rejects.toThrow('不能晚于')
    await expect(mvp.saveBanner({ id: 'banner-invalid-sort', title: '非法排序 Banner', courseId: 'course-1', sort: -1 }, 'admin')).rejects.toThrow('非负整数')

    await expect(mvp.saveTemplate('tpl-invalid-options', { name: '非法选项模板', fields: [{ key: 'type', label: '类型', type: 'select', required: true, options: [] }] }, 'admin')).rejects.toThrow('至少需要一个选项')
    await expect(mvp.saveTemplate('tpl-duplicate-keys', { name: '重复字段模板', fields: [{ key: 'name', label: '姓名', type: 'text', required: true }, { key: ' name ', label: '姓名二', type: 'text', required: false }] }, 'admin')).rejects.toThrow('重复')
  })

  test('优惠规则支持冲突提示、停用和删除', async () => {
    const first = await mvp.saveDiscountRule({ id: 'rule-p1-a', minPeople: 4, discountRate: 0.9, courseIds: ['course-1'], enabled: true }, 'admin')
    expect(first.conflicts).toEqual([])
    const second = await mvp.saveDiscountRule({ id: 'rule-p1-b', minPeople: 4, discountRate: 0.8, courseIds: ['course-1'], enabled: true }, 'admin')
    expect(second.conflicts).toContain('rule-p1-a')
    expect((await mvp.listDiscountRules()).find((item) => item.id === 'rule-p1-a')?.conflicts).toContain('rule-p1-b')
    await mvp.saveDiscountRule({ id: 'rule-p1-b', minPeople: 4, discountRate: 0.8, courseIds: ['course-1'], enabled: false }, 'admin')
    expect((await mvp.listDiscountRules()).find((item) => item.id === 'rule-p1-b')?.conflicts).toEqual([])
    await expect(mvp.removeDiscountRule('rule-p1-b', 'admin')).resolves.toMatchObject({ id: 'rule-p1-b', deleted: true })
  })

  test('优惠规则拒绝非法门槛、折扣比例和不存在的课程', async () => {
    await expect(mvp.saveDiscountRule({ id: 'rule-invalid-min', minPeople: 0, discountRate: 0.9, courseIds: [] }, 'admin')).rejects.toThrow('人数门槛')
    await expect(mvp.saveDiscountRule({ id: 'rule-invalid-rate', minPeople: 2, discountRate: 1.1, courseIds: [] }, 'admin')).rejects.toThrow('折扣比例')
    await expect(mvp.saveDiscountRule({ id: 'rule-invalid-course', minPeople: 2, discountRate: 0.9, courseIds: ['missing-course'] }, 'admin')).rejects.toThrow('课程不存在')
  })

  test('积分调整保留逐笔流水并可分页查询', async () => {
    const before = (await db.user.findUniqueOrThrow({ where: { id: 'u-demo' }, select: { points: true } })).points
    await mvp.adjustPoints('u-demo', 12, '内测奖励', 'operator')
    await mvp.adjustPoints('u-demo', -2, '修正重复积分', 'operator')
    const result = await mvp.listPointLedger('u-demo', 1, 1)
    expect(result.user.points).toBe(before + 10)
    expect(result.total).toBe(2)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ points: -2, reason: '修正重复积分' })
  })

  test('积分边界在事务内原子校验，消息创建/更新语义和审计日期筛选明确', async () => {
    const originalPoints = (await db.user.findUniqueOrThrow({ where: { id: 'u-demo' }, select: { points: true } })).points
    await db.user.update({ where: { id: 'u-demo' }, data: { points: 2_147_483_647 } })
    try {
      await expect(mvp.adjustPoints('u-demo', 1, '越过上限', 'operator')).rejects.toThrow('超出可保存范围')
      expect((await db.user.findUniqueOrThrow({ where: { id: 'u-demo' }, select: { points: true } })).points).toBe(2_147_483_647)
    } finally {
      await db.user.update({ where: { id: 'u-demo' }, data: { points: originalPoints } })
    }

    await expect(mvp.saveMessage({ id: 'client-supplied-id', title: '不应带 ID 创建', content: '内容', channel: '站内消息' }, 'operator')).rejects.toThrow()
    const created = await mvp.saveMessage({ title: '消息创建语义', content: '仅用于语义回归', channel: '站内消息' }, 'operator')
    await expect(mvp.saveMessage({ title: '缺少 ID 更新', content: '不应更新', channel: '站内消息' }, 'operator', true)).rejects.toThrow()
    await mvp.removeMessage(created.id, 'operator')

    await expect(mvp.getAdminResource('audits', { from: 'not-a-date' })).rejects.toThrow('格式不正确')
    await expect(mvp.getAdminResource('audits', { from: '2026-08-02', to: '2026-08-01' })).rejects.toThrow('不能晚于')
  })

  test('审计日志支持操作类型和关键字筛选', async () => {
    const result = await mvp.getAdminResource('audits', { action: '用户积分调整', keyword: '修正重复积分' })
    expect(result.some((item) => String(item.detail).includes('demo'))).toBe(true)
    expect((await mvp.getAdminResource('audits', { keyword: '不存在的审计关键字' })).length).toBe(0)
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

  test('管理员重置密码生成一次性随机临时密码', async () => {
    const result = await mvp.resetUserPassword('u-demo', 'operator')
    expect(result.username).toBe('demo')
    expect(result.resetPassword).toMatch(/^Temp-[0-9a-f]{12}$/)
    expect(result.resetPassword).not.toBe('123456')
  })

  test('用户修改密码不允许空请求回退到默认密码', async () => {
    await expect(mvp.changePassword('u-demo', undefined)).rejects.toThrow('请提供至少 6 位的新密码')
    await expect(mvp.changePassword('u-demo', '')).rejects.toThrow('请提供至少 6 位的新密码')
    await expect(mvp.changePassword('u-demo', '12345')).rejects.toThrow('请提供至少 6 位的新密码')
  })

  test('消息通知未接入短信和邮件时不会伪装成已发送', async () => {
    await expect(mvp.saveMessage({ title: '测试通知', content: '测试内容', channel: '邮件（预留）' }, 'operator')).rejects.toThrow('尚未接入')
    await expect(mvp.saveMessage({ title: '站内通知', content: '测试内容', channel: '站内消息' }, 'operator')).resolves.toMatchObject({ channel: '站内消息' })
  })

  test('消息、积分和系统配置拒绝超长或类型不合法的管理端输入', async () => {
    await expect(mvp.saveMessage({ title: '标题', content: '内容', channel: '站内消息', enabled: 'false' as any }, 'operator')).rejects.toThrow('布尔值')
    await expect(mvp.saveMessage({ title: 'x'.repeat(121), content: '内容', channel: '站内消息' }, 'operator')).rejects.toThrow('标题不能超过')
    await expect(mvp.saveMessage({ title: '标题', content: 'x'.repeat(10_001), channel: '站内消息' }, 'operator')).rejects.toThrow('内容不能超过')
    await expect(mvp.saveMessage({ title: '标题', content: '内容', channel: '站内消息', targetUserIds: Array.from({ length: 501 }, (_, index) => `u-${index}`) }, 'operator')).rejects.toThrow('目标数量不能超过')

    await expect(mvp.adjustPoints('u-demo', 1.5 as any, '非法积分', 'operator')).rejects.toThrow('非零整数')
    await expect(mvp.adjustPoints('u-demo', 1, 'x'.repeat(501), 'operator')).rejects.toThrow('原因不能超过')
    await expect(mvp.adjustPoints('u-demo', Number.MAX_SAFE_INTEGER, '超出范围', 'operator')).rejects.toThrow('超出可保存范围')

    await expect(mvp.saveSystemConfig('bad key', { value: 'x' }, 'operator')).rejects.toThrow('格式不合法')
    await expect(mvp.saveSystemConfig('valid.key', { value: 'x'.repeat(10_001) }, 'operator')).rejects.toThrow('配置值不能超过')
    await expect(mvp.saveSystemConfig('valid.key', { value: 'x', description: 'x'.repeat(501) }, 'operator')).rejects.toThrow('配置说明不能超过')
  })

  test('消息支持全量、用户和课程目标范围、时间窗口及阅读状态', async () => {
    const now = Date.now()
    await expect(mvp.saveMessage({ title: '范围-非法目标', content: '不应保存', channel: '站内消息', targetUserIds: ['missing-user'] }, 'operator')).rejects.toThrow('目标用户不存在')
    const all = await mvp.saveMessage({ title: '范围-全量', content: '所有用户可见', channel: '站内消息' }, 'operator')
    const userOnly = await mvp.saveMessage({ title: '范围-用户', content: '仅 demo 可见', channel: '站内消息', targetUserIds: ['u-demo'] }, 'operator')
    const courseOnly = await mvp.saveMessage({ title: '范围-课程', content: '报名 course-1 的用户可见', channel: '站内消息', targetCourseIds: ['course-1'] }, 'operator')
    const future = await mvp.saveMessage({ title: '范围-未来', content: '尚未开始', channel: '站内消息', startsAt: new Date(now + 60_000).toISOString() }, 'operator')
    const expired = await mvp.saveMessage({ title: '范围-过期', content: '已经结束', channel: '站内消息', endsAt: new Date(now - 60_000).toISOString() }, 'operator')

    const demo = await mvp.listUserMessages('u-demo')
    const admin = await mvp.listUserMessages('u-admin')
    expect(demo.items.map(item => item.id)).toEqual(expect.arrayContaining([all.id, userOnly.id, courseOnly.id]))
    expect(demo.items.map(item => item.id)).not.toEqual(expect.arrayContaining([future.id, expired.id]))
    expect(admin.items.map(item => item.id)).toContain(all.id)
    expect(admin.items.map(item => item.id)).not.toContain(userOnly.id)
    expect(admin.items.map(item => item.id)).not.toContain(courseOnly.id)

    await expect(mvp.markMessageRead('u-admin', userOnly.id)).rejects.toThrow('不可见')
    const read = await mvp.markMessageRead('u-demo', userOnly.id)
    expect(read).toMatchObject({ messageId: userOnly.id, userId: 'u-demo' })
    const afterRead = await mvp.listUserMessages('u-demo')
    expect(afterRead.items.find(item => item.id === userOnly.id)?.readAt).toEqual(expect.any(String))
    expect(afterRead.items.find(item => item.id === future.id)).toBeUndefined()
  })

  test('消息支持启停和删除，并为危险操作写入审计', async () => {
    const message = await mvp.saveMessage({ title: '生命周期消息', content: '待启停和删除', channel: '站内消息' }, 'operator')
    await mvp.markMessageRead('u-demo', message.id)
    await expect(mvp.setMessageEnabled(message.id, false, 'operator')).resolves.toMatchObject({ id: message.id, enabled: false })
    expect((await mvp.listUserMessages('u-demo')).items.some(item => item.id === message.id)).toBe(false)
    await expect(mvp.setMessageEnabled(message.id, true, 'operator')).resolves.toMatchObject({ id: message.id, enabled: true })
    expect((await mvp.listUserMessages('u-demo')).items.some(item => item.id === message.id)).toBe(true)
    await expect(mvp.removeMessage(message.id, 'operator')).resolves.toMatchObject({ id: message.id, deleted: true })
    expect(await db.message.findUnique({ where: { id: message.id } })).toBeNull()
    expect(await db.messageRead.count({ where: { messageId: message.id } })).toBe(0)
    expect((await mvp.getAdminResource('audits', { keyword: message.id })).some(item => String(item.action).includes('删除消息'))).toBe(true)
  })

  test('已处理反馈不能重复回复覆盖原处理结果', async () => {
    const feedback = await mvp.submitFeedback('u-demo', { category: '功能建议', content: '请保留原始回复' })
    await expect(mvp.resolveFeedback(feedback.id, '第一次处理', 'operator')).resolves.toMatchObject({ status: '已处理', reply: '第一次处理' })
    await expect(mvp.resolveFeedback(feedback.id, '第二次覆盖', 'operator')).rejects.toThrow('不能重复回复')
    const saved = await db.feedback.findUniqueOrThrow({ where: { id: feedback.id } })
    expect(JSON.parse(saved.payload).reply).toBe('第一次处理')
  })

  test('反馈并发处理只允许一个请求完成状态迁移', async () => {
    const feedback = await mvp.submitFeedback('u-demo', { category: '并发回归', content: '只允许一个处理结果' })
    const results = await Promise.allSettled([
      mvp.resolveFeedback(feedback.id, '并发回复 A', 'operator-a'),
      mvp.resolveFeedback(feedback.id, '并发回复 B', 'operator-b'),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    const saved = await db.feedback.findUniqueOrThrow({ where: { id: feedback.id } })
    expect(JSON.parse(saved.payload).reply).toMatch(/^并发回复 [AB]$/)
    expect(saved.status).toBe('已处理')
  })

  test('反馈内容和回复长度受限且只保存规范化字段', async () => {
    await expect(mvp.submitFeedback('u-demo', { category: '建议', content: 'x'.repeat(5001), extra: '不应落库' })).rejects.toThrow('反馈内容不能超过')
    const feedback = await mvp.submitFeedback('u-demo', { category: '  功能建议  ', content: '  保留规范化内容  ', extra: '不应落库' })
    expect(feedback).toMatchObject({ category: '功能建议', content: '保留规范化内容' })
    expect(feedback).not.toHaveProperty('extra')
    const saved = await db.feedback.findUniqueOrThrow({ where: { id: feedback.id } })
    expect(JSON.parse(saved.payload)).toEqual({ category: '功能建议', content: '保留规范化内容' })
    const listed = await mvp.listFeedbacksPage(feedback.id)
    expect(listed.items[0]).not.toHaveProperty('extra')
    await expect(mvp.resolveFeedback(feedback.id, 'x'.repeat(5001), 'operator')).rejects.toThrow('反馈回复不能超过')
    const auditRows = await mvp.getAdminResource('audits', { keyword: feedback.id })
    expect(auditRows.some((row) => String(row.detail).includes('保留规范化内容'))).toBe(false)
  })

  test('已开票申请支持受控上传和读取电子发票文件', async () => {
    await db.invoice.create({ data: { id: 'invoice-file-test', userId: 'u-demo', orderIds: '[]', payload: JSON.stringify({ title: '文件测试发票' }), status: '待处理' } })
    await mvp.processInvoice('invoice-file-test', '已开票', 'INV-FILE-001', 'operator')
    const uploaded = await mvp.uploadInvoiceFile('invoice-file-test', { originalname: 'invoice.pdf', mimetype: 'application/pdf', size: 4, buffer: Buffer.from('%PDF') }, 'operator')
    expect(uploaded).toMatchObject({ id: 'invoice-file-test', invoiceFileStatus: '已上传', invoiceFileName: 'invoice.pdf' })
    expect(uploaded.invoiceFileUrl).toBe('/api/invoices/invoice-file-test/file')
    const file = await mvp.readInvoiceFile('invoice-file-test', 'u-demo')
    expect(file).toMatchObject({ mimeType: 'application/pdf', originalName: 'invoice.pdf' })
    expect(file.buffer.toString()).toBe('%PDF')
    await expect(mvp.uploadInvoiceFile('invoice-file-test', { originalname: 'invoice-2.pdf', mimetype: 'application/pdf', size: 4, buffer: Buffer.from('%PDF') }, 'operator')).rejects.toThrow('已有发票文件')
    await expect(mvp.readInvoiceFile('invoice-file-test', 'u-admin')).rejects.toThrow('无权访问')
  })
})
