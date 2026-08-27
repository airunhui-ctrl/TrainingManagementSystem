import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import { basename, extname, join, resolve } from 'node:path'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { passwordMatches, PrismaService } from '../prisma.service'
import { createPaymentIntent as createPaymentIntentAdapter } from '../channel-adapters'
import { isAdminRole } from '../auth/roles'
import { AGREEMENT_VERSION } from '../common/agreement-version'
import { PASSWORD_POLICY_MESSAGE, isValidPassword } from '../common/password-policy'
import { courseCategoryLabel, normalizeCourseCategory } from './course-categories'

export interface RegistrationField {
  key: string
  label: string
  type: 'text' | 'phone' | 'select' | 'radio' | 'checkbox'
  required: boolean
  options?: string[]
  maxLength?: number
  maxSelect?: number
}

const json = <T>(value: string | null | undefined, fallback: T): T => {
  try { return value ? JSON.parse(value) as T : fallback } catch { return fallback }
}
const pageArgs = (page = 1, pageSize = 20) => {
  const safePage = Math.max(1, Number(page) || 1)
  const safeSize = Math.min(100, Math.max(1, Number(pageSize) || 20))
  return { page: safePage, pageSize: safeSize, skip: (safePage - 1) * safeSize, take: safeSize }
}
const id = (prefix: string) => `${prefix}-${Date.now()}-${randomBytes(3).toString('hex')}`
const stableId = (prefix: string, value: string) => `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 24)}`
const normalizedPhone = (value: unknown) => {
  const digits = String(value || '').trim().replace(/[\s-]/g, '')
  if (!digits) return null
  if (digits.startsWith('+86')) return digits.slice(3)
  if (digits.startsWith('0086')) return digits.slice(4)
  return digits
}
const maskPhone = (value: string | null | undefined) => {
  const phone = String(value || '')
  if (!phone) return phone
  // Only preserve a prefix/suffix for a validated mainland mobile number.
  // Legacy or malformed short values must not be returned in clear text.
  return /^1\d{10}$/.test(phone) ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : '*'.repeat(phone.length)
}
const sanitizeRichText = (value: unknown) => String(value || '')
  .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
  .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  .replace(/javascript\s*:/gi, '')
  .trim()
const stripRichText = (value: unknown) => String(value || '')
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/<\/p\s*>|<\/div\s*>|<\/h[1-6]\s*>/gi, '\n')
  .replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
const REGISTRATION_OPEN_STATUSES = new Set(['报名中', '名额紧张'])
const PUBLIC_HIDDEN_COURSE_STATUSES = new Set(['待发布', '已下架'])
const parseDateValue = (value: unknown) => {
  const raw = String(value || '').trim()
  if (!raw) return null
  const parsed = Date.parse(raw.includes('T') ? raw : raw.replace(' ', 'T'))
  return Number.isFinite(parsed) ? parsed : null
}
const MAX_MESSAGE_TITLE_LENGTH = 120
const MAX_MESSAGE_CONTENT_LENGTH = 10_000
const MAX_MESSAGE_TARGETS = 500
const MAX_FEEDBACK_CONTENT_LENGTH = 5_000
const MAX_FEEDBACK_REPLY_LENGTH = 5_000
const MAX_FEEDBACK_CATEGORY_LENGTH = 80
const MAX_CONFIG_KEY_LENGTH = 100
const MAX_CONFIG_VALUE_LENGTH = 10_000
const MAX_CONFIG_DESCRIPTION_LENGTH = 500
const MAX_POINT_REASON_LENGTH = 500
const MAX_FEEDBACK_ATTACHMENTS = 3
const MAX_FEEDBACK_ATTACHMENT_BYTES = 5 * 1024 * 1024
const SQLITE_INT_MIN = -2_147_483_648
const SQLITE_INT_MAX = 2_147_483_647

@Injectable()
export class MvpService {
  constructor(private readonly db: PrismaService) {}

  async health() {
    await this.db.$queryRaw`SELECT 1`
    return { status: 'ok' as const, database: 'ok' as const, timestamp: new Date().toISOString() }
  }

  private courseView(course: any) {
    const { registrationTemplate, ...base } = course
    const rawDescription = String(course.description || '')
    const hasRichText = /<\/?(p|div|h[1-6]|ul|ol|li|strong|em|a|img|blockquote|br)(\s|>)/i.test(rawDescription)
    const startAt = parseDateValue(course.registrationStartAt)
    const endAt = parseDateValue(course.registrationEndAt ?? course.registrationDeadline)
    const notStarted = startAt !== null && startAt > Date.now()
    const ended = endAt !== null && endAt <= Date.now()
    const seatsAvailable = Number(course.enrolled || 0) < Number(course.capacity || 0)
    const registrationOpen = REGISTRATION_OPEN_STATUSES.has(String(course.status)) && !notStarted && !ended && seatsAvailable
    return {
      ...base,
      registrationStartAt: course.registrationStartAt || null,
      registrationEndAt: course.registrationEndAt || course.registrationDeadline || null,
      maxParticipantsPerOrder: course.maxParticipantsPerOrder ?? null,
      specialPriceEndsAt: course.specialPriceEndsAt || null,
      specialPriceActive: course.specialPrice == null || (parseDateValue(course.specialPriceEndsAt) ?? Number.POSITIVE_INFINITY) > Date.now(),
      category: courseCategoryLabel(course.category),
      categoryCode: normalizeCourseCategory(course.category) || String(course.category || ''),
      description: hasRichText ? stripRichText(rawDescription) : rawDescription,
      ...(hasRichText ? { descriptionRichText: sanitizeRichText(rawDescription) } : {}),
      seatsLeft: Math.max(course.capacity - course.enrolled, 0),
      registrationOpen,
      registrationClosedReason: registrationOpen ? null : (notStarted ? '报名未开始' : ended ? '报名截止' : (!seatsAvailable ? '名额已满' : (REGISTRATION_OPEN_STATUSES.has(String(course.status)) ? '暂不可报名' : '课程未开放报名'))),
      registrationTemplateName: registrationTemplate?.name || '',
    }
  }

  private assertCourseRegistrationOpen(course: any) {
    if (!REGISTRATION_OPEN_STATUSES.has(String(course.status))) throw new BadRequestException('课程当前未开放报名')
    const startAt = parseDateValue(course.registrationStartAt)
    const endAt = parseDateValue(course.registrationEndAt ?? course.registrationDeadline)
    if (startAt !== null && startAt > Date.now()) throw new BadRequestException('课程报名尚未开始')
    if (endAt !== null && endAt <= Date.now()) throw new BadRequestException('课程报名已截止')
    if (Number(course.enrolled || 0) >= Number(course.capacity || 0)) throw new BadRequestException('课程名额已满')
  }

  private orderView(order: any) {
    const proof = Array.isArray(order.paymentProofs) ? order.paymentProofs[0] : undefined
    return {
      ...order,
      participants: json<Array<Record<string, string>>>(order.participants, []),
      createdAt: new Date(order.createdAt).toISOString(),
      updatedAt: new Date(order.updatedAt).toISOString(),
      courseTitle: order.course?.title,
      paymentProof: proof?.path,
      paymentProofStatus: proof?.status,
      paymentProofRemark: proof?.remark,
    }
  }

  private invoiceView(invoice: any) {
    const payload = json<Record<string, any>>(invoice.payload, {})
    const invoiceFileStatus = String(payload.invoiceFileStatus || (invoice.status === '已开票' ? '待上传' : invoice.status === '已驳回' ? '不适用' : '未生成'))
    return {
      ...payload,
      id: invoice.id,
      userId: invoice.userId,
      orderIds: json<string[]>(invoice.orderIds, []),
      status: invoice.status,
      invoiceFileStatus,
      invoiceFileName: payload.invoiceFileName || null,
      invoiceFileUrl: payload.invoiceFileUrl || null,
      invoiceFileUploadedAt: payload.invoiceFileUploadedAt || null,
      createdAt: new Date(invoice.createdAt).toISOString(),
      processedAt: invoice.processedAt ? new Date(invoice.processedAt).toISOString() : undefined,
    }
  }

  private async applicableDiscountRule(db: any, courseId: string, participantCount: number) {
    const rules = await db.discountRule.findMany({ where: { enabled: true, minPeople: { lte: participantCount } }, orderBy: { minPeople: 'desc' } })
    return rules.find((rule: any) => {
      const courseIds = json<string[]>(rule.scopeCourseIds, [])
      return !courseIds.length || courseIds.includes(courseId)
    })
  }

  async listCourses(keyword?: string, category?: string) {
    const items = await this.db.course.findMany({
      where: {
        ...(keyword ? { OR: [{ title: { contains: keyword } }, { subtitle: { contains: keyword } }, { instructor: { contains: keyword } }] } : {}),
        ...(category ? { category } : {}),
      },
      include: { registrationTemplate: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return items.map((item) => this.courseView(item))
  }

  async listCoursesPage(keyword?: string, category?: string, page = 1, pageSize = 20, status?: string) {
    const args = pageArgs(page, pageSize)
    const normalizedCategory = category ? (normalizeCourseCategory(category) || category) : category
    // C 端只允许看到已经发布且未下架的课程；管理端使用
    // listAdminCoursesPage 读取完整课程集合，避免把待发布课程误暴露到公共接口。
    const requestedStatus = String(status || '').trim()
    if (PUBLIC_HIDDEN_COURSE_STATUSES.has(requestedStatus)) return { items: [], page: args.page, pageSize: args.pageSize, total: 0 }
    const where = {
      ...(keyword ? { OR: [{ id: { contains: keyword } }, { title: { contains: keyword } }, { subtitle: { contains: keyword } }, { instructor: { contains: keyword } }] } : {}),
      ...(normalizedCategory ? { category: normalizedCategory } : {}),
      ...(requestedStatus ? { status: requestedStatus } : { status: { notIn: [...PUBLIC_HIDDEN_COURSE_STATUSES] } }),
    }
    const [items, total] = await this.db.$transaction([
      this.db.course.findMany({ where, include: { registrationTemplate: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' }, skip: args.skip, take: args.take }),
      this.db.course.count({ where }),
    ])
    return { items: items.map((item) => this.courseView(item)), page: args.page, pageSize: args.pageSize, total }
  }

  async listAdminCoursesPage(keyword?: string, category?: string, page = 1, pageSize = 20, status?: string) {
    const args = pageArgs(page, pageSize)
    const normalizedCategory = category ? (normalizeCourseCategory(category) || category) : category
    const where = {
      ...(keyword ? { OR: [{ id: { contains: keyword } }, { title: { contains: keyword } }, { subtitle: { contains: keyword } }, { instructor: { contains: keyword } }] } : {}),
      ...(normalizedCategory ? { category: normalizedCategory } : {}),
      ...(status ? { status } : {}),
    }
    const [items, total] = await this.db.$transaction([
      this.db.course.findMany({ where, include: { registrationTemplate: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, skip: args.skip, take: args.take }),
      this.db.course.count({ where }),
    ])
    return { items: items.map((item) => this.courseView(item)), page: args.page, pageSize: args.pageSize, total }
  }

  async getCourse(courseId: string) {
    const course = await this.db.course.findUnique({ where: { id: courseId }, include: { registrationTemplate: { select: { id: true, name: true } } } })
    if (!course || PUBLIC_HIDDEN_COURSE_STATUSES.has(String(course.status))) throw new NotFoundException('课程不存在')
    return this.courseView(course)
  }

  async getTemplate(courseId: string) {
    const course = await this.db.course.findUnique({ where: { id: courseId }, select: { id: true, registrationTemplateId: true } })
    if (!course) throw new NotFoundException('课程不存在')
    if (!course.registrationTemplateId) throw new BadRequestException('课程尚未关联报名模板')
    const item = await this.db.registrationTemplate.findUnique({ where: { id: course.registrationTemplateId } })
    if (!item) throw new BadRequestException('课程关联的报名模板不存在')
    if (item.enabled === false) throw new BadRequestException('课程关联的报名模板已停用，暂不可报名')
    return { courseId, templateId: item?.id, templateName: item?.name, version: item?.version || 1, fields: json<RegistrationField[]>(item?.payload, []) }
  }

  async quote(courseId: string, participantCount: number) {
    if (!Number.isInteger(participantCount) || participantCount < 1) throw new BadRequestException('报名人数必须大于 0')
    const course = await this.db.course.findUnique({ where: { id: courseId } })
    if (!course) throw new NotFoundException('课程不存在')
    this.assertCourseRegistrationOpen(course)
    if (course.maxParticipantsPerOrder && participantCount > course.maxParticipantsPerOrder) throw new BadRequestException(`该课程单次最多报名 ${course.maxParticipantsPerOrder} 人`)
    const rule = await this.applicableDiscountRule(this.db, courseId, participantCount)
    const specialActive = course.specialPrice != null && (parseDateValue(course.specialPriceEndsAt) ?? Number.POSITIVE_INFINITY) > Date.now()
    const unitPrice = specialActive && course.specialPrice != null ? course.specialPrice : course.price
    const originalAmount = unitPrice * participantCount
    const discountRate = rule ? Number(Math.max(0, Math.min(1, 1 - rule.discountRate)).toFixed(2)) : 0
    const discount = Math.round(originalAmount * discountRate)
    return { courseId, participantCount, unitPrice, originalAmount, discount, amount: originalAmount - discount, discountRate }
  }

  async createOrder(userId: string, courseId: string, participants: Array<Record<string, string> & { studentId?: string }>, paymentMethod: 'online' | 'offline' = 'online') {
    if (!participants.length) throw new BadRequestException('至少需要一名报名人')
    const template = await this.getTemplate(courseId)
    for (const [index, participant] of participants.entries()) {
      const snapshot = { ...participant }
      delete snapshot.studentId
      const missing = template.fields.find((field) => field.required && !String(snapshot[field.key] || '').trim())
      if (missing) throw new BadRequestException(`第 ${index + 1} 位报名人的${missing.label}不能为空`)
      const overLength = template.fields.find((field) => field.maxLength && String(snapshot[field.key] || '').length > field.maxLength)
      if (overLength) throw new BadRequestException(`第 ${index + 1} 位报名人的${overLength.label}不能超过 ${overLength.maxLength} 个字符`)
      const overSelect = template.fields.find((field) => field.type === 'checkbox' && field.maxSelect && String(snapshot[field.key] || '').split(',').filter(Boolean).length > (field.maxSelect || 0))
      if (overSelect) throw new BadRequestException(`第 ${index + 1} 位报名人的${overSelect.label}最多选择 ${overSelect.maxSelect} 项`)
      const phone = normalizedPhone(snapshot.phone)
      if (phone && !/^1\d{10}$/.test(phone)) throw new BadRequestException(`第 ${index + 1} 位报名人的手机号格式不正确`)
    }
    return this.db.$transaction(async (tx) => {
      const course = await tx.course.findUnique({ where: { id: courseId } })
      if (!course) throw new NotFoundException('课程不存在')
      this.assertCourseRegistrationOpen(course)
      if (!course.allowMultiParticipant && participants.length > 1) throw new BadRequestException('该课程不支持多人报名')
      if (course.maxParticipantsPerOrder && participants.length > course.maxParticipantsPerOrder) throw new BadRequestException(`该课程单次最多报名 ${course.maxParticipantsPerOrder} 人`)
      if (course.enrolled + participants.length > course.capacity) throw new BadRequestException('课程剩余名额不足')
      const activeOrders = await tx.order.findMany({ where: { courseId, status: { not: '已取消' } }, select: { participants: true } })
      const registeredPhones = new Set(activeOrders.flatMap((order) => json<Array<Record<string, string>>>(order.participants, []).map((item) => normalizedPhone(item.phone)).filter(Boolean)))
      const duplicated = participants.find((item) => {
        const phone = normalizedPhone(item.phone)
        return Boolean(phone && registeredPhones.has(phone))
      })
      if (duplicated) throw new BadRequestException(`手机号 ${normalizedPhone(duplicated.phone)} 已报名本课程`)
      const rule = await this.applicableDiscountRule(tx, courseId, participants.length)
      const specialActive = course.specialPrice != null && (parseDateValue(course.specialPriceEndsAt) ?? Number.POSITIVE_INFINITY) > Date.now()
      const unitPrice = specialActive && course.specialPrice != null ? course.specialPrice : course.price
      const originalAmount = unitPrice * participants.length
      const discountRate = rule ? Math.max(0, Math.min(1, 1 - rule.discountRate)) : 0
      const discount = Math.round(originalAmount * discountRate)
      const snapshots = participants.map((participant) => { const snapshot = { ...participant }; delete snapshot.studentId; return snapshot })
      const order = await tx.order.create({ data: {
        id: id('HX'), userId, courseId, participants: JSON.stringify(snapshots), participantCount: participants.length,
        originalAmount, discount, amount: originalAmount - discount,
        status: '待支付', paymentMethod,
      }, include: { course: true, paymentProofs: { orderBy: { createdAt: 'desc' }, take: 1 } } })
      const templateVersion = await tx.registrationTemplateVersion.upsert({
        where: { templateId_version: { templateId: template.templateId, version: template.version || 1 } },
        create: { id: stableId('rtv', `${template.templateId}:${template.version || 1}`), templateId: template.templateId, version: template.version || 1, payload: JSON.stringify(template.fields), checksum: createHash('sha256').update(JSON.stringify(template.fields)).digest('hex'), status: 'published', publishedAt: new Date(), },
        update: {},
      })
      for (const [index, participant] of participants.entries()) {
        const snapshot = snapshots[index]
        const phone = normalizedPhone(snapshot.phone)
        let student = null
        if (participant.studentId) {
          const relation = await tx.accountStudent.findFirst({ where: { userId, studentId: participant.studentId, status: 'active' }, include: { student: true } })
          if (!relation) throw new BadRequestException(`第 ${index + 1} 位报名人不属于当前账号或关系已解除`)
          student = relation.student
        } else if (phone) {
          const candidates = await tx.student.findMany({ where: { phoneNormalized: phone }, orderBy: { createdAt: 'asc' } })
          if (candidates.length > 1) throw new BadRequestException(`第 ${index + 1} 位报名人的手机号存在多个学员档案，请先人工确认`)
          if (candidates.length === 1 && String(candidates[0].name).trim() !== String(snapshot.name || '').trim()) throw new BadRequestException(`第 ${index + 1} 位报名人的手机号与已有学员姓名不一致`)
          student = candidates[0] || null
        }
        if (!student) {
          const studentId = stableId('stu', phone ? `phone:${phone}` : `account:${userId}:${order.id}:${index}`)
          student = await tx.student.upsert({
            where: { id: studentId },
            create: { id: studentId, name: String(snapshot.name || '').trim(), phone: snapshot.phone || null, phoneNormalized: phone, gender: snapshot.gender || null, email: snapshot.email || null, company: snapshot.company || null, department: snapshot.department || null, position: snapshot.position || snapshot.role || null, status: 'active', extraPayload: JSON.stringify(snapshot), createdByUserId: userId },
            update: {},
          })
        }
        await tx.accountStudent.upsert({
          where: { userId_studentId: { userId, studentId: student.id } },
          create: { id: stableId('acct-stu', `${userId}:${student.id}`), userId, studentId: student.id, relationType: participant.studentId ? 'selected' : 'self_or_proxy', source: participant.studentId ? 'user_selected' : 'order_created', status: 'active', createdByUserId: userId },
          update: { status: 'active', revokedAt: null },
        })
        await tx.enrollment.create({ data: {
          id: stableId('enr', `${order.id}:${index}`), studentId: student.id, courseId, orderId: order.id, accountUserId: userId, sourceParticipantIndex: index, templateVersionId: templateVersion.id, templateVersion: templateVersion.version, formPayload: JSON.stringify(snapshot), status: 'registered', registeredAt: order.createdAt,
        } })
      }
      await tx.course.update({ where: { id: courseId }, data: { enrolled: { increment: participants.length } } })
      return this.orderView(order)
    })
  }

  async listOrders(userId?: string) {
    const items = await this.db.order.findMany({ where: userId ? { userId } : {}, include: { course: true, paymentProofs: { orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: { createdAt: 'desc' } })
    return items.map((item) => this.orderView(item))
  }

  async listOrdersPage(userId?: string, keyword?: string, page = 1, pageSize = 20, status?: string) {
    const args = pageArgs(page, pageSize)
    const where = {
      ...(userId ? { userId } : {}),
      ...(status ? { status } : {}),
      ...(keyword ? { OR: [{ id: { contains: keyword } }, { courseId: { contains: keyword } }, { course: { title: { contains: keyword } } }] } : {}),
    }
    const [items, total] = await this.db.$transaction([
      this.db.order.findMany({ where, include: { course: true, paymentProofs: { orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: { createdAt: 'desc' }, skip: args.skip, take: args.take }),
      this.db.order.count({ where }),
    ])
    return { items: items.map((item) => this.orderView(item)), page: args.page, pageSize: args.pageSize, total }
  }

  async getOrder(userId: string, orderId: string) {
    const order = await this.db.order.findFirst({ where: { id: orderId, userId }, include: { course: true, paymentProofs: { orderBy: { createdAt: 'desc' }, take: 1 }, paymentTransactions: { orderBy: { createdAt: 'desc' } } } })
    if (!order) throw new NotFoundException('订单不存在')
    return {
      ...this.orderView(order),
      paymentTransactions: order.paymentTransactions.map((item) => ({ id: item.id, channel: item.channel, provider: item.provider, outTradeNo: item.outTradeNo, providerTradeNo: item.providerTradeNo, amount: item.amount, status: item.status, paidAt: item.paidAt?.toISOString() || null, createdAt: item.createdAt.toISOString() })),
    }
  }

  async payOrder(userId: string, orderId: string, method: 'online' | 'offline', proof?: string, channel?: 'wechat' | 'alipay') {
    const order = await this.db.order.findFirst({ where: { id: orderId, userId } })
    if (!order) throw new NotFoundException('订单不存在')
    if (order.status === '已取消') throw new BadRequestException('已取消订单不能支付')
    if (method === 'offline') throw new BadRequestException('请在订单中上传线下支付凭证')
    // 在线支付不能由客户端回传“成功”直接改订单状态；必须等待微信/支付宝异步通知并完成验签。
    throw new BadRequestException(`在线支付必须通过${channel === 'alipay' ? '支付宝' : '微信'}渠道回调确认，不能由客户端直接确认成功`)
  }

  async createPaymentIntent(userId: string, orderId: string, channel: 'wechat' | 'alipay', clientIp?: string) {
    const order = await this.db.order.findFirst({ where: { id: orderId, userId } })
    if (!order) throw new NotFoundException('订单不存在')
    if (order.status !== '待支付') throw new BadRequestException('当前订单状态不能发起支付')
    const provider = channel === 'wechat' ? 'wxpay' : 'alipay'
    const transaction = await this.db.paymentTransaction.upsert({
      where: { outTradeNo: orderId },
      create: { id: id('PAY'), orderId, channel, provider, outTradeNo: orderId, amount: order.amount, status: 'pending' },
      update: { channel, provider, amount: order.amount, status: 'pending', updatedAt: new Date() },
    })
    const payer = channel === 'wechat' && String(process.env.WECHAT_PAY_PRODUCT || '').toLowerCase() === 'jsapi'
      ? await this.db.user.findUnique({ where: { id: userId }, select: { wechatOpenId: true } })
      : null
    const intent = await createPaymentIntentAdapter(channel, order.amount, transaction.outTradeNo, { clientIp, openId: payer?.wechatOpenId || undefined })
    await this.db.order.update({ where: { id: orderId }, data: { paymentMethod: 'online', paymentChannel: channel } })
    await this.db.paymentTransaction.update({ where: { id: transaction.id }, data: { payload: JSON.stringify(intent.payload || {}) } })
    return { orderId, channel, provider, amount: order.amount, currency: 'CNY', ...intent }
  }

  async getPaymentStatus(userId: string, orderId: string) {
    const order = await this.db.order.findFirst({ where: { id: orderId, userId }, include: { paymentTransactions: { orderBy: { createdAt: 'desc' }, take: 1 } } })
    if (!order) throw new NotFoundException('订单不存在')
    const transaction = order.paymentTransactions[0]
    return { orderId, orderStatus: order.status, paid: order.status === '已支付', channel: transaction?.channel || order.paymentChannel || null, providerTradeNo: transaction?.providerTradeNo || null, transactionStatus: transaction?.status || null }
  }

  async confirmExternalPayment(input: { channel: 'wechat' | 'alipay'; outTradeNo: string; providerTradeNo?: string; amount: number; payload?: Record<string, any> }) {
    const transaction = await this.db.paymentTransaction.findUnique({ where: { outTradeNo: input.outTradeNo } })
    if (!transaction) throw new NotFoundException('支付交易不存在')
    if (transaction.channel !== input.channel) throw new BadRequestException('支付渠道与订单不一致')
    if (Math.round(Number(input.amount) * 100) !== Math.round(transaction.amount * 100)) throw new BadRequestException('支付金额与订单金额不一致')
    const order = await this.db.order.findUnique({ where: { id: transaction.orderId } })
    if (!order) throw new NotFoundException('订单不存在')
    if (order.status === '已取消') throw new BadRequestException('已取消订单不能确认支付')
    if (order.status === '已支付' && transaction.status === 'paid') return this.orderView(await this.db.order.findUniqueOrThrow({ where: { id: order.id }, include: { course: true, paymentProofs: { orderBy: { createdAt: 'desc' }, take: 1 } } }))
    const updated = await this.db.$transaction(async (tx) => {
      const item = await tx.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'paid', providerTradeNo: input.providerTradeNo || transaction.providerTradeNo, payload: JSON.stringify(input.payload || {}), paidAt: new Date() } })
      const paidOrder = await tx.order.update({ where: { id: order.id }, data: { status: '已支付', paymentMethod: 'online', paymentChannel: input.channel }, include: { course: true, paymentProofs: { orderBy: { createdAt: 'desc' }, take: 1 } } })
      return { item, paidOrder }
    })
    await this.audit(`payment:${input.channel}`, '支付回调确认', `${order.id} ${updated.item.providerTradeNo || ''}`)
    return this.orderView(updated.paidOrder)
  }

  async uploadPaymentProof(userId: string, orderId: string, file: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
    const order = await this.db.order.findFirst({ where: { id: orderId, userId } })
    if (!order) throw new NotFoundException('订单不存在')
    if (order.status === '已取消' || order.status === '已支付') throw new BadRequestException('当前订单状态不能上传凭证')
    if (order.status === '待审核') throw new BadRequestException('支付凭证正在审核，不能重复提交')
    const max = Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024)
    if (!file.size || file.size > max) throw new BadRequestException(`支付凭证大小必须在 1 字节到 ${Math.floor(max / 1024 / 1024)}MB 之间`)
    const allowed: Record<string, string[]> = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'application/pdf': ['.pdf'] }
    const suffix = extname(file.originalname).toLowerCase()
    if (!allowed[file.mimetype]?.includes(suffix)) throw new BadRequestException('仅支持扩展名与类型匹配的 JPG、PNG 或 PDF 凭证')
    const dir = resolve(process.env.UPLOAD_DIR || 'storage/payment-proofs')
    mkdirSync(dir, { recursive: true })
    const storedName = `${orderId}-${Date.now()}-${randomBytes(4).toString('hex')}${suffix === '.jpeg' ? '.jpg' : suffix}`
    const relativePath = join('payment-proofs', storedName).replace(/\\/g, '/')
    const absolutePath = join(dir, storedName)
    writeFileSync(absolutePath, file.buffer)
    try {
      const result = await this.db.$transaction(async (tx) => {
        const proof = await tx.paymentProof.create({ data: { id: id('PP'), orderId, originalName: basename(file.originalname), storedName, mimeType: file.mimetype, size: file.size, path: relativePath, status: 'pending' } })
        const updated = await tx.order.update({ where: { id: orderId }, data: { paymentMethod: 'offline', status: '待审核' }, include: { course: true, paymentProofs: { orderBy: { createdAt: 'desc' }, take: 1 } } })
        return { proof, updated }
      })
      await this.audit(userId, '上传支付凭证', orderId)
      return { order: this.orderView(result.updated), file: { ...result.proof, createdAt: result.proof.createdAt.toISOString() } }
    } catch (error) {
      if (existsSync(absolutePath)) unlinkSync(absolutePath)
      throw error
    }
  }

  async getPaymentProof(orderId: string) {
    const proof = await this.db.paymentProof.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } })
    return proof ? { ...proof, createdAt: proof.createdAt.toISOString(), reviewedAt: proof.reviewedAt?.toISOString() } : null
  }

  async readPaymentProof(orderId: string) {
    const proof = await this.getPaymentProof(orderId)
    if (!proof) throw new NotFoundException('支付凭证不存在')
    const filePath = resolve(process.env.UPLOAD_DIR || 'storage/payment-proofs', proof.storedName)
    if (!existsSync(filePath)) throw new NotFoundException('支付凭证文件不存在')
    return { proof, buffer: readFileSync(filePath) }
  }

  async createInvoice(userId: string, payload: Record<string, any>) {
    const orderIds = Array.isArray(payload.orderIds) ? [...new Set(payload.orderIds.map(String))] : []
    if (!orderIds.length) throw new BadRequestException('请选择需要开票的已支付订单')
    const orders = await this.db.order.findMany({ where: { id: { in: orderIds } } })
    if (orders.length !== orderIds.length || orders.some((order) => order.userId !== userId || order.status !== '已支付')) throw new BadRequestException('只能选择本人已支付订单开票')
    const invoices = await this.db.invoice.findMany({ where: { status: { not: '已驳回' } }, select: { orderIds: true } })
    if (invoices.some((invoice) => json<string[]>(invoice.orderIds, []).some((item) => orderIds.includes(item)))) throw new BadRequestException('所选订单已提交开票申请')
    const item = await this.db.invoice.create({ data: { id: id('INV'), userId, orderIds: JSON.stringify(orderIds), payload: JSON.stringify({ ...payload, orderIds, invoiceFileStatus: '未生成', invoiceFileName: null, invoiceFileUrl: null, invoiceFileUploadedAt: null }), status: '待处理' } })
    await this.audit(userId, '提交开票申请', item.id)
    return this.invoiceView(item)
  }

  async reapplyInvoice(userId: string, invoiceId: string, payload: Record<string, any>) {
    const previous = await this.db.invoice.findUnique({ where: { id: invoiceId } })
    if (!previous) throw new NotFoundException('原开票申请不存在')
    if (previous.userId !== userId) throw new ForbiddenException('无权重新提交该开票申请')
    if (previous.status !== '已驳回') throw new BadRequestException('只有已驳回的开票申请可以重新提交')
    const orderIds = json<string[]>(previous.orderIds, [])
    if (!orderIds.length) throw new BadRequestException('原开票申请没有可重新提交的订单')
    const item = await this.createInvoice(userId, { ...payload, orderIds })
    const created = await this.db.invoice.findUniqueOrThrow({ where: { id: item.id } })
    const createdPayload = { ...json<Record<string, any>>(created.payload, {}), retryOfInvoiceId: invoiceId }
    const updated = await this.db.invoice.update({ where: { id: created.id }, data: { payload: JSON.stringify(createdPayload) } })
    await this.audit(userId, '重新提交开票申请', `${invoiceId} -> ${created.id}`)
    return this.invoiceView(updated)
  }

  async dashboard() {
    const [courses, orders, previews, pendingInvoiceCount] = await Promise.all([
      this.db.course.findMany({ orderBy: { createdAt: 'asc' } }),
      this.db.order.findMany(),
      this.db.preview.findMany(),
      this.db.invoice.count({ where: { status: '待处理' } }),
    ])
    return {
      courseCount: courses.length,
      enrollmentCount: orders.reduce((sum, item) => sum + item.participantCount, 0),
      previewCount: previews.length,
      paidCount: orders.filter((item) => item.status === '已支付').length,
      pendingPaymentCount: orders.filter((item) => item.status === '待支付').length,
      pendingInvoiceCount,
      courseStats: courses.map((course) => ({ courseId: course.id, title: course.title, enrolled: course.enrolled, paidOrders: orders.filter((order) => order.courseId === course.id && order.status === '已支付').length, previews: previews.filter((item) => item.courseId === course.id).length })),
    }
  }

  async recordPreview(userId: string, courseId: string) {
    await this.getCourse(courseId)
    const item = await this.db.preview.upsert({ where: { userId_courseId: { userId, courseId } }, create: { id: id('PV'), userId, courseId }, update: { viewedAt: new Date() } })
    return { ...item, viewedAt: item.viewedAt.toISOString() }
  }

  async listPreviews(userId: string) {
    const items = await this.db.preview.findMany({ where: { userId }, include: { course: true }, orderBy: { viewedAt: 'desc' } })
    return items.map((item) => ({ id: item.id, userId: item.userId, courseId: item.courseId, courseTitle: item.course.title, viewedAt: item.viewedAt.toISOString() }))
  }

  async listAdminOrdersPage(keyword?: string, page = 1, pageSize = 20, status?: string) { return this.listOrdersPage(undefined, keyword, page, pageSize, status) }

  async uploadCourseImage(file: { originalname: string; mimetype: string; size: number; buffer: Buffer }, actor = 'admin') {
    if (!file?.size || file.size > 5 * 1024 * 1024) throw new BadRequestException('课程图片大小必须在 1 字节到 5MB 之间')
    if (!String(file.mimetype || '').startsWith('image/')) throw new BadRequestException('课程图片必须是 JPG、PNG、WEBP 等图片格式')
    const extension = extname(file.originalname).toLowerCase() || (file.mimetype === 'image/png' ? '.png' : '.jpg')
    const safeExtension = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension) ? extension : '.jpg'
    const dir = resolve(process.env.UPLOAD_DIR || 'storage/payment-proofs', '..', 'course-images')
    mkdirSync(dir, { recursive: true })
    const storedName = `course-${Date.now()}-${randomBytes(4).toString('hex')}${safeExtension === '.jpeg' ? '.jpg' : safeExtension}`
    writeFileSync(join(dir, storedName), file.buffer)
    const url = `/api/media/course-images/${encodeURIComponent(storedName)}`
    await this.audit(actor, '课程图片上传', storedName)
    return { url, name: storedName, originalName: basename(file.originalname), size: file.size, mimeType: file.mimetype }
  }

  async readCourseImage(name: string) {
    const fileName = basename(String(name || ''))
    if (!fileName || fileName !== String(name || '')) throw new NotFoundException('课程图片不存在')
    const dir = resolve(process.env.UPLOAD_DIR || 'storage/payment-proofs', '..', 'course-images')
    const path = join(dir, fileName)
    if (!existsSync(path)) throw new NotFoundException('课程图片不存在')
    const mimeType: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }
    return { buffer: readFileSync(path), mimeType: mimeType[extname(fileName).toLowerCase()] || 'application/octet-stream' }
  }

  private async audit(actor: string, action: string, detail: string, before?: unknown, after?: unknown) { await this.db.saveAudit(actor, action, detail, before, after) }

  async listBanners() {
    const items = await this.db.banner.findMany({ orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] })
    const courseIds = items.map((item) => String(json<Record<string, any>>(item.payload, {}).courseId || '')).filter(Boolean)
    const courses = await this.db.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } })
    const courseTitles = new Map(courses.map((course) => [course.id, course.title]))
    return items.map((item) => { const view = json<Record<string, any>>(item.payload, {}); return { ...view, id: item.id, courseTitle: courseTitles.get(String(view.courseId || '')) || '', enabled: item.enabled, sort: item.sort } })
  }

  async saveBanner(payload: Record<string, any>, actor = 'admin') {
    const bannerId = String(payload.id || id('banner'))
    const existing = await this.db.banner.findUnique({ where: { id: bannerId } })
    const merged: Record<string, any> = { ...json<Record<string, any>>(existing?.payload, {}), ...payload, id: bannerId }
    const title = String(merged.title || '').trim()
    if (!title) throw new BadRequestException('Banner标题不能为空')
    const courseId = String(merged.courseId || '')
    if (!courseId || !(await this.db.course.findUnique({ where: { id: courseId }, select: { id: true } }))) throw new BadRequestException('Banner必须绑定现有课程')
    const sort = Number(merged.sort ?? existing?.sort ?? 0)
    if (!Number.isInteger(sort) || sort < 0) throw new BadRequestException('Banner排序必须是非负整数')
    const startsAt = String(merged.startsAt || '').trim()
    const endsAt = String(merged.endsAt || '').trim()
    if (startsAt && parseDateValue(startsAt) === null) throw new BadRequestException('Banner开始时间格式不合法')
    if (endsAt && parseDateValue(endsAt) === null) throw new BadRequestException('Banner结束时间格式不合法')
    if (startsAt && endsAt && Number(parseDateValue(startsAt)) > Number(parseDateValue(endsAt))) throw new BadRequestException('Banner开始时间不能晚于结束时间')
    merged.title = title
    merged.startsAt = startsAt || null
    merged.endsAt = endsAt || null
    const nextSort = existing ? sort : Number((await this.db.banner.aggregate({ _max: { sort: true } }))._max.sort || 0) + 1
    merged.sort = nextSort
    const item = await this.db.banner.upsert({ where: { id: bannerId }, create: { id: bannerId, payload: JSON.stringify(merged), enabled: merged.enabled !== false, sort: nextSort }, update: { payload: JSON.stringify(merged), enabled: merged.enabled !== false, sort: nextSort } })
    const before = existing ? { ...json<Record<string, any>>(existing.payload, {}), id: existing.id, enabled: existing.enabled, sort: existing.sort } : null
    const after = { ...merged, enabled: item.enabled, sort: item.sort }
    await this.audit(actor, 'Banner维护', String(merged.title || bannerId), before, after)
    return { ...merged, enabled: item.enabled, sort: item.sort }
  }

  async removeBanner(bannerId: string, actor = 'admin') {
    const item = await this.db.banner.findUnique({ where: { id: bannerId } })
    if (!item) throw new NotFoundException('Banner不存在')
    await this.db.banner.delete({ where: { id: bannerId } })
    const view: Record<string, any> = { ...json<Record<string, any>>(item.payload, {}), id: item.id }
    await this.audit(actor, 'Banner删除', String(view.title || bannerId), { ...view, enabled: item.enabled, sort: item.sort }, null)
    return view
  }

  async saveCourse(payload: Record<string, any>, actor = 'admin', requireExisting = false) {
    const courseId = String(payload.id || id('course'))
    const existing = await this.db.course.findUnique({ where: { id: courseId } })
    if (requireExisting && !existing) throw new NotFoundException('课程不存在')
    const source: Record<string, any> = { title: '新建课程', subtitle: '', category: '综合管理', date: '2026-12-01 09:00', location: '待定', instructor: '待定', image: null, price: 0, originalPrice: 0, specialPrice: null, specialPriceEndsAt: null, allowMultiParticipant: true, maxParticipantsPerOrder: null, registrationStartAt: null, registrationEndAt: null, registrationDeadline: null, capacity: 30, enrolled: 0, status: '报名中', description: '', descriptionRichText: '', registrationTemplateId: null, ...existing, ...payload }
    const registrationTemplateId = String(source.registrationTemplateId || '').trim()
    if (!registrationTemplateId) throw new BadRequestException('课程必须关联一个已创建的报名模板')
    if (!(await this.db.registrationTemplate.findUnique({ where: { id: registrationTemplateId }, select: { id: true } }))) throw new BadRequestException('关联报名模板不存在')
    if (!['待发布', '报名中', '名额紧张', '已结束', '已下架'].includes(String(source.status))) throw new BadRequestException('课程状态不合法')
    if (source.registrationStartAt && parseDateValue(source.registrationStartAt) === null) throw new BadRequestException('报名开始时间格式不合法')
    if (source.registrationEndAt && parseDateValue(source.registrationEndAt) === null) throw new BadRequestException('报名结束时间格式不合法')
    if (source.registrationDeadline && parseDateValue(source.registrationDeadline) === null) throw new BadRequestException('报名截止时间格式不合法')
    if (source.registrationStartAt && source.registrationEndAt && Number(parseDateValue(source.registrationStartAt)) > Number(parseDateValue(source.registrationEndAt))) throw new BadRequestException('报名开始时间不能晚于结束时间')
    if (source.specialPriceEndsAt && parseDateValue(source.specialPriceEndsAt) === null) throw new BadRequestException('特价有效期格式不合法')
    const maxParticipantsPerOrder = source.maxParticipantsPerOrder === '' || source.maxParticipantsPerOrder == null ? null : Number(source.maxParticipantsPerOrder)
    if (maxParticipantsPerOrder !== null && (!Number.isInteger(maxParticipantsPerOrder) || maxParticipantsPerOrder < 1)) throw new BadRequestException('单次报名人数上限必须是不小于 1 的整数')
    const title = String(source.title || '').trim()
    const category = String(source.category || '').trim()
    const date = String(source.date || '').trim()
    const location = String(source.location || '').trim()
    const instructor = String(source.instructor || '').trim()
    if (!title || !category || !date || !location || !instructor) throw new BadRequestException('课程标题、分类、时间、地点和讲师不能为空')
    const normalizedCategory = normalizeCourseCategory(category)
    if (!normalizedCategory) throw new BadRequestException('课程分类不合法，请从系统数字字典中选择')
    const price = Number(source.price)
    const originalPrice = source.originalPrice === '' || source.originalPrice == null ? null : Number(source.originalPrice)
    const specialPrice = source.specialPrice === '' || source.specialPrice == null ? null : Number(source.specialPrice)
    const capacity = Number(source.capacity)
    const requestedEnrolled = Number(source.enrolled || 0)
    if (!Number.isFinite(price) || price < 0 || (originalPrice !== null && (!Number.isFinite(originalPrice) || originalPrice < 0)) || (specialPrice !== null && (!Number.isFinite(specialPrice) || specialPrice < 0))) throw new BadRequestException('课程价格必须是非负数字')
    if (!Number.isInteger(capacity) || capacity < 0 || !Number.isInteger(requestedEnrolled) || requestedEnrolled < 0) throw new BadRequestException('课程名额和已报名人数必须是非负整数')
    if (existing && payload.enrolled !== undefined && requestedEnrolled !== Number(existing.enrolled || 0)) throw new BadRequestException('已报名人数由报名数据维护，不能手动修改')
    if (requestedEnrolled > capacity) throw new BadRequestException('已报名人数不能超过名额')
    if (!existing && requestedEnrolled !== 0) throw new BadRequestException('新课程的已报名人数必须为 0')
    const enrolled = existing ? Number(existing.enrolled || 0) : 0
    if (enrolled > capacity) throw new BadRequestException('课程名额不能小于当前已报名人数')
    const richDescription = sanitizeRichText(source.descriptionRichText || source.description)
    const registrationEndAt = source.registrationEndAt ? String(source.registrationEndAt).trim() : null
    const data = { title, subtitle: String(source.subtitle || '').trim(), category: normalizedCategory, date, location, instructor, image: source.image ? String(source.image) : null, price, originalPrice, specialPrice, specialPriceEndsAt: source.specialPriceEndsAt ? String(source.specialPriceEndsAt).trim() : null, allowMultiParticipant: source.allowMultiParticipant !== false, maxParticipantsPerOrder, registrationStartAt: source.registrationStartAt ? String(source.registrationStartAt).trim() : null, registrationEndAt, registrationDeadline: registrationEndAt || (source.registrationDeadline ? String(source.registrationDeadline).trim() : null), capacity, enrolled, status: String(source.status), description: richDescription, registrationTemplateId }
    const item = await this.db.course.upsert({ where: { id: courseId }, create: { id: courseId, ...data }, update: data })
    await this.audit(actor, '课程维护', item.title, existing ? this.courseView(existing) : null, this.courseView(item))
    return this.courseView(item)
  }

  async removeCourse(courseId: string, actor = 'admin') {
    const item = await this.db.course.findUnique({ where: { id: courseId } })
    if (!item) throw new NotFoundException('课程不存在')
    if (await this.db.order.count({ where: { courseId } })) throw new BadRequestException('已有订单的课程不能删除，可改为已结束')
    await this.db.course.delete({ where: { id: courseId } })
    await this.audit(actor, '课程删除', item.title, this.courseView(item), null)
    return this.courseView(item)
  }

  async listTemplates() {
    const items = await this.db.registrationTemplate.findMany({ include: { courses: { select: { id: true, title: true, status: true } } }, orderBy: { updatedAt: 'desc' } })
    return items.map((item) => ({ id: item.id, name: item.name, version: item.version, enabled: item.enabled !== false, courseCount: item.courses.length, courseIds: item.courses.map(course => course.id), courseNames: item.courses.map(course => course.title), courses: item.courses, locked: item.courses.some(course => REGISTRATION_OPEN_STATUSES.has(String(course.status))), fields: json<RegistrationField[]>(item.payload, []) }))
  }

  async saveTemplate(templateId: string | undefined, payload: { name?: string; fields?: RegistrationField[]; enabled?: boolean }, actor = 'admin', requireExisting = false) {
    const fields = Array.isArray(payload.fields) ? payload.fields.map((field) => ({
      ...field,
      key: String(field?.key || '').trim(),
      label: String(field?.label || '').trim(),
      type: field?.type,
      required: field?.required === true,
      options: Array.isArray(field?.options) ? field.options.map(String).map((option) => option.trim()).filter(Boolean) : undefined,
      maxLength: field?.maxLength === undefined || field?.maxLength === null ? undefined : Number(field.maxLength),
      maxSelect: field?.maxSelect === undefined || field?.maxSelect === null ? undefined : Number(field.maxSelect),
    })) : payload.fields
    if (!Array.isArray(fields) || !fields.length) throw new BadRequestException('报名模板至少包含一个字段')
    const keys = new Set<string>()
    for (const field of fields) {
      if (!field?.key || !field?.label || !['text', 'phone', 'select', 'radio', 'checkbox'].includes(field.type)) throw new BadRequestException('报名模板字段配置不完整')
      if (keys.has(field.key)) throw new BadRequestException(`报名模板字段 ${field.key} 重复`)
      if (['select', 'radio', 'checkbox'].includes(field.type) && !field.options?.length) throw new BadRequestException(`报名模板字段 ${field.label} 至少需要一个选项`)
      if (field.maxLength !== undefined && (!Number.isInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 1000)) throw new BadRequestException(`报名模板字段 ${field.label} 的文本长度限制必须是 1 到 1000 的整数`)
      if (field.maxSelect !== undefined && (field.type !== 'checkbox' || !Number.isInteger(field.maxSelect) || field.maxSelect < 1 || (field.options?.length || 0) < field.maxSelect)) throw new BadRequestException(`报名模板字段 ${field.label} 的选择数量限制必须在 1 到选项数量之间`)
      keys.add(field.key)
    }
    const idValue = String(templateId || id('tpl'))
    const current = await this.db.registrationTemplate.findUnique({ where: { id: idValue } })
    if (requireExisting && !current) throw new NotFoundException('报名模板不存在')
    if (current) {
      const linkedCourses = await this.db.course.findMany({ where: { registrationTemplateId: idValue }, select: { id: true, status: true } })
      if (linkedCourses.some(course => REGISTRATION_OPEN_STATUSES.has(String(course.status)))) throw new BadRequestException('该报名模板已关联报名中的课程，暂不可修改；请先结束或下架相关课程')
    }
    const name = String(payload.name || current?.name || '报名模板').trim()
    if (!name) throw new BadRequestException('报名模板名称不能为空')
    const enabled = typeof payload.enabled === 'boolean' ? payload.enabled : current?.enabled !== false
    const item = await this.db.registrationTemplate.upsert({ where: { id: idValue }, create: { id: idValue, name, version: 1, payload: JSON.stringify(fields), enabled }, update: { name, version: { increment: 1 }, payload: JSON.stringify(fields), enabled } })
    await this.audit(actor, '报名模板维护', `${name} v${item.version}`, { id: item.id, name: current?.name, version: current?.version, enabled: current?.enabled !== false, fields: current ? json<RegistrationField[]>(current.payload, []) : undefined }, { id: item.id, name: item.name, version: item.version, enabled: item.enabled !== false, fields })
    return { id: item.id, name: item.name, version: item.version, enabled: item.enabled !== false, fields }
  }

  async setTemplateEnabled(templateId: string, enabled: boolean, actor = 'admin') {
    const desired = Boolean(enabled)
    const current = await this.db.registrationTemplate.findUnique({ where: { id: templateId } })
    if (!current) throw new NotFoundException('报名模板不存在')
    const updated = await this.db.registrationTemplate.updateMany({
      where: { id: templateId, enabled: { not: desired } },
      data: { enabled: desired },
    })
    if (updated.count !== 1) throw new BadRequestException(`报名模板已经是${desired ? '启用' : '停用'}状态`)
    const item = await this.db.registrationTemplate.findUniqueOrThrow({ where: { id: templateId } })
    await this.audit(actor, desired ? '启用报名模板' : '停用报名模板', item.name, { id: current.id, enabled: current.enabled !== false }, { id: item.id, enabled: item.enabled !== false })
    return { id: item.id, name: item.name, enabled: item.enabled !== false }
  }

  async removeTemplate(templateId: string, actor = 'admin') {
    const item = await this.db.registrationTemplate.findUnique({ where: { id: templateId }, include: { courses: { select: { id: true, title: true } }, versions: { select: { id: true } } } })
    if (!item) throw new NotFoundException('报名模板不存在')
    if (item.courses.length) throw new BadRequestException(`报名模板仍被 ${item.courses.length} 门课程使用，不能删除`)
    if (item.versions.length) throw new BadRequestException('报名模板已有报名历史版本，不能删除')
    await this.db.registrationTemplate.delete({ where: { id: templateId } })
    await this.audit(actor, '报名模板删除', `${item.name} ${templateId}`)
    return { id: templateId, deleted: true }
  }

  async listEnrollments() {
    const orders = await this.db.order.findMany({
      include: {
        course: true,
        user: { select: { id: true, username: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return orders.flatMap((order) => json<Array<Record<string, string>>>(order.participants, []).map((data, index) => ({
      id: `${order.id}-${index + 1}`,
      orderId: order.id,
      accountUserId: order.userId,
      accountUsername: order.user.username,
      accountUserName: order.user.name || order.user.username,
      courseId: order.courseId,
      courseTitle: order.course.title,
      paymentStatus: order.status,
      ...data,
    })))
  }

  async listEnrollmentSummary() {
    const [courses, orders] = await Promise.all([this.db.course.findMany({ orderBy: { createdAt: 'asc' } }), this.db.order.findMany()])
    return courses.map((course) => { const related = orders.filter((order) => order.courseId === course.id); return { courseId: course.id, courseTitle: course.title, registrationDeadline: course.registrationDeadline || course.date, enrollmentCount: related.filter((order) => order.status !== '已取消').reduce((sum, order) => sum + order.participantCount, 0), paidCount: related.filter((order) => order.status === '已支付').reduce((sum, order) => sum + order.participantCount, 0), unpaidCount: related.filter((order) => order.status !== '已取消' && order.status !== '已支付').reduce((sum, order) => sum + order.participantCount, 0) } })
  }

  async reconcileStudentDomain() {
    const [orders, enrollments, courses] = await Promise.all([
      this.db.order.findMany({ select: { id: true, courseId: true, status: true, participantCount: true, participants: true } }),
      this.db.enrollment.findMany({ select: { id: true, orderId: true, courseId: true, status: true } }),
      this.db.course.findMany({ select: { id: true, title: true, enrolled: true } }),
    ])
    const byOrder = new Map<string, typeof enrollments>()
    for (const enrollment of enrollments) if (enrollment.orderId) byOrder.set(enrollment.orderId, [...(byOrder.get(enrollment.orderId) || []), enrollment])
    const orderDiffs = orders.flatMap((order) => {
      const oldCount = json<Array<Record<string, any>>>(order.participants, []).length
      const rows = byOrder.get(order.id) || []
      const statusMismatch = order.status === '已取消' ? rows.some((row) => row.status !== 'cancelled') : rows.some((row) => row.status === 'cancelled')
      return oldCount !== rows.length || statusMismatch ? [{ orderId: order.id, courseId: order.courseId, oldCount, newCount: rows.length, orderStatus: order.status, enrollmentStatuses: rows.map((row) => row.status), reason: oldCount !== rows.length ? 'COUNT_MISMATCH' : 'STATUS_MISMATCH' }] : []
    })
    const courseDiffs = courses.flatMap((course) => {
      const relatedOrders = orders.filter((order) => order.courseId === course.id)
      const oldCount = relatedOrders.filter((order) => order.status !== '已取消').reduce((sum, order) => sum + order.participantCount, 0)
      const newCount = enrollments.filter((row) => row.courseId === course.id && row.status !== 'cancelled').length
      return oldCount === newCount ? [] : [{ courseId: course.id, courseTitle: course.title, storedEnrolled: course.enrolled, oldCount, newCount, reason: 'COURSE_COUNT_MISMATCH' }]
    })
    const paidDiffs = orders.flatMap((order) => {
      const expectedPaid = order.status === '已支付'
      const rows = byOrder.get(order.id) || []
      const hasActive = rows.some((row) => row.status !== 'cancelled')
      return expectedPaid && !hasActive ? [{ orderId: order.id, reason: 'PAID_WITHOUT_ACTIVE_ENROLLMENT' }] : []
    })
    return {
      generatedAt: new Date().toISOString(),
      readMode: await this.getStudentReadMode(),
      totals: { orders: orders.length, enrollments: enrollments.length, orderParticipants: orders.reduce((sum, order) => sum + json<Array<any>>(order.participants, []).length, 0), activeEnrollments: enrollments.filter((row) => row.status !== 'cancelled').length },
      differences: { orderDiffs, courseDiffs, paidDiffs, total: orderDiffs.length + courseDiffs.length + paidDiffs.length },
      canSwitch: orderDiffs.length === 0 && courseDiffs.length === 0 && paidDiffs.length === 0,
    }
  }

  async getStudentReadMode(): Promise<'legacy' | 'new'> {
    const item = await this.db.systemConfig.findUnique({ where: { key: 'student.readMode' } })
    return item?.value === 'new' ? 'new' : 'legacy'
  }

  async setStudentReadMode(mode: 'legacy' | 'new', actor = 'admin') {
    if (!['legacy', 'new'].includes(mode)) throw new BadRequestException('学员读取模式只能是 legacy 或 new')
    if (mode === 'new') {
      const report = await this.reconcileStudentDomain()
      if (!report.canSwitch) throw new BadRequestException(`对账存在 ${report.differences.total} 项差异，暂不能切换新读`)
    }
    const item = await this.db.systemConfig.upsert({ where: { key: 'student.readMode' }, create: { key: 'student.readMode', value: mode, description: '学员档案/报名明细兼容期读取模式' }, update: { value: mode, description: '学员档案/报名明细兼容期读取模式' } })
    await this.audit(actor, '学员读取模式切换', mode)
    return { mode: item.value as 'legacy' | 'new', updatedAt: item.updatedAt.toISOString(), rollbackAvailable: true }
  }

  async listCompatEnrollments() {
    if ((await this.getStudentReadMode()) !== 'new') return this.listEnrollments()
    const pageSize = 100
    const firstPage = await this.listEnrollmentRecords(undefined, undefined, 1, pageSize)
    const items = [...firstPage.items]
    const totalPages = Math.min(Math.ceil(firstPage.total / pageSize), 100)
    for (let page = 2; page <= totalPages; page += 1) {
      const nextPage = await this.listEnrollmentRecords(undefined, undefined, page, pageSize)
      items.push(...nextPage.items)
    }
    return items.slice(0, 10000).map((item) => ({ ...item, paymentStatus: item.orderStatus || (item.status === 'cancelled' ? '已取消' : '待支付') }))
  }
  async listCompatStudents() { return (await this.getStudentReadMode()) === 'new' ? (await this.listStudentProfilesPage(undefined, undefined, 1, 10000, false)).items : this.listStudents() }

  async cancelOrder(userId: string, orderId: string) {
    const beforeOrder = await this.db.order.findFirst({ where: { id: orderId, userId }, select: { id: true, status: true } })
    const item = await this.db.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId, userId } })
      if (!order) throw new NotFoundException('订单不存在')
      if (order.status === '已支付') throw new BadRequestException('已支付订单请申请退款')
      if (order.status === '已取消') throw new BadRequestException('订单已经取消，不能重复操作')
      await tx.course.update({ where: { id: order.courseId }, data: { enrolled: { decrement: Math.min(order.participantCount, (await tx.course.findUniqueOrThrow({ where: { id: order.courseId } })).enrolled) } } })
      const updated = await tx.order.update({ where: { id: orderId }, data: { status: '已取消' }, include: { course: true, paymentProofs: { orderBy: { createdAt: 'desc' }, take: 1 } } })
      await tx.enrollment.updateMany({ where: { orderId }, data: { status: 'cancelled', cancelledAt: new Date() } })
      return updated
    })
    await this.audit(userId, '取消报名', orderId, beforeOrder ? { id: beforeOrder.id, status: beforeOrder.status } : null, { id: orderId, status: item.status })
    return this.orderView(item)
  }

  /**
   * 管理端关闭尚未支付的订单。
   *
   * 当前项目将取消、退款统一落到“已取消”终态，具体原因通过审计动作区分。
   * 关闭待支付订单必须回补已占用名额，并同步取消报名履历；重复关闭不允许
   * 再次产生副作用。
   */
  async closeUnpaidOrder(orderId: string, actor = 'admin') {
    const beforeOrder = await this.db.order.findUnique({ where: { id: orderId }, select: { id: true, status: true } })
    const result = await this.db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } })
      if (!order) throw new NotFoundException('订单不存在')
      if (order.status !== '待支付') throw new BadRequestException('只有待支付订单可以关闭')
      const course = await tx.course.findUniqueOrThrow({ where: { id: order.courseId } })
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: '已取消' },
        include: { course: true, paymentProofs: { orderBy: { createdAt: 'desc' }, take: 1 } },
      })
      await tx.course.update({ where: { id: order.courseId }, data: { enrolled: Math.max(0, course.enrolled - order.participantCount) } })
      await tx.enrollment.updateMany({ where: { orderId }, data: { status: 'cancelled', cancelledAt: new Date() } })
      return updated
    })
    await this.audit(actor, '关闭待支付订单', orderId, beforeOrder ? { id: beforeOrder.id, status: beforeOrder.status } : null, { id: orderId, status: result.status })
    return this.orderView(result)
  }

  async reviewOffline(orderId: string, approved: boolean, remark = '', actor = 'admin') {
    const beforeOrder = await this.db.order.findUnique({ where: { id: orderId }, select: { id: true, status: true } })
    const result = await this.db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } })
      if (!order) throw new NotFoundException('订单不存在')
      if (order.status !== '待审核') throw new BadRequestException('只有待审核订单可以审核支付凭证')
      const proof = await tx.paymentProof.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } })
      if (!proof) throw new BadRequestException('订单没有可审核的支付凭证')
      if (proof.status !== 'pending') throw new BadRequestException('该支付凭证已经审核，不能重复处理')
      await tx.paymentProof.update({ where: { id: proof.id }, data: { status: approved ? 'approved' : 'rejected', remark, reviewedAt: new Date() } })
      return tx.order.update({ where: { id: orderId }, data: { status: approved ? '已支付' : '待支付' }, include: { course: true, paymentProofs: { orderBy: { createdAt: 'desc' }, take: 1 } } })
    })
    await this.audit(actor, approved ? '线下支付审核通过' : '线下支付驳回', `${orderId} ${remark}`, beforeOrder ? { id: beforeOrder.id, status: beforeOrder.status } : null, { id: orderId, status: result.status, remark })
    return this.orderView(result)
  }

  async refundOrder(orderId: string, actor = 'admin') {
    const beforeOrder = await this.db.order.findUnique({ where: { id: orderId }, select: { id: true, status: true } })
    const result = await this.db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } })
      if (!order) throw new NotFoundException('订单不存在')
      if (order.status !== '已支付') throw new BadRequestException('只有已支付订单可以退款')
      const course = await tx.course.findUniqueOrThrow({ where: { id: order.courseId } })
      await tx.course.update({ where: { id: order.courseId }, data: { enrolled: Math.max(0, course.enrolled - order.participantCount) } })
      const updated = await tx.order.update({ where: { id: orderId }, data: { status: '已取消' }, include: { course: true, paymentProofs: { orderBy: { createdAt: 'desc' }, take: 1 } } })
      await tx.enrollment.updateMany({ where: { orderId }, data: { status: 'cancelled', cancelledAt: new Date() } })
      return updated
    })
    await this.audit(actor, '退款完成', orderId, beforeOrder ? { id: beforeOrder.id, status: beforeOrder.status } : null, { id: orderId, status: result.status })
    return this.orderView(result)
  }

  async listInvoices(userId?: string) {
    const items = await this.db.invoice.findMany({ where: userId ? { userId } : {}, orderBy: { createdAt: 'desc' } })
    return items.map((item) => this.invoiceView(item))
  }

  async listInvoicesPage(userId?: string, keyword?: string, page = 1, pageSize = 20, status?: string) {
    const args = pageArgs(page, pageSize)
    const where = { ...(userId ? { userId } : {}), ...(status ? { status } : {}), ...(keyword ? { OR: [{ id: { contains: keyword } }, { payload: { contains: keyword } }] } : {}) }
    const [items, total] = await this.db.$transaction([this.db.invoice.findMany({ where, orderBy: { createdAt: 'desc' }, skip: args.skip, take: args.take }), this.db.invoice.count({ where })])
    return { items: items.map((item) => this.invoiceView(item)), page: args.page, pageSize: args.pageSize, total }
  }

  async processInvoice(invoiceId: string, status: '已开票' | '已驳回', invoiceNo = '', actor = 'admin', rejectReason = '') {
    const current = await this.db.invoice.findUnique({ where: { id: invoiceId } })
    if (!current) throw new NotFoundException('开票申请不存在')
    if (current.status !== '待处理') throw new BadRequestException('只有待处理的开票申请可以处理')
    if (status === '已开票' && !String(invoiceNo || '').trim()) throw new BadRequestException('开票通过必须填写发票号码')
    if (status === '已驳回' && !String(rejectReason || '').trim()) throw new BadRequestException('驳回开票申请必须填写驳回理由')
    const payload = { ...json<Record<string, any>>(current.payload, {}), invoiceNo: status === '已开票' ? String(invoiceNo || '').trim() : '', rejectReason: status === '已驳回' ? String(rejectReason || '').trim() : null, invoiceFileStatus: status === '已开票' ? '待上传' : '不适用', invoiceFileName: null, invoiceFileUrl: null, invoiceFileUploadedAt: null }
    const item = await this.db.invoice.update({ where: { id: invoiceId }, data: { status, payload: JSON.stringify(payload), processedAt: new Date() } })
    await this.audit(actor, '开票处理', `${invoiceId} ${status}${status === '已驳回' ? ` ${String(rejectReason || '').trim()}` : ''}`, this.invoiceView(current), this.invoiceView(item))
    return this.invoiceView(item)
  }

  async uploadInvoiceFile(invoiceId: string, file: { originalname: string; mimetype: string; size: number; buffer: Buffer }, actor = 'admin') {
    const current = await this.db.invoice.findUnique({ where: { id: invoiceId } })
    if (!current) throw new NotFoundException('开票申请不存在')
    if (current.status !== '已开票') throw new BadRequestException('只有已开票申请可以上传发票文件')
    const currentPayload = json<Record<string, any>>(current.payload, {})
    if (currentPayload.invoiceFileStatus === '已上传') throw new BadRequestException('该开票申请已有发票文件，如需替换请先联系管理员')
    const max = Number(process.env.INVOICE_UPLOAD_MAX_BYTES || 10 * 1024 * 1024)
    if (!file.size || file.size > max) throw new BadRequestException(`发票文件大小必须在 1 字节到 ${Math.floor(max / 1024 / 1024)}MB 之间`)
    const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg'])
    if (!allowed.has(String(file.mimetype || '').toLowerCase())) throw new BadRequestException('发票文件仅支持 PDF、PNG 或 JPEG')
    const extension = extname(basename(file.originalname || '')).toLowerCase() || (file.mimetype === 'application/pdf' ? '.pdf' : '.jpg')
    const storedName = `invoice-${invoiceId}-${Date.now()}-${randomBytes(4).toString('hex')}${extension.replace(/[^a-z0-9.]/gi, '')}`
    const dir = resolve(process.env.UPLOAD_DIR || 'storage/payment-proofs', '..', 'invoices')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, storedName), file.buffer)
    const payload = {
      ...currentPayload,
      invoiceFileStatus: '已上传',
      invoiceFileName: basename(file.originalname || storedName),
      // The same protected user route is also readable by admins, while the
      // admin-only route must not be exposed to C-end clients.
      invoiceFileUrl: `/api/invoices/${encodeURIComponent(invoiceId)}/file`,
      invoiceFileUploadedAt: new Date().toISOString(),
      invoiceFileStoredName: storedName,
      invoiceFileMimeType: file.mimetype,
      invoiceFileSize: file.size,
    }
    const item = await this.db.invoice.update({ where: { id: invoiceId }, data: { payload: JSON.stringify(payload) } })
    await this.audit(actor, '上传电子发票文件', `${invoiceId} ${payload.invoiceFileName}`)
    return this.invoiceView(item)
  }

  async readInvoiceFile(invoiceId: string, userId?: string) {
    const invoice = await this.db.invoice.findUnique({ where: { id: invoiceId } })
    if (!invoice) throw new NotFoundException('开票申请不存在')
    if (userId && invoice.userId !== userId) throw new ForbiddenException('无权访问该发票文件')
    const payload = json<Record<string, any>>(invoice.payload, {})
    const storedName = basename(String(payload.invoiceFileStoredName || ''))
    if (!storedName) throw new NotFoundException('发票文件尚未上传')
    const filePath = resolve(process.env.UPLOAD_DIR || 'storage/payment-proofs', '..', 'invoices', storedName)
    if (!existsSync(filePath)) throw new NotFoundException('发票文件不存在')
    const mimeType = String(payload.invoiceFileMimeType || 'application/octet-stream')
    return { buffer: readFileSync(filePath), mimeType, originalName: basename(String(payload.invoiceFileName || storedName)) }
  }

  async getProfile(userId: string, revealPhone = true) {
    const user = await this.db.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('用户不存在')
    return { id: user.id, username: user.username, name: user.name, company: user.company, avatarText: user.avatarText, phone: revealPhone ? user.phone : maskPhone(user.phone), gender: user.gender, email: user.email, registeredAt: user.registeredAt.toISOString().slice(0, 10), lastLoginAt: user.lastLoginAt?.toISOString() || null, points: user.points, enabled: user.enabled, agreementRequired: user.agreementVersion !== AGREEMENT_VERSION }
  }

  async acceptAgreement(userId: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('用户不存在')
    const item = await this.db.user.update({ where: { id: userId }, data: { agreementVersion: AGREEMENT_VERSION, agreementAcceptedAt: new Date() } })
    await this.audit(userId, '同意用户协议', AGREEMENT_VERSION)
    return { agreementVersion: item.agreementVersion, agreementAcceptedAt: item.agreementAcceptedAt?.toISOString() || null, agreementRequired: false }
  }

  async updateProfile(userId: string, payload: Record<string, any>) {
    const current = await this.db.user.findUnique({ where: { id: userId } })
    if (!current) throw new NotFoundException('用户不存在')
    const name = payload.name !== undefined ? String(payload.name || '').trim() : current.name
    if (payload.name !== undefined && !name) throw new BadRequestException('姓名不能为空')
    const phone = payload.phone !== undefined ? normalizedPhone(payload.phone) : current.phone
    if (payload.phone !== undefined && phone && !/^1\d{10}$/.test(phone)) throw new BadRequestException('手机号格式不正确')
    if (phone) {
      const conflict = await this.db.user.findFirst({ where: { phone, id: { not: userId } }, select: { id: true } })
      if (conflict) throw new BadRequestException('手机号已绑定其他账号')
    }
    const email = payload.email !== undefined ? String(payload.email || '').trim().toLowerCase() : current.email
    if (payload.email !== undefined && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('邮箱格式不正确')
    if (email) {
      const conflict = await this.db.user.findFirst({ where: { email, id: { not: userId } }, select: { id: true } })
      if (conflict) throw new BadRequestException('邮箱已绑定其他账号')
    }
    const item = await this.db.user.update({ where: { id: userId }, data: {
      ...(payload.name !== undefined ? { name } : {}),
      ...(payload.company !== undefined ? { company: String(payload.company).trim() } : {}),
      ...(payload.phone !== undefined ? { phone: phone || null } : {}),
      ...(payload.gender !== undefined ? { gender: String(payload.gender).trim() || null } : {}),
      ...(payload.email !== undefined ? { email: email || null } : {}),
      ...(payload.avatarText !== undefined ? { avatarText: String(payload.avatarText).slice(0, 2) } : {}),
    } })
    await this.audit(userId, '个人资料更新', item.name || item.username)
    return this.getProfile(userId)
  }

  async changePassword(userId: string, oldPassword?: string, password?: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('用户不存在')
    if (typeof oldPassword !== 'string' || !passwordMatches(oldPassword, user.passwordHash)) throw new BadRequestException('原密码不正确')
    if (password === oldPassword) throw new BadRequestException('新密码不能与原密码一致')
    if (typeof password !== 'string' || !isValidPassword(password)) throw new BadRequestException(PASSWORD_POLICY_MESSAGE)
    await this.db.setPassword(userId, password)
    await this.db.revokeRefreshTokens(userId)
    await this.audit(userId, '修改密码', 'password hash updated')
    return { success: true }
  }

  async listUsersPage(keyword?: string, page = 1, pageSize = 20, role?: string, status?: string) {
    const args = pageArgs(page, pageSize)
    const enabled = status === 'enabled' ? true : status === 'disabled' ? false : undefined
    const where = {
      ...(role ? { role } : {}),
      ...(enabled === undefined ? {} : { enabled }),
      ...(keyword ? { OR: [{ id: { contains: keyword } }, { username: { contains: keyword } }, { usernameNormalized: { contains: keyword.trim().toLowerCase() } }, { name: { contains: keyword } }, { phone: { contains: keyword } }, { company: { contains: keyword } }, { email: { contains: keyword } }] } : {}),
    }
    const [items, total] = await this.db.$transaction([this.db.user.findMany({ where, orderBy: { createdAt: 'asc' }, skip: args.skip, take: args.take }), this.db.user.count({ where })])
    const views = await Promise.all(items.map(async (item) => {
      const [courseCount, previewCount, latestOrder, latestPreview] = await Promise.all([
        this.db.order.count({ where: { userId: item.id } }),
        this.db.preview.count({ where: { userId: item.id } }),
        this.db.order.findFirst({ where: { userId: item.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
        this.db.preview.findFirst({ where: { userId: item.id }, orderBy: { viewedAt: 'desc' }, select: { viewedAt: true } }),
      ])
      const activityDates = [item.updatedAt, latestOrder?.createdAt, latestPreview?.viewedAt].filter(Boolean).map(value => new Date(value as Date).getTime())
      return { ...(await this.getProfile(item.id, false)), role: item.role, courseCount, previewCount, lastActiveAt: new Date(Math.max(...activityDates)).toISOString() }
    }))
    return { items: views, page: args.page, pageSize: args.pageSize, total }
  }

  async getUserDetail(userId: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('用户不存在')
    const orders = await this.db.order.findMany({ where: { userId }, include: { course: true, paymentProofs: { orderBy: { createdAt: 'desc' }, take: 1 }, paymentTransactions: { orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'desc' } })
    return {
      ...(await this.getProfile(userId)),
      role: user.role,
      orders: orders.map((order) => ({
        ...this.orderView(order),
        paymentTransactions: order.paymentTransactions.map((item) => ({ id: item.id, channel: item.channel, provider: item.provider, outTradeNo: item.outTradeNo, providerTradeNo: item.providerTradeNo, amount: item.amount, status: item.status, paidAt: item.paidAt?.toISOString() || null, createdAt: item.createdAt.toISOString() })),
      })),
    }
  }

  async setUserEnabled(userId: string, enabled: boolean, actor = 'admin') {
    const current = await this.db.user.findUnique({ where: { id: userId } })
    if (!current) throw new NotFoundException('用户不存在')
    if (!enabled && isAdminRole(current.role)) {
      if (current.username === actor) throw new BadRequestException('不能停用当前登录的管理员账号')
      const enabledAdminCount = await this.db.user.count({ where: { role: { in: ['admin', 'operator'] }, enabled: true } })
      if (enabledAdminCount <= 1) throw new BadRequestException('不能停用最后一个启用的管理员账号')
    }
    const item = await this.db.user.update({ where: { id: userId }, data: { enabled: Boolean(enabled), sessionVersion: { increment: 1 } } })
    if (!enabled) await this.db.revokeRefreshTokens(userId)
    await this.audit(actor, enabled ? '启用用户' : '禁用用户', item.username, { id: current.id, username: current.username, enabled: current.enabled }, { id: item.id, username: item.username, enabled: item.enabled })
    return this.getProfile(userId)
  }

  async resetUserPassword(userId: string, actor = 'admin', newPassword?: string) {
    const item = await this.db.user.findUnique({ where: { id: userId } })
    if (!item) throw new NotFoundException('用户不存在')
    const password = newPassword && String(newPassword).trim().length > 0 ? String(newPassword) : `Temp-${randomBytes(6).toString('hex')}`
    if (newPassword && !isValidPassword(String(newPassword))) throw new BadRequestException(PASSWORD_POLICY_MESSAGE)
    await this.db.setPassword(userId, password)
    await this.db.revokeRefreshTokens(userId)
    await this.audit(actor, '重置用户密码', `${item.username} -> ${newPassword ? 'custom password' : 'temporary password'}`, { id: item.id, username: item.username, mustChangePassword: false }, { id: item.id, username: item.username, resetPerformed: true })
    return { id: userId, username: item.username, resetPassword: newPassword ? '' : password }
  }

  async listStudents() { return this.listEnrollments() }

  private enrollmentView(item: any, reveal = false) {
    return {
      id: item.id,
      studentId: item.studentId,
      name: item.student.name,
      phone: reveal ? item.student.phone : maskPhone(item.student.phone),
      company: item.student.company,
      department: item.student.department,
      position: item.student.position,
      courseId: item.courseId,
      courseTitle: item.course.title,
      date: item.course.date,
      location: item.course.location,
      orderId: item.orderId,
      orderStatus: item.order?.status || null,
      paymentMethod: item.order?.paymentMethod || null,
      paymentChannel: item.order?.paymentChannel || null,
      amount: item.order?.amount || 0,
      accountUserId: item.accountUserId,
      accountUsername: item.accountUser.username,
      accountUserName: item.accountUser.name || item.accountUser.username,
      status: item.status,
      templateId: item.templateVersionRef?.templateId || null,
      templateVersion: item.templateVersion,
      ...(reveal ? { formPayload: json<Record<string, any>>(item.formPayload, {}) } : {}),
      registeredAt: item.registeredAt.toISOString(),
      cancelledAt: item.cancelledAt?.toISOString() || null,
    }
  }

  private studentView(student: any, reveal = false) {
    return {
      id: student.id,
      name: student.name,
      phone: reveal ? student.phone : maskPhone(student.phone),
      phoneNormalized: reveal ? student.phoneNormalized : undefined,
      gender: student.gender,
      email: reveal ? student.email : (student.email ? `${String(student.email).slice(0, 2)}***` : null),
      company: student.company,
      department: student.department,
      position: student.position,
      status: student.status,
      mergedIntoId: student.mergedIntoId,
      createdAt: new Date(student.createdAt).toISOString(),
      updatedAt: new Date(student.updatedAt).toISOString(),
      accountRelations: student.accountRelations?.map((relation: any) => ({ id: relation.id, userId: relation.userId, username: relation.user?.username, userName: relation.user?.name, relationType: relation.relationType, isDefault: relation.isDefault, status: relation.status })) || [],
      enrollmentCount: student._count?.enrollments ?? student.enrollments?.length ?? 0,
    }
  }

  async listEnrollmentRecords(keyword?: string, status?: string, page = 1, pageSize = 20, courseId?: string) {
    const args = pageArgs(page, pageSize)
    const where: any = {
      ...(status ? { status } : {}),
      ...(courseId ? { courseId } : {}),
      ...(keyword ? { OR: [{ id: { contains: keyword } }, { orderId: { contains: keyword } }, { student: { name: { contains: keyword } } }, { student: { phoneNormalized: { contains: normalizedPhone(keyword) || keyword } } }, { course: { title: { contains: keyword } } }] } : {}),
    }
    const [items, total] = await this.db.$transaction([
      this.db.enrollment.findMany({ where, include: { student: true, course: { select: { id: true, title: true, date: true, location: true } }, order: { select: { id: true, status: true, paymentMethod: true, paymentChannel: true, amount: true } }, accountUser: { select: { id: true, username: true, name: true } }, templateVersionRef: { select: { templateId: true, version: true } } }, orderBy: { registeredAt: 'desc' }, skip: args.skip, take: args.take }),
      this.db.enrollment.count({ where }),
    ])
    return { items: items.map((item) => this.enrollmentView(item)), page: args.page, pageSize: args.pageSize, total }
  }

  async getEnrollmentRecord(enrollmentId: string, reveal = false, actor = '') {
    const item = await this.db.enrollment.findUnique({ where: { id: enrollmentId }, include: { student: true, course: { select: { id: true, title: true, date: true, location: true } }, order: { select: { id: true, status: true, paymentMethod: true, paymentChannel: true, amount: true } }, accountUser: { select: { id: true, username: true, name: true } }, templateVersionRef: { select: { templateId: true, version: true } } } })
    if (!item) throw new NotFoundException('报名履历不存在')
    if (actor) await this.audit(actor, '查看报名履历', enrollmentId)
    return this.enrollmentView(item, reveal)
  }

  async listStudentProfilesPage(keyword?: string, status?: string, page = 1, pageSize = 20, reveal = false) {
    const args = pageArgs(page, pageSize)
    const where: any = {
      ...(status ? { status } : {}),
      ...(keyword ? { OR: [{ id: { contains: keyword } }, { name: { contains: keyword } }, { phoneNormalized: { contains: normalizedPhone(keyword) || keyword } }, { company: { contains: keyword } }] } : {}),
    }
    const [items, total] = await this.db.$transaction([
      this.db.student.findMany({ where, include: { accountRelations: { where: { status: 'active' }, include: { user: { select: { username: true, name: true } } } }, _count: { select: { enrollments: true } } }, orderBy: { updatedAt: 'desc' }, skip: args.skip, take: args.take }),
      this.db.student.count({ where }),
    ])
    return { items: items.map((item) => this.studentView(item, reveal)), page: args.page, pageSize: args.pageSize, total }
  }

  async getStudentProfile(studentId: string, reveal = false, actor = '') {
    const student = await this.db.student.findUnique({ where: { id: studentId }, include: { accountRelations: { where: { status: 'active' }, include: { user: { select: { id: true, username: true, name: true } } } }, _count: { select: { enrollments: true } } } })
    if (!student) throw new NotFoundException('学员档案不存在')
    if (actor) await this.audit(actor, '查看学员档案', studentId)
    return this.studentView(student, reveal)
  }

  async exportStudentProfiles(keyword?: string, status?: string, reveal = false, actor = 'admin', limit = 1000) {
    const take = Math.min(1000, Math.max(1, Number(limit) || 1000))
    const where: any = {
      ...(status ? { status } : {}),
      ...(keyword ? { OR: [{ id: { contains: keyword } }, { name: { contains: keyword } }, { phoneNormalized: { contains: normalizedPhone(keyword) || keyword } }, { company: { contains: keyword } }] } : {}),
    }
    const [items, total] = await this.db.$transaction([
      this.db.student.findMany({ where, include: { accountRelations: { where: { status: 'active' }, include: { user: { select: { username: true, name: true } } } }, _count: { select: { enrollments: true } } }, orderBy: { updatedAt: 'desc' }, take }),
      this.db.student.count({ where }),
    ])
    const exportedItems = items.map((item) => this.studentView(item, reveal))
    const truncated = total > exportedItems.length
    await this.audit(actor, '导出学员档案', `${exportedItems.length}/${total} 条，${reveal ? '明文' : '脱敏'}${truncated ? '，已截断' : ''}`)
    return { items: exportedItems, page: 1, pageSize: take, total, truncated, sensitiveFieldsMasked: !reveal, exportedAt: new Date().toISOString() }
  }

  async updateStudentProfile(studentId: string, payload: Record<string, any>, actor = 'admin') {
    const current = await this.db.student.findUnique({ where: { id: studentId } })
    if (!current) throw new NotFoundException('学员档案不存在')
    if (current.status === 'merged') throw new BadRequestException('已合并的学员档案不能继续编辑')
    if (payload.name !== undefined && !String(payload.name || '').trim()) throw new BadRequestException('学员姓名不能为空')
    const phone = payload.phone !== undefined ? normalizedPhone(payload.phone) : current.phoneNormalized
    if (payload.phone !== undefined && phone && !/^1\d{10}$/.test(phone)) throw new BadRequestException('手机号格式不正确')
    const email = payload.email !== undefined ? String(payload.email || '').trim() : current.email
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('邮箱格式不正确')
    if (phone) {
      const conflict = await this.db.student.findFirst({ where: { phoneNormalized: phone, id: { not: studentId }, status: { not: 'merged' } } })
      if (conflict) throw new BadRequestException('手机号已对应其他学员档案，请先执行合并')
    }
    const item = await this.db.student.update({ where: { id: studentId }, data: {
      ...(payload.name !== undefined ? { name: String(payload.name).trim() } : {}),
      ...(payload.phone !== undefined ? { phone: String(payload.phone).trim() || null, phoneNormalized: phone } : {}),
      ...(payload.gender !== undefined ? { gender: String(payload.gender).trim() || null } : {}),
      ...(payload.email !== undefined ? { email: email || null } : {}),
      ...(payload.company !== undefined ? { company: String(payload.company).trim() || null } : {}),
      ...(payload.department !== undefined ? { department: String(payload.department).trim() || null } : {}),
      ...(payload.position !== undefined ? { position: String(payload.position).trim() || null } : {}),
      ...(payload.extraPayload !== undefined ? { extraPayload: JSON.stringify(payload.extraPayload) } : {}),
    } })
    await this.audit(actor, '学员档案更新', `${studentId} ${item.name}`)
    return this.getStudentProfile(studentId, true)
  }

  async setStudentStatus(studentId: string, status: 'active' | 'inactive', actor = 'admin') {
    const current = await this.db.student.findUnique({ where: { id: studentId } })
    if (!current) throw new NotFoundException('学员档案不存在')
    if (current.status === 'merged') throw new BadRequestException('已合并的学员档案不能启停')
    const item = await this.db.student.update({ where: { id: studentId }, data: { status } })
    await this.audit(actor, status === 'active' ? '启用学员档案' : '停用学员档案', studentId)
    return this.getStudentProfile(item.id, true)
  }

  async listStudentRelationships(studentId: string) {
    const rows = await this.db.accountStudent.findMany({ where: { studentId }, include: { user: { select: { id: true, username: true, name: true, company: true } } }, orderBy: { createdAt: 'asc' } })
    return rows.map((item) => ({ id: item.id, userId: item.userId, username: item.user.username, userName: item.user.name, company: item.user.company, relationType: item.relationType, isDefault: item.isDefault, status: item.status, revokedAt: item.revokedAt?.toISOString() || null }))
  }

  async grantStudentRelationship(studentId: string, userId: string, relationType = '代理报名', actor = 'admin') {
    const [student, user] = await Promise.all([this.db.student.findUnique({ where: { id: studentId } }), this.db.user.findUnique({ where: { id: userId } })])
    if (!student) throw new NotFoundException('学员档案不存在')
    if (student.status === 'merged') throw new BadRequestException('已合并的学员档案不能授权账号')
    if (!user) throw new NotFoundException('账号不存在')
    const normalizedRelationType = String(relationType || '').trim()
    if (!normalizedRelationType) throw new BadRequestException('关系类型不能为空')
    const result = await this.db.$transaction(async (tx) => {
      await tx.accountStudent.updateMany({ where: { userId, studentId: { not: studentId }, isDefault: true }, data: { isDefault: false } })
      return tx.accountStudent.upsert({ where: { userId_studentId: { userId, studentId } }, create: { id: stableId('acct-stu', `${userId}:${studentId}`), userId, studentId, relationType: normalizedRelationType, isDefault: false, source: 'admin_granted', status: 'active', createdByUserId: actor }, update: { relationType: normalizedRelationType, status: 'active', revokedAt: null } })
    })
    await this.audit(actor, '授权学员关系', `${userId} -> ${studentId}`)
    return result
  }

  async revokeStudentRelationship(studentId: string, userId: string, actor = 'admin') {
    const relation = await this.db.accountStudent.findUnique({ where: { userId_studentId: { userId, studentId } } })
    if (!relation) throw new NotFoundException('账号与学员关系不存在')
    const item = await this.db.accountStudent.update({ where: { id: relation.id }, data: { status: 'revoked', isDefault: false, revokedAt: new Date() } })
    await this.audit(actor, '解除学员关系', `${userId} -> ${studentId}`)
    return item
  }

  async setDefaultStudentRelationship(studentId: string, userId: string, actor = 'admin') {
    const relation = await this.db.accountStudent.findUnique({ where: { userId_studentId: { userId, studentId } } })
    if (!relation || relation.status !== 'active') throw new BadRequestException('账号没有有效的学员关系')
    await this.db.$transaction(async (tx) => {
      await tx.accountStudent.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } })
      await tx.accountStudent.update({ where: { id: relation.id }, data: { isDefault: true } })
    })
    await this.audit(actor, '设置默认报名人', `${userId} -> ${studentId}`)
    return this.listStudentRelationships(studentId)
  }

  async listStudentEnrollments(studentId: string) {
    const rows = await this.db.enrollment.findMany({ where: { studentId }, include: { course: { select: { id: true, title: true } }, order: { select: { id: true, status: true, amount: true } }, templateVersionRef: { select: { templateId: true, version: true } } }, orderBy: { registeredAt: 'desc' } })
    return rows.map((item) => ({ id: item.id, courseId: item.courseId, courseTitle: item.course.title, orderId: item.orderId, orderStatus: item.order?.status || null, amount: item.order?.amount || 0, status: item.status, templateId: item.templateVersionRef?.templateId || null, templateVersion: item.templateVersion, formPayload: json<Record<string, any>>(item.formPayload, {}), registeredAt: item.registeredAt.toISOString(), cancelledAt: item.cancelledAt?.toISOString() || null }))
  }

  async matchStudentCandidates(payload: Record<string, any>) {
    const phone = normalizedPhone(payload.phone)
    const name = String(payload.name || '').trim()
    const company = String(payload.company || '').trim()
    const where: any = phone ? { phoneNormalized: phone } : { ...(name ? { name: { contains: name } } : {}), ...(company ? { company: { contains: company } } : {}) }
    if (!phone && !name && !company) throw new BadRequestException('至少提供手机号、姓名或公司之一')
    const items = await this.db.student.findMany({ where, include: { accountRelations: { where: { status: 'active' }, include: { user: { select: { username: true, name: true } } } }, _count: { select: { enrollments: true } } }, orderBy: { updatedAt: 'desc' }, take: 20 })
    return { items: items.map((item) => this.studentView(item, false)), matchedBy: phone ? 'phone' : 'name_or_company' }
  }

  async mergeStudents(sourceId: string, targetId: string, actor = 'admin') {
    if (sourceId === targetId) throw new BadRequestException('不能合并同一学员')
    const result = await this.db.$transaction(async (tx) => {
      const [source, target] = await Promise.all([tx.student.findUnique({ where: { id: sourceId }, include: { accountRelations: true } }), tx.student.findUnique({ where: { id: targetId } })])
      if (!source || !target) throw new NotFoundException('待合并学员不存在')
      if (source.status === 'merged') throw new BadRequestException('源学员已合并')
      if (target.status === 'merged') throw new BadRequestException('不能合并到已合并的目标档案')
      const sourceEnrollments = await tx.enrollment.findMany({ where: { studentId: sourceId }, select: { orderId: true, sourceParticipantIndex: true } })
      for (const item of sourceEnrollments) {
        if (item.orderId && await tx.enrollment.findFirst({ where: { studentId: targetId, orderId: item.orderId, sourceParticipantIndex: item.sourceParticipantIndex } })) throw new BadRequestException('合并后会产生重复报名履历，请人工处理')
      }
      for (const relation of source.accountRelations) {
        const existing = await tx.accountStudent.findUnique({ where: { userId_studentId: { userId: relation.userId, studentId: targetId } } })
        if (existing) await tx.accountStudent.update({ where: { id: relation.id }, data: { status: 'revoked', isDefault: false, revokedAt: new Date() } })
        else await tx.accountStudent.update({ where: { id: relation.id }, data: { studentId: targetId } })
      }
      await tx.enrollment.updateMany({ where: { studentId: sourceId }, data: { studentId: targetId } })
      return tx.student.update({ where: { id: sourceId }, data: { status: 'merged', mergedIntoId: targetId } })
    })
    await this.audit(actor, '合并学员档案', `${sourceId} -> ${targetId}`)
    return { sourceId: result.id, targetId, status: result.status }
  }

  async listAccountStudents(userId: string) {
    const rows = await this.db.accountStudent.findMany({ where: { userId, status: 'active', student: { status: { not: 'merged' } } }, include: { student: { include: { _count: { select: { enrollments: true } } } } }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] })
    return { items: rows.map((item) => ({ ...this.studentView(item.student, true), relationId: item.id, relationType: item.relationType, isDefault: item.isDefault })) }
  }

  async createAccountStudent(userId: string, payload: Record<string, any>) {
    const name = String(payload.name || '').trim()
    if (!name) throw new BadRequestException('学员姓名不能为空')
    const phone = normalizedPhone(payload.phone)
    if (phone && !/^1\d{10}$/.test(phone)) throw new BadRequestException('手机号格式不正确')
    const email = String(payload.email || '').trim().toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('邮箱格式不正确')
    if (phone) {
      const conflict = await this.db.student.findFirst({ where: { phoneNormalized: phone, status: { not: 'merged' } } })
      if (conflict && String(conflict.name).trim() !== name) throw new BadRequestException('手机号已对应其他姓名，请先选择已有学员或联系管理员')
      if (conflict) {
        await this.grantStudentRelationship(conflict.id, userId, String(payload.relationType || '本人/代报名'), userId)
        return this.getStudentProfile(conflict.id, true)
      }
    }
    const studentId = stableId('stu', phone ? `phone:${phone}` : `account:${userId}:${name}:${Date.now()}`)
    const student = await this.db.student.create({ data: { id: studentId, name, phone: phone || null, phoneNormalized: phone, gender: String(payload.gender || '').trim() || null, email: email || null, company: String(payload.company || '').trim() || null, department: String(payload.department || '').trim() || null, position: String(payload.position || '').trim() || null, status: 'active', createdByUserId: userId, extraPayload: JSON.stringify(payload) } })
    await this.db.accountStudent.create({ data: { id: stableId('acct-stu', `${userId}:${student.id}`), userId, studentId: student.id, relationType: String(payload.relationType || '本人/代报名'), source: 'user_created', status: 'active', isDefault: Boolean(payload.isDefault), createdByUserId: userId } })
    if (payload.isDefault) await this.db.accountStudent.updateMany({ where: { userId, studentId: { not: student.id }, isDefault: true }, data: { isDefault: false } })
    await this.audit(userId, '新增我的学员', student.id)
    return this.getStudentProfile(student.id, true)
  }

  async updateAccountStudent(userId: string, studentId: string, payload: Record<string, any>) {
    const relation = await this.db.accountStudent.findFirst({ where: { userId, studentId, status: 'active' } })
    if (!relation) throw new NotFoundException('学员不在当前账号授权范围内')
    return this.updateStudentProfile(studentId, payload, userId)
  }

  async setAccountDefaultStudent(userId: string, studentId: string) {
    const relation = await this.db.accountStudent.findFirst({ where: { userId, studentId, status: 'active' } })
    if (!relation) throw new NotFoundException('学员不在当前账号授权范围内')
    await this.db.$transaction(async (tx) => {
      await tx.accountStudent.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } })
      await tx.accountStudent.update({ where: { id: relation.id }, data: { isDefault: true } })
    })
    await this.audit(userId, '设置我的默认学员', studentId)
    return this.listAccountStudents(userId)
  }

  async revokeAccountStudent(userId: string, studentId: string) {
    return this.revokeStudentRelationship(studentId, userId, userId)
  }

  async getPaymentSettings() {
    const item = await this.db.paymentSetting.findUnique({ where: { id: 'default' } })
    return json<Record<string, any>>(item?.payload, {})
  }
  async getPublicPaymentSettings() { const item = await this.getPaymentSettings(); const { accountName, bankName, accountNo, qrCodeText, wechatQrImage, alipayQrImage, onlineWechatEnabled, onlineAlipayEnabled } = item; const nodeEnv = String(process.env.NODE_ENV || 'development').trim().toLowerCase(); const adapter = String(process.env.PAYMENT_ADAPTER || (nodeEnv === 'production' ? 'disabled' : 'fake')).trim().toLowerCase(); const adapterAllowsOnline = adapter === 'real' || (adapter === 'fake' && nodeEnv !== 'production'); return { accountName, bankName, accountNo, qrCodeText, wechatQrImage, alipayQrImage, onlineWechatEnabled: Boolean(onlineWechatEnabled && adapterAllowsOnline), onlineAlipayEnabled: Boolean(onlineAlipayEnabled && adapterAllowsOnline) } }
  async savePaymentSettings(payload: Record<string, any>, actor = 'admin') { const merged = { ...(await this.getPaymentSettings()), ...payload }; await this.db.paymentSetting.upsert({ where: { id: 'default' }, create: { id: 'default', payload: JSON.stringify(merged) }, update: { payload: JSON.stringify(merged) } }); await this.audit(actor, '支付设置更新', String(merged.accountName || 'default')); return merged }

  async uploadPaymentQr(channel: 'wechat' | 'alipay', file: { originalname: string; mimetype: string; size: number; buffer: Buffer }, actor = 'admin') {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp'])
    const max = Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024)
    if (!file?.size || file.size > max) throw new BadRequestException(`收款码图片大小必须在 1 字节到 ${Math.floor(max / 1024 / 1024)}MB 之间`)
    if (!allowed.has(String(file.mimetype || '').toLowerCase())) throw new BadRequestException('收款码图片仅支持 JPG、PNG 或 WEBP 格式')
    const extension = extname(file.originalname).toLowerCase()
    const safeExtension = extension === '.jpeg' ? '.jpg' : ['.jpg', '.png', '.webp'].includes(extension) ? extension : '.png'
    const dir = resolve(process.env.UPLOAD_DIR || 'storage/payment-proofs', '..', 'payment-settings')
    mkdirSync(dir, { recursive: true })
    const storedName = `payment-${channel}-${Date.now()}-${randomBytes(4).toString('hex')}${safeExtension}`
    writeFileSync(join(dir, storedName), file.buffer)
    const url = `/api/media/payment-settings/${encodeURIComponent(storedName)}`
    const key = channel === 'wechat' ? 'wechatQrImage' : 'alipayQrImage'
    await this.savePaymentSettings({ [key]: url }, actor)
    return { url, name: storedName, channel, originalName: basename(file.originalname), size: file.size, mimeType: file.mimetype }
  }

  async readPaymentSettingImage(name: string) {
    const fileName = basename(String(name || ''))
    if (!fileName || fileName !== String(name || '') || !/^payment-(wechat|alipay)-[A-Za-z0-9-]+\.(jpg|png|webp)$/.test(fileName)) throw new NotFoundException('收款码图片不存在')
    const path = join(resolve(process.env.UPLOAD_DIR || 'storage/payment-proofs', '..', 'payment-settings'), fileName)
    if (!existsSync(path)) throw new NotFoundException('收款码图片不存在')
    const mimeType: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
    return { buffer: readFileSync(path), mimeType: mimeType[extname(fileName).toLowerCase()] || 'application/octet-stream' }
  }

  private discountRuleScopesOverlap(left: string[], right: string[]) { return !left.length || !right.length || left.some((courseId) => right.includes(courseId)) }
  private discountRuleConflictIds(items: Array<{ id: string; minPeople: number; enabled: boolean; scopeCourseIds: string }>, current: { id: string; minPeople: number; enabled: boolean; scopeCourseIds: string }) {
    if (!current.enabled) return []
    const currentScope = json<string[]>(current.scopeCourseIds, [])
    return items.filter((item) => item.id !== current.id && item.enabled && item.minPeople === current.minPeople && this.discountRuleScopesOverlap(currentScope, json<string[]>(item.scopeCourseIds, []))).map((item) => item.id)
  }
  async listDiscountRules() {
    const items = await this.db.discountRule.findMany({ orderBy: [{ minPeople: 'asc' }, { updatedAt: 'desc' }] })
    return items.map((item) => ({ ...item, courseIds: json<string[]>(item.scopeCourseIds, []), conflicts: this.discountRuleConflictIds(items, item) }))
  }
  async saveDiscountRule(payload: Record<string, any>, actor = 'admin') {
    const ruleId = String(payload.id || id('rule'))
    const courseIds = Array.isArray(payload.courseIds) ? [...new Set(payload.courseIds.map(String).filter(Boolean))] : []
    const minPeople = Number(payload.minPeople)
    const discountRate = Number(payload.discountRate)
    if (!Number.isInteger(minPeople) || minPeople < 1) throw new BadRequestException('优惠人数门槛必须是大于等于 1 的整数')
    if (!Number.isFinite(discountRate) || discountRate < 0 || discountRate > 1) throw new BadRequestException('折扣比例必须在 0 到 1 之间')
    if (courseIds.length) {
      const existingCourses = await this.db.course.findMany({ where: { id: { in: courseIds } }, select: { id: true } })
      const existingIds = new Set(existingCourses.map((course) => course.id))
      const missing = courseIds.filter((courseId) => !existingIds.has(courseId))
      if (missing.length) throw new BadRequestException(`优惠规则关联课程不存在：${missing.join('、')}`)
    }
    const data = { minPeople, discountRate, scopeCourseIds: JSON.stringify(courseIds), enabled: payload.enabled !== false }
    let item
    let changed = true
    const existing = await this.db.discountRule.findUnique({ where: { id: ruleId } })
    if (existing) {
      const updated = await this.db.discountRule.updateMany({
        where: {
          id: ruleId,
          OR: [
            { minPeople: { not: minPeople } },
            { discountRate: { not: discountRate } },
            { scopeCourseIds: { not: data.scopeCourseIds } },
            { enabled: { not: data.enabled } },
          ],
        },
        data,
      })
      changed = updated.count === 1
      item = await this.db.discountRule.findUniqueOrThrow({ where: { id: ruleId } })
    } else {
      item = await this.db.discountRule.create({ data: { id: ruleId, ...data } })
    }
    const all = await this.db.discountRule.findMany({ orderBy: [{ minPeople: 'asc' }, { updatedAt: 'desc' }] })
    const conflicts = this.discountRuleConflictIds(all, item)
    if (changed) await this.audit(actor, '优惠规则维护', JSON.stringify({ ...data, courseIds, conflicts }), existing ? { id: existing.id, minPeople: existing.minPeople, discountRate: existing.discountRate, enabled: existing.enabled, scopeCourseIds: json<string[]>(existing.scopeCourseIds, []) } : null, { ...item, courseIds, conflicts })
    return { ...item, courseIds, conflicts }
  }
  async removeDiscountRule(ruleId: string, actor = 'admin') {
    const current = await this.db.discountRule.findUnique({ where: { id: ruleId } })
    if (!current) throw new NotFoundException('优惠规则不存在')
    await this.db.discountRule.delete({ where: { id: ruleId } })
    await this.audit(actor, '优惠规则删除', ruleId)
    return { id: ruleId, deleted: true }
  }

  async submitFeedback(userId: string, payload: Record<string, any>) {
    const content = String(payload.content || '').trim()
    const category = String(payload.category || '建议反馈').trim() || '建议反馈'
    const attachments = Array.isArray(payload.attachments) ? payload.attachments.map((item: any) => ({ originalName: String(item?.originalName || '').trim(), storedName: String(item?.storedName || '').trim(), mimeType: String(item?.mimeType || '').trim(), size: Number(item?.size || 0), url: String(item?.url || '').trim() })).filter((item: any) => item.storedName && item.url) : []
    if (!content) throw new BadRequestException('反馈内容不能为空')
    if (content.length > MAX_FEEDBACK_CONTENT_LENGTH) throw new BadRequestException(`反馈内容不能超过 ${MAX_FEEDBACK_CONTENT_LENGTH} 个字符`)
    if (category.length > MAX_FEEDBACK_CATEGORY_LENGTH) throw new BadRequestException(`反馈分类不能超过 ${MAX_FEEDBACK_CATEGORY_LENGTH} 个字符`)
    if (attachments.length > MAX_FEEDBACK_ATTACHMENTS) throw new BadRequestException(`反馈附件不能超过 ${MAX_FEEDBACK_ATTACHMENTS} 个`)
    if (attachments.some((item: any) => !item.originalName || !item.mimeType || !item.size || item.size > MAX_FEEDBACK_ATTACHMENT_BYTES)) throw new BadRequestException('反馈附件信息不完整或超过大小限制')
    const normalizedPayload = { category, content, ...(attachments.length ? { attachments } : {}) }
    const item = await this.db.feedback.create({ data: { id: id('FB'), userId, payload: JSON.stringify(normalizedPayload), status: '待处理' } })
    // Audit records should identify the feedback without copying arbitrary
    // user-provided text (which may contain contact details or other PII).
    await this.audit(userId, '提交反馈', item.id)
    return { ...normalizedPayload, id: item.id, userId, status: item.status, createdAt: item.createdAt.toISOString() }
  }

  async uploadFeedbackAttachment(userId: string, file: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
    if (!file?.size || file.size > MAX_FEEDBACK_ATTACHMENT_BYTES) throw new BadRequestException(`反馈附件大小必须在 1 字节到 ${Math.floor(MAX_FEEDBACK_ATTACHMENT_BYTES / 1024 / 1024)}MB 之间`)
    if (!String(file.mimetype || '').startsWith('image/')) throw new BadRequestException('反馈附件仅支持 JPG、PNG、WEBP 等图片格式')
    const extension = extname(file.originalname).toLowerCase() || (file.mimetype === 'image/png' ? '.png' : '.jpg')
    const safeExtension = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension) ? (extension === '.jpeg' ? '.jpg' : extension) : '.jpg'
    const dir = resolve(process.env.UPLOAD_DIR || 'storage/payment-proofs', '..', 'feedback-attachments')
    mkdirSync(dir, { recursive: true })
    const storedName = `feedback-${userId}-${Date.now()}-${randomBytes(4).toString('hex')}${safeExtension}`
    writeFileSync(join(dir, storedName), file.buffer)
    const url = `/api/media/feedback-attachments/${encodeURIComponent(storedName)}`
    return { storedName, originalName: basename(file.originalname), mimeType: file.mimetype, size: file.size, url }
  }

  async readFeedbackAttachment(feedbackId: string, fileName: string) {
    const feedback = await this.db.feedback.findUnique({ where: { id: feedbackId } })
    if (!feedback) throw new NotFoundException('反馈不存在')
    const payload = json<Record<string, any>>(feedback.payload, {})
    const attachments = Array.isArray(payload.attachments) ? payload.attachments : []
    const attachment = attachments.find((item: any) => String(item?.storedName || '') === fileName)
    if (!attachment) throw new NotFoundException('反馈附件不存在')
    const safeName = basename(String(attachment.storedName || ''))
    if (safeName !== fileName) throw new NotFoundException('反馈附件不存在')
    const filePath = join(resolve(process.env.UPLOAD_DIR || 'storage/payment-proofs', '..', 'feedback-attachments'), safeName)
    if (!existsSync(filePath)) throw new NotFoundException('反馈附件文件不存在')
    return { buffer: readFileSync(filePath), mimeType: String(attachment.mimeType || 'application/octet-stream'), originalName: String(attachment.originalName || safeName) }
  }

  async readFeedbackAttachmentFile(fileName: string) {
    const safeName = basename(String(fileName || ''))
    if (!safeName || safeName !== fileName || !/^feedback-.+\.(jpg|jpeg|png|webp|gif)$/i.test(safeName)) throw new NotFoundException('反馈附件不存在')
    const filePath = join(resolve(process.env.UPLOAD_DIR || 'storage/payment-proofs', '..', 'feedback-attachments'), safeName)
    if (!existsSync(filePath)) throw new NotFoundException('反馈附件文件不存在')
    const mimeType: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }
    return { buffer: readFileSync(filePath), mimeType: mimeType[extname(safeName).toLowerCase()] || 'application/octet-stream', originalName: safeName }
  }
  private feedbackView(item: any) {
    const payload = json<Record<string, any>>(item.payload, {})
    return {
      category: String(payload.category || '建议反馈'),
      content: String(payload.content || ''),
      attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
      ...(payload.reply ? { reply: String(payload.reply) } : {}),
      id: item.id,
      userId: item.userId,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      repliedAt: item.repliedAt?.toISOString(),
    }
  }

  async listFeedbacksPage(keyword?: string, page = 1, pageSize = 20, status?: string) { const args = pageArgs(page, pageSize); const where = { ...(status ? { status } : {}), ...(keyword ? { OR: [{ id: { contains: keyword } }, { userId: { contains: keyword } }, { payload: { contains: keyword } }] } : {}) }; const [items, total] = await this.db.$transaction([this.db.feedback.findMany({ where, orderBy: { createdAt: 'desc' }, skip: args.skip, take: args.take }), this.db.feedback.count({ where })]); return { items: items.map((item) => this.feedbackView(item)), page: args.page, pageSize: args.pageSize, total } }
  async resolveFeedback(feedbackId: string, reply: string, actor = 'admin') {
    const current = await this.db.feedback.findUnique({ where: { id: feedbackId } })
    if (!current) throw new NotFoundException('反馈不存在')
    if (current.status !== '待处理') throw new BadRequestException('该反馈已经处理，不能重复回复')
    const normalizedReply = typeof reply === 'string' ? reply.trim() : ''
    if (!normalizedReply) throw new BadRequestException('回复内容不能为空')
    if (normalizedReply.length > MAX_FEEDBACK_REPLY_LENGTH) throw new BadRequestException(`反馈回复不能超过 ${MAX_FEEDBACK_REPLY_LENGTH} 个字符`)
    const payload = { ...json<Record<string, any>>(current.payload, {}), reply: normalizedReply }
    // The UI disables the submit button while the request is in flight, but
    // the API must also be safe when two requests arrive concurrently (for
    // example, a double-click before the browser state updates). The status
    // predicate makes only one request win the transition from pending to
    // processed; the losing request cannot overwrite the original reply.
    const updated = await this.db.feedback.updateMany({
      where: { id: feedbackId, status: '待处理' },
      data: { payload: JSON.stringify(payload), status: '已处理', repliedAt: new Date() },
    })
    if (updated.count !== 1) throw new BadRequestException('该反馈已经处理，不能重复回复')
    const item = await this.db.feedback.findUniqueOrThrow({ where: { id: feedbackId } })
    await this.audit(actor, '处理反馈', feedbackId, this.feedbackView(current), this.feedbackView(item))
    return this.feedbackView(item)
  }

  async saveMessage(payload: Record<string, any>, actor = 'admin', requireExisting = false) {
    if (requireExisting && !payload.id) throw new BadRequestException('更新消息必须提供消息 ID')
    if (!requireExisting && payload.id) throw new BadRequestException('创建消息不能指定消息 ID')
    const title = String(payload.title || '').trim()
    const content = String(payload.content || '').trim()
    const channel = String(payload.channel || '站内消息').trim()
    if (!title || !content) throw new BadRequestException('消息标题和内容不能为空')
    if (title.length > MAX_MESSAGE_TITLE_LENGTH) throw new BadRequestException(`消息标题不能超过 ${MAX_MESSAGE_TITLE_LENGTH} 个字符`)
    if (content.length > MAX_MESSAGE_CONTENT_LENGTH) throw new BadRequestException(`消息内容不能超过 ${MAX_MESSAGE_CONTENT_LENGTH} 个字符`)
    if (channel !== '站内消息') throw new BadRequestException('短信和邮件通道尚未接入，当前只能保存站内消息')
    if (payload.enabled !== undefined && typeof payload.enabled !== 'boolean') throw new BadRequestException('消息启用状态必须是布尔值')
    const targetUserIds = Array.isArray(payload.targetUserIds) ? [...new Set(payload.targetUserIds.map(String).map((value) => value.trim()).filter(Boolean))] : []
    const targetCourseIds = Array.isArray(payload.targetCourseIds) ? [...new Set(payload.targetCourseIds.map(String).map((value) => value.trim()).filter(Boolean))] : []
    if (targetUserIds.length > MAX_MESSAGE_TARGETS || targetCourseIds.length > MAX_MESSAGE_TARGETS) throw new BadRequestException(`消息目标数量不能超过 ${MAX_MESSAGE_TARGETS} 个`)
    const startsAt = String(payload.startsAt || '').trim()
    const endsAt = String(payload.endsAt || '').trim()
    if (startsAt && !Number.isFinite(Date.parse(startsAt))) throw new BadRequestException('消息开始时间格式不正确')
    if (endsAt && !Number.isFinite(Date.parse(endsAt))) throw new BadRequestException('消息结束时间格式不正确')
    if (startsAt && endsAt && Date.parse(startsAt) > Date.parse(endsAt)) throw new BadRequestException('消息开始时间不能晚于结束时间')
    if (targetUserIds.length) {
      const users = await this.db.user.findMany({ where: { id: { in: targetUserIds } }, select: { id: true } })
      const existing = new Set(users.map((user) => user.id))
      const missing = targetUserIds.filter((userId) => !existing.has(userId))
      if (missing.length) throw new BadRequestException(`目标用户不存在：${missing.join('、')}`)
    }
    if (targetCourseIds.length) {
      const courses = await this.db.course.findMany({ where: { id: { in: targetCourseIds } }, select: { id: true } })
      const existing = new Set(courses.map((course) => course.id))
      const missing = targetCourseIds.filter((courseId) => !existing.has(courseId))
      if (missing.length) throw new BadRequestException(`目标课程不存在：${missing.join('、')}`)
    }
    const data = { payload: JSON.stringify({ title, content, channel, targetUserIds, targetCourseIds, startsAt, endsAt }), enabled: payload.enabled !== false }
    if (requireExisting && payload.id && !(await this.db.message.findUnique({ where: { id: String(payload.id) }, select: { id: true } }))) throw new NotFoundException('消息不存在')
    const item = payload.id
      ? await this.db.message.update({ where: { id: String(payload.id) }, data })
      : await this.db.message.create({ data: { id: id('MSG'), ...data } })
    await this.audit(actor, '消息维护', item.id)
    return { ...json<Record<string, any>>(item.payload, {}), id: item.id, enabled: item.enabled, readCount: await this.db.messageRead.count({ where: { messageId: item.id } }) }
  }

  async setMessageEnabled(messageId: string, enabled: boolean, actor = 'admin') {
    const desiredEnabled = Boolean(enabled)
    const updated = await this.db.message.updateMany({
      where: { id: messageId, enabled: { not: desiredEnabled } },
      data: { enabled: desiredEnabled },
    })
    if (updated.count !== 1) {
      const current = await this.db.message.findUnique({ where: { id: messageId }, select: { id: true } })
      if (!current) throw new NotFoundException('消息不存在')
      throw new BadRequestException(`消息已经是${desiredEnabled ? '启用' : '停用'}状态，不能重复操作`)
    }
    const item = await this.db.message.findUniqueOrThrow({ where: { id: messageId } })
    await this.audit(actor, desiredEnabled ? '启用消息' : '停用消息', messageId)
    return { ...json<Record<string, any>>(item.payload, {}), id: item.id, enabled: item.enabled, readCount: await this.db.messageRead.count({ where: { messageId: item.id } }) }
  }

  async removeMessage(messageId: string, actor = 'admin') {
    const current = await this.db.message.findUnique({ where: { id: messageId } })
    if (!current) throw new NotFoundException('消息不存在')
    await this.db.message.delete({ where: { id: messageId } })
    await this.audit(actor, '删除消息', messageId)
    return { id: messageId, deleted: true }
  }

  private messageVisibleToUser(payload: Record<string, any>, userId: string, courseIds: string[]) {
    const targetUserIds = Array.isArray(payload.targetUserIds) ? payload.targetUserIds.map(String) : []
    const targetCourseIds = Array.isArray(payload.targetCourseIds) ? payload.targetCourseIds.map(String) : []
    if (!targetUserIds.length && !targetCourseIds.length) return true
    return targetUserIds.includes(userId) || targetCourseIds.some((courseId) => courseIds.includes(courseId))
  }

  async listUserMessages(userId: string) {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) throw new NotFoundException('用户不存在')
    const [orders, enrollments] = await Promise.all([
      this.db.order.findMany({ where: { userId, status: { not: '已取消' } }, select: { courseId: true } }),
      this.db.enrollment.findMany({ where: { accountUserId: userId, status: { not: 'cancelled' } }, select: { courseId: true } }),
    ])
    const courseIds = [...new Set([...orders.map((order) => order.courseId), ...enrollments.map((enrollment) => enrollment.courseId)])]
    const rows = await this.db.message.findMany({ where: { enabled: true }, include: { reads: { where: { userId }, select: { readAt: true } } }, orderBy: { createdAt: 'desc' } })
    const now = Date.now()
    const items = rows.map((item) => ({ item, payload: json<Record<string, any>>(item.payload, {}) })).filter(({ item, payload }) => {
      const startsAt = Date.parse(String(payload.startsAt || ''))
      const endsAt = Date.parse(String(payload.endsAt || ''))
      return (!Number.isFinite(startsAt) || startsAt <= now) && (!Number.isFinite(endsAt) || endsAt >= now) && this.messageVisibleToUser(payload, userId, courseIds)
    }).map(({ item, payload }) => ({ ...payload, id: item.id, enabled: item.enabled, createdAt: item.createdAt.toISOString(), readAt: item.reads[0]?.readAt?.toISOString() || null }))
    return { items, unreadCount: items.filter((item) => !item.readAt).length }
  }

  async markMessageRead(userId: string, messageId: string) {
    const visible = await this.listUserMessages(userId)
    if (!visible.items.some((item) => item.id === messageId)) throw new NotFoundException('消息不存在或当前账号不可见')
    const row = await this.db.messageRead.upsert({ where: { messageId_userId: { messageId, userId } }, create: { id: stableId('msg-read', `${messageId}:${userId}`), messageId, userId }, update: { readAt: new Date() } })
    return { messageId, userId, readAt: row.readAt.toISOString() }
  }

  async adjustPoints(userId: string, points: number, reason: string, actor = 'admin') {
    const normalizedReason = typeof reason === 'string' ? reason.trim() : ''
    if (!Number.isSafeInteger(points) || points === 0 || !normalizedReason) throw new BadRequestException('积分变更必须为非零整数且填写原因')
    if (normalizedReason.length > MAX_POINT_REASON_LENGTH) throw new BadRequestException(`积分调整原因不能超过 ${MAX_POINT_REASON_LENGTH} 个字符`)
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { id: true, username: true } })
    if (!user) throw new NotFoundException('用户不存在')
    const item = await this.db.$transaction(async (tx) => {
      const bound = points > 0
        ? { points: { lte: SQLITE_INT_MAX - points } }
        : { points: { gte: SQLITE_INT_MIN - points } }
      const updatedCount = await tx.user.updateMany({ where: { id: userId, ...bound }, data: { points: { increment: points } } })
      if (updatedCount.count !== 1) throw new BadRequestException('积分调整后超出可保存范围')
      const updated = await tx.user.findUniqueOrThrow({ where: { id: userId } })
      await tx.pointLedger.create({ data: { id: id('PL'), userId, points, reason: normalizedReason } })
      return updated
    })
    await this.audit(actor, '用户积分调整', `${user.username}: ${points}（${normalizedReason}）`)
    return { userId: item.id, userName: item.name, points: item.points }
  }

  async listPointLedger(userId: string, page = 1, pageSize = 20) {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, username: true, points: true } })
    if (!user) throw new NotFoundException('用户不存在')
    const args = pageArgs(page, pageSize)
    const where = { userId }
    const [items, total] = await this.db.$transaction([
      this.db.pointLedger.findMany({ where, orderBy: { createdAt: 'desc' }, skip: args.skip, take: args.take }),
      this.db.pointLedger.count({ where }),
    ])
    return {
      user: { id: user.id, name: user.name, username: user.username, points: user.points },
      items: items.map((item) => ({ id: item.id, userId: item.userId, points: item.points, reason: item.reason, createdAt: item.createdAt.toISOString() })),
      page: args.page,
      pageSize: args.pageSize,
      total,
    }
  }

  async saveSystemConfig(key: string, payload: Record<string, any>, actor = 'admin') {
    const normalizedKey = key.trim()
    const value = String(payload.value ?? '').trim()
    if (!normalizedKey || !value) throw new BadRequestException('配置键和值不能为空')
    const description = String(payload.description || '').trim()
    if (normalizedKey.length > MAX_CONFIG_KEY_LENGTH || !/^[A-Za-z][A-Za-z0-9._:-]*$/.test(normalizedKey)) throw new BadRequestException('配置键格式不合法')
    if (value.length > MAX_CONFIG_VALUE_LENGTH) throw new BadRequestException(`配置值不能超过 ${MAX_CONFIG_VALUE_LENGTH} 个字符`)
    if (description.length > MAX_CONFIG_DESCRIPTION_LENGTH) throw new BadRequestException(`配置说明不能超过 ${MAX_CONFIG_DESCRIPTION_LENGTH} 个字符`)
    let item
    let changed = true
    const existing = await this.db.systemConfig.findUnique({ where: { key: normalizedKey } })
    if (existing) {
      const updated = await this.db.systemConfig.updateMany({
        where: { key: normalizedKey, OR: [{ value: { not: value } }, { description: { not: description } }] },
        data: { value, description },
      })
      changed = updated.count === 1
      item = await this.db.systemConfig.findUniqueOrThrow({ where: { key: normalizedKey } })
    } else {
      item = await this.db.systemConfig.create({ data: { key: normalizedKey, value, description } })
    }
    if (changed) await this.audit(actor, '系统配置维护', normalizedKey, existing ? { key: existing.key, value: existing.value, description: existing.description } : null, { key: item.key, value: item.value, description: item.description })
    return item
  }

  async getAdminResource(name: string, filters: { action?: string; actor?: string; keyword?: string; from?: string; to?: string } = {}): Promise<Array<Record<string, any>>> {
    if (name === 'messages') return (await this.db.message.findMany({ include: { _count: { select: { reads: true } } }, orderBy: { createdAt: 'desc' } })).map((item) => ({ ...json<Record<string, any>>(item.payload, {}), id: item.id, enabled: item.enabled, readCount: item._count.reads }))
    if (name === 'points') return (await this.db.user.findMany({ orderBy: { createdAt: 'asc' } })).map((user) => ({ userId: user.id, userName: user.name, points: user.points }))
    if (name === 'configs') return this.db.systemConfig.findMany({ orderBy: { key: 'asc' } })
    if (name === 'audits') {
      const fromValue = filters.from ? Date.parse(filters.from) : NaN
      const toValue = filters.to ? Date.parse(filters.to) : NaN
      if (filters.from && !Number.isFinite(fromValue)) throw new BadRequestException('审计开始时间格式不正确')
      if (filters.to && !Number.isFinite(toValue)) throw new BadRequestException('审计结束时间格式不正确')
      if (Number.isFinite(fromValue) && Number.isFinite(toValue) && fromValue > toValue) throw new BadRequestException('审计开始时间不能晚于结束时间')
      const from = Number.isFinite(fromValue) ? new Date(fromValue) : undefined
      const to = Number.isFinite(toValue) ? new Date(toValue) : undefined
      const keyword = String(filters.keyword || '').trim()
      const where: any = {
        ...(filters.action ? { action: filters.action } : {}),
        ...(filters.actor ? { actor: { contains: filters.actor } } : {}),
        ...(keyword ? { OR: [{ actor: { contains: keyword } }, { action: { contains: keyword } }, { detail: { contains: keyword } }, { beforeJson: { contains: keyword } }, { afterJson: { contains: keyword } }] } : {}),
        ...((from || to) ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      }
      return (await this.db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 })).map((item) => ({ ...item, before: json<Record<string, any> | null>(item.beforeJson, null), after: json<Record<string, any> | null>(item.afterJson, null), createdAt: item.createdAt.toISOString() }))
    }
    return []
  }

  async listAuditActions() {
    const rows = await this.db.auditLog.findMany({ select: { action: true }, orderBy: { action: 'asc' } })
    return Array.from(new Set(rows.map((item) => item.action)))
  }
}
