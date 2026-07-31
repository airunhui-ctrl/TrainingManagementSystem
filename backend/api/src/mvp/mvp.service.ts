import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { basename, extname, join, resolve } from 'node:path'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { PrismaService } from '../prisma.service'

export interface RegistrationField {
  key: string
  label: string
  type: 'text' | 'phone' | 'select' | 'radio' | 'checkbox'
  required: boolean
  options?: string[]
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

@Injectable()
export class MvpService {
  constructor(private readonly db: PrismaService) {}

  private courseView(course: any) {
    const { registrationTemplate, ...base } = course
    const rawDescription = String(course.description || '')
    const hasRichText = /<\/?(p|div|h[1-6]|ul|ol|li|strong|em|a|img|blockquote|br)(\s|>)/i.test(rawDescription)
    return {
      ...base,
      description: hasRichText ? stripRichText(rawDescription) : rawDescription,
      ...(hasRichText ? { descriptionRichText: sanitizeRichText(rawDescription) } : {}),
      seatsLeft: Math.max(course.capacity - course.enrolled, 0),
      registrationTemplateName: registrationTemplate?.name || '',
    }
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
    return {
      ...json<Record<string, any>>(invoice.payload, {}),
      id: invoice.id,
      userId: invoice.userId,
      orderIds: json<string[]>(invoice.orderIds, []),
      status: invoice.status,
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
    const where = {
      ...(keyword ? { OR: [{ title: { contains: keyword } }, { subtitle: { contains: keyword } }, { instructor: { contains: keyword } }] } : {}),
      ...(category ? { category } : {}),
      ...(status ? { status } : {}),
    }
    const [items, total] = await this.db.$transaction([
      this.db.course.findMany({ where, include: { registrationTemplate: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' }, skip: args.skip, take: args.take }),
      this.db.course.count({ where }),
    ])
    return { items: items.map((item) => this.courseView(item)), page: args.page, pageSize: args.pageSize, total }
  }

  async getCourse(courseId: string) {
    const course = await this.db.course.findUnique({ where: { id: courseId }, include: { registrationTemplate: { select: { id: true, name: true } } } })
    if (!course) throw new NotFoundException('课程不存在')
    return this.courseView(course)
  }

  async getTemplate(courseId: string) {
    const course = await this.db.course.findUnique({ where: { id: courseId }, select: { id: true, registrationTemplateId: true } })
    if (!course) throw new NotFoundException('课程不存在')
    if (!course.registrationTemplateId) throw new BadRequestException('课程尚未关联报名模板')
    const item = await this.db.registrationTemplate.findUnique({ where: { id: course.registrationTemplateId } })
    if (!item) throw new BadRequestException('课程关联的报名模板不存在')
    return { courseId, templateId: item?.id, templateName: item?.name, version: item?.version || 1, fields: json<RegistrationField[]>(item?.payload, []) }
  }

  async quote(courseId: string, participantCount: number) {
    if (!Number.isInteger(participantCount) || participantCount < 1) throw new BadRequestException('报名人数必须大于 0')
    const course = await this.db.course.findUnique({ where: { id: courseId } })
    if (!course) throw new NotFoundException('课程不存在')
    const rule = await this.applicableDiscountRule(this.db, courseId, participantCount)
    const unitPrice = course.specialPrice ?? course.price
    const originalAmount = unitPrice * participantCount
    const discountRate = rule ? Number(Math.max(0, Math.min(1, 1 - rule.discountRate)).toFixed(2)) : 0
    const discount = Math.round(originalAmount * discountRate)
    return { courseId, participantCount, unitPrice, originalAmount, discount, amount: originalAmount - discount, discountRate }
  }

  async createOrder(userId: string, courseId: string, participants: Array<Record<string, string>>, paymentMethod: 'online' | 'offline' = 'online') {
    if (!participants.length) throw new BadRequestException('至少需要一名报名人')
    const template = await this.getTemplate(courseId)
    for (const [index, participant] of participants.entries()) {
      const missing = template.fields.find((field) => field.required && !String(participant[field.key] || '').trim())
      if (missing) throw new BadRequestException(`第 ${index + 1} 位报名人的${missing.label}不能为空`)
      if (participant.phone && !/^1\d{10}$/.test(participant.phone)) throw new BadRequestException(`第 ${index + 1} 位报名人的手机号格式不正确`)
    }
    return this.db.$transaction(async (tx) => {
      const course = await tx.course.findUnique({ where: { id: courseId } })
      if (!course) throw new NotFoundException('课程不存在')
      if (!course.allowMultiParticipant && participants.length > 1) throw new BadRequestException('该课程不支持多人报名')
      if (course.enrolled + participants.length > course.capacity) throw new BadRequestException('课程剩余名额不足')
      const activeOrders = await tx.order.findMany({ where: { courseId, status: { not: '已取消' } }, select: { participants: true } })
      const registeredPhones = new Set(activeOrders.flatMap((order) => json<Array<Record<string, string>>>(order.participants, []).map((item) => item.phone).filter(Boolean)))
      const duplicated = participants.find((item) => item.phone && registeredPhones.has(item.phone))
      if (duplicated) throw new BadRequestException(`手机号 ${duplicated.phone} 已报名本课程`)
      const rule = await this.applicableDiscountRule(tx, courseId, participants.length)
      const unitPrice = course.specialPrice ?? course.price
      const originalAmount = unitPrice * participants.length
      const discountRate = rule ? Math.max(0, Math.min(1, 1 - rule.discountRate)) : 0
      const discount = Math.round(originalAmount * discountRate)
      const order = await tx.order.create({ data: {
        id: id('HX'), userId, courseId, participants: JSON.stringify(participants), participantCount: participants.length,
        originalAmount, discount, amount: originalAmount - discount,
        status: '待支付', paymentMethod,
      }, include: { course: true, paymentProofs: { orderBy: { createdAt: 'desc' }, take: 1 } } })
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

  async payOrder(userId: string, orderId: string, method: 'online' | 'offline', proof?: string, channel?: 'wechat' | 'alipay') {
    const order = await this.db.order.findFirst({ where: { id: orderId, userId } })
    if (!order) throw new NotFoundException('订单不存在')
    if (order.status === '已取消') throw new BadRequestException('已取消订单不能支付')
    if (method === 'offline') throw new BadRequestException('请在订单中上传线下支付凭证')
    const updated = await this.db.order.update({ where: { id: orderId }, data: { paymentMethod: 'online', paymentChannel: channel || 'wechat', status: '已支付' }, include: { course: true, paymentProofs: { orderBy: { createdAt: 'desc' }, take: 1 } } })
    if (proof) await this.audit(userId, '提交支付标识', `${orderId} ${proof}`)
    return this.orderView(updated)
  }

  async createPaymentIntent(userId: string, orderId: string, channel: 'wechat' | 'alipay') {
    const order = await this.db.order.findFirst({ where: { id: orderId, userId } })
    if (!order) throw new NotFoundException('订单不存在')
    if (order.status !== '待支付') throw new BadRequestException('当前订单状态不能发起支付')
    const provider = channel === 'wechat' ? 'wxpay' : 'alipay'
    // 商户号、签名和预支付单号接入后，将 ready 改为 true 并填充 payload，
    // 客户端即可直接调用小程序原生支付；开发环境保留二维码回退。
    return { orderId, channel, provider, amount: order.amount, currency: 'CNY', ready: false, payload: null, message: '支付渠道参数尚未配置' }
  }

  async uploadPaymentProof(userId: string, orderId: string, file: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
    const order = await this.db.order.findFirst({ where: { id: orderId, userId } })
    if (!order) throw new NotFoundException('订单不存在')
    if (order.status === '已取消' || order.status === '已支付') throw new BadRequestException('当前订单状态不能上传凭证')
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
    const invoices = await this.db.invoice.findMany({ select: { orderIds: true } })
    if (invoices.some((invoice) => json<string[]>(invoice.orderIds, []).some((item) => orderIds.includes(item)))) throw new BadRequestException('所选订单已提交开票申请')
    const item = await this.db.invoice.create({ data: { id: id('INV'), userId, orderIds: JSON.stringify(orderIds), payload: JSON.stringify({ ...payload, orderIds }), status: '待处理' } })
    await this.audit(userId, '提交开票申请', item.id)
    return this.invoiceView(item)
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

  private async audit(actor: string, action: string, detail: string) { await this.db.saveAudit(actor, action, detail) }

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
    const courseId = String(merged.courseId || '')
    if (!courseId || !(await this.db.course.findUnique({ where: { id: courseId }, select: { id: true } }))) throw new BadRequestException('Banner必须绑定现有课程')
    const nextSort = existing
      ? Number(merged.sort ?? existing.sort ?? 0)
      : Number((await this.db.banner.aggregate({ _max: { sort: true } }))._max.sort || 0) + 1
    merged.sort = nextSort
    const item = await this.db.banner.upsert({ where: { id: bannerId }, create: { id: bannerId, payload: JSON.stringify(merged), enabled: merged.enabled !== false, sort: nextSort }, update: { payload: JSON.stringify(merged), enabled: merged.enabled !== false, sort: nextSort } })
    await this.audit(actor, 'Banner维护', String(merged.title || bannerId))
    return { ...merged, enabled: item.enabled, sort: item.sort }
  }

  async removeBanner(bannerId: string, actor = 'admin') {
    const item = await this.db.banner.findUnique({ where: { id: bannerId } })
    if (!item) throw new NotFoundException('Banner不存在')
    await this.db.banner.delete({ where: { id: bannerId } })
    const view: Record<string, any> = { ...json<Record<string, any>>(item.payload, {}), id: item.id }
    await this.audit(actor, 'Banner删除', String(view.title || bannerId))
    return view
  }

  async saveCourse(payload: Record<string, any>, actor = 'admin') {
    const courseId = String(payload.id || id('course'))
    const existing = await this.db.course.findUnique({ where: { id: courseId } })
    const source: Record<string, any> = { title: '新建课程', subtitle: '', category: '综合管理', date: '2026-12-01 09:00', location: '待定', instructor: '待定', image: null, price: 0, originalPrice: 0, specialPrice: null, allowMultiParticipant: true, registrationDeadline: null, capacity: 30, enrolled: 0, status: '报名中', description: '', descriptionRichText: '', registrationTemplateId: null, ...existing, ...payload }
    const registrationTemplateId = String(source.registrationTemplateId || '').trim()
    if (!registrationTemplateId) throw new BadRequestException('课程必须关联一个已创建的报名模板')
    if (!(await this.db.registrationTemplate.findUnique({ where: { id: registrationTemplateId }, select: { id: true } }))) throw new BadRequestException('关联报名模板不存在')
    const richDescription = sanitizeRichText(source.descriptionRichText || source.description)
    const data = { title: String(source.title), subtitle: String(source.subtitle || ''), category: String(source.category), date: String(source.date), location: String(source.location), instructor: String(source.instructor), image: source.image ? String(source.image) : null, price: Number(source.price || 0), originalPrice: source.originalPrice === '' || source.originalPrice == null ? null : Number(source.originalPrice), specialPrice: source.specialPrice === '' || source.specialPrice == null ? null : Number(source.specialPrice), allowMultiParticipant: source.allowMultiParticipant !== false, registrationDeadline: source.registrationDeadline ? String(source.registrationDeadline) : null, capacity: Math.max(0, Number(source.capacity || 0)), enrolled: Math.max(0, Number(source.enrolled || 0)), status: String(source.status), description: richDescription, registrationTemplateId }
    const item = await this.db.course.upsert({ where: { id: courseId }, create: { id: courseId, ...data }, update: data })
    await this.audit(actor, '课程维护', item.title)
    return this.courseView(item)
  }

  async removeCourse(courseId: string, actor = 'admin') {
    const item = await this.db.course.findUnique({ where: { id: courseId } })
    if (!item) throw new NotFoundException('课程不存在')
    if (await this.db.order.count({ where: { courseId } })) throw new BadRequestException('已有订单的课程不能删除，可改为已结束')
    await this.db.course.delete({ where: { id: courseId } })
    await this.audit(actor, '课程删除', item.title)
    return this.courseView(item)
  }

  async listTemplates() {
    const items = await this.db.registrationTemplate.findMany({ include: { courses: { select: { id: true, title: true } } }, orderBy: { updatedAt: 'desc' } })
    return items.map((item) => ({ id: item.id, name: item.name, version: item.version, courseCount: item.courses.length, courseIds: item.courses.map(course => course.id), courseNames: item.courses.map(course => course.title), courses: item.courses, fields: json<RegistrationField[]>(item.payload, []) }))
  }

  async saveTemplate(templateId: string | undefined, payload: { name?: string; fields?: RegistrationField[] }, actor = 'admin') {
    const fields = payload.fields
    if (!Array.isArray(fields) || !fields.length) throw new BadRequestException('报名模板至少包含一个字段')
    const keys = new Set<string>()
    for (const field of fields) {
      if (!field?.key || !field?.label || !['text', 'phone', 'select', 'radio', 'checkbox'].includes(field.type)) throw new BadRequestException('报名模板字段配置不完整')
      if (keys.has(field.key)) throw new BadRequestException(`报名模板字段 ${field.key} 重复`)
      keys.add(field.key)
    }
    const idValue = String(templateId || id('tpl'))
    const current = await this.db.registrationTemplate.findUnique({ where: { id: idValue } })
    const name = String(payload.name || current?.name || '报名模板').trim()
    if (!name) throw new BadRequestException('报名模板名称不能为空')
    const item = await this.db.registrationTemplate.upsert({ where: { id: idValue }, create: { id: idValue, name, version: 1, payload: JSON.stringify(fields) }, update: { name, version: { increment: 1 }, payload: JSON.stringify(fields) } })
    await this.audit(actor, '报名模板维护', `${name} v${item.version}`)
    return { id: item.id, name: item.name, version: item.version, fields }
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

  async cancelOrder(userId: string, orderId: string) {
    const item = await this.db.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId, userId } })
      if (!order) throw new NotFoundException('订单不存在')
      if (order.status === '已支付') throw new BadRequestException('已支付订单请申请退款')
      if (order.status !== '已取消') await tx.course.update({ where: { id: order.courseId }, data: { enrolled: { decrement: Math.min(order.participantCount, (await tx.course.findUniqueOrThrow({ where: { id: order.courseId } })).enrolled) } } })
      return tx.order.update({ where: { id: orderId }, data: { status: '已取消' }, include: { course: true, paymentProofs: { orderBy: { createdAt: 'desc' }, take: 1 } } })
    })
    await this.audit(userId, '取消报名', orderId)
    return this.orderView(item)
  }

  async reviewOffline(orderId: string, approved: boolean, remark = '', actor = 'admin') {
    const result = await this.db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } })
      if (!order) throw new NotFoundException('订单不存在')
      const proof = await tx.paymentProof.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } })
      if (!proof) throw new BadRequestException('订单没有可审核的支付凭证')
      await tx.paymentProof.update({ where: { id: proof.id }, data: { status: approved ? 'approved' : 'rejected', remark, reviewedAt: new Date() } })
      return tx.order.update({ where: { id: orderId }, data: { status: approved ? '已支付' : '待支付' }, include: { course: true, paymentProofs: { orderBy: { createdAt: 'desc' }, take: 1 } } })
    })
    await this.audit(actor, approved ? '线下支付审核通过' : '线下支付驳回', `${orderId} ${remark}`)
    return this.orderView(result)
  }

  async refundOrder(orderId: string, actor = 'admin') {
    const result = await this.db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } })
      if (!order) throw new NotFoundException('订单不存在')
      if (order.status !== '已支付') throw new BadRequestException('只有已支付订单可以退款')
      const course = await tx.course.findUniqueOrThrow({ where: { id: order.courseId } })
      await tx.course.update({ where: { id: order.courseId }, data: { enrolled: Math.max(0, course.enrolled - order.participantCount) } })
      return tx.order.update({ where: { id: orderId }, data: { status: '已取消' }, include: { course: true, paymentProofs: { orderBy: { createdAt: 'desc' }, take: 1 } } })
    })
    await this.audit(actor, '退款完成', orderId)
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

  async processInvoice(invoiceId: string, status: '已开票' | '已驳回', invoiceNo = '', actor = 'admin') {
    const current = await this.db.invoice.findUnique({ where: { id: invoiceId } })
    if (!current) throw new NotFoundException('开票申请不存在')
    const payload = { ...json<Record<string, any>>(current.payload, {}), invoiceNo }
    const item = await this.db.invoice.update({ where: { id: invoiceId }, data: { status, payload: JSON.stringify(payload), processedAt: new Date() } })
    await this.audit(actor, '开票处理', `${invoiceId} ${status}`)
    return this.invoiceView(item)
  }

  async getProfile(userId: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('用户不存在')
    return { id: user.id, username: user.username, name: user.name, company: user.company, avatarText: user.avatarText, phone: user.phone, gender: user.gender, email: user.email, registeredAt: user.registeredAt.toISOString().slice(0, 10), lastLoginAt: user.lastLoginAt?.toISOString() || null, points: user.points, enabled: user.enabled }
  }

  async updateProfile(userId: string, payload: Record<string, any>) {
    const item = await this.db.user.update({ where: { id: userId }, data: {
      ...(payload.name !== undefined ? { name: String(payload.name).trim() } : {}),
      ...(payload.company !== undefined ? { company: String(payload.company).trim() } : {}),
      ...(payload.phone !== undefined ? { phone: String(payload.phone).trim() || null } : {}),
      ...(payload.gender !== undefined ? { gender: String(payload.gender).trim() || null } : {}),
      ...(payload.email !== undefined ? { email: String(payload.email).trim() || null } : {}),
      ...(payload.avatarText !== undefined ? { avatarText: String(payload.avatarText).slice(0, 2) } : {}),
    } })
    await this.audit(userId, '个人资料更新', item.name || item.username)
    return this.getProfile(userId)
  }

  async changePassword(userId: string, password = '123456') {
    if (password.length < 6) throw new BadRequestException('密码至少 6 位')
    await this.db.setPassword(userId, password)
    await this.db.revokeRefreshTokens(userId)
    await this.audit(userId, '修改密码', 'password hash updated')
    return { success: true }
  }

  async listUsersPage(keyword?: string, page = 1, pageSize = 20, role?: string) {
    const args = pageArgs(page, pageSize)
    const where = {
      ...(role ? { role } : {}),
      ...(keyword ? { OR: [{ username: { contains: keyword } }, { name: { contains: keyword } }] } : {}),
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
      return { ...(await this.getProfile(item.id)), role: item.role, courseCount, previewCount, lastActiveAt: new Date(Math.max(...activityDates)).toISOString() }
    }))
    return { items: views, page: args.page, pageSize: args.pageSize, total }
  }

  async setUserEnabled(userId: string, enabled: boolean, actor = 'admin') {
    const item = await this.db.user.update({ where: { id: userId }, data: { enabled } })
    if (!enabled) await this.db.revokeRefreshTokens(userId)
    await this.audit(actor, enabled ? '启用用户' : '禁用用户', item.username)
    return this.getProfile(userId)
  }

  async resetUserPassword(userId: string, actor = 'admin') {
    const item = await this.db.user.findUnique({ where: { id: userId } })
    if (!item) throw new NotFoundException('用户不存在')
    await this.db.setPassword(userId, '123456')
    await this.db.revokeRefreshTokens(userId)
    await this.audit(actor, '重置用户密码', `${item.username} -> temporary password`)
    return { id: userId, username: item.username, resetPassword: '123456' }
  }

  async listStudents() { return this.listEnrollments() }

  async getPaymentSettings() {
    const item = await this.db.paymentSetting.findUnique({ where: { id: 'default' } })
    return json<Record<string, any>>(item?.payload, {})
  }
  async getPublicPaymentSettings() { const item = await this.getPaymentSettings(); const { accountName, bankName, accountNo, qrCodeText, onlineWechatEnabled, onlineAlipayEnabled } = item; return { accountName, bankName, accountNo, qrCodeText, onlineWechatEnabled, onlineAlipayEnabled } }
  async savePaymentSettings(payload: Record<string, any>, actor = 'admin') { const merged = { ...(await this.getPaymentSettings()), ...payload }; await this.db.paymentSetting.upsert({ where: { id: 'default' }, create: { id: 'default', payload: JSON.stringify(merged) }, update: { payload: JSON.stringify(merged) } }); await this.audit(actor, '支付设置更新', String(merged.accountName || 'default')); return merged }

  async listDiscountRules() { const items = await this.db.discountRule.findMany({ orderBy: { minPeople: 'asc' } }); return items.map((item) => ({ ...item, courseIds: json<string[]>(item.scopeCourseIds, []) })) }
  async saveDiscountRule(payload: Record<string, any>, actor = 'admin') { const ruleId = String(payload.id || id('rule')); const courseIds = Array.isArray(payload.courseIds) ? [...new Set(payload.courseIds.map(String).filter(Boolean))] : []; const data = { minPeople: Math.max(1, Number(payload.minPeople || 1)), discountRate: Math.max(0, Math.min(1, Number(payload.discountRate ?? 1))), scopeCourseIds: JSON.stringify(courseIds), enabled: payload.enabled !== false }; const item = await this.db.discountRule.upsert({ where: { id: ruleId }, create: { id: ruleId, ...data }, update: data }); await this.audit(actor, '优惠规则维护', JSON.stringify({ ...data, courseIds })); return { ...item, courseIds } }

  async submitFeedback(userId: string, payload: Record<string, any>) { if (!String(payload.content || '').trim()) throw new BadRequestException('反馈内容不能为空'); const item = await this.db.feedback.create({ data: { id: id('FB'), userId, payload: JSON.stringify(payload), status: '待处理' } }); await this.audit(userId, '提交反馈', String(payload.content)); return { ...payload, id: item.id, userId, status: item.status, createdAt: item.createdAt.toISOString() } }
  async listFeedbacksPage(keyword?: string, page = 1, pageSize = 20, status?: string) { const args = pageArgs(page, pageSize); const where = { ...(status ? { status } : {}), ...(keyword ? { payload: { contains: keyword } } : {}) }; const [items, total] = await this.db.$transaction([this.db.feedback.findMany({ where, orderBy: { createdAt: 'desc' }, skip: args.skip, take: args.take }), this.db.feedback.count({ where })]); return { items: items.map((item) => ({ ...json<Record<string, any>>(item.payload, {}), id: item.id, userId: item.userId, status: item.status, createdAt: item.createdAt.toISOString(), repliedAt: item.repliedAt?.toISOString() })), page: args.page, pageSize: args.pageSize, total } }
  async resolveFeedback(feedbackId: string, reply: string, actor = 'admin') { const current = await this.db.feedback.findUnique({ where: { id: feedbackId } }); if (!current) throw new NotFoundException('反馈不存在'); const payload = { ...json<Record<string, any>>(current.payload, {}), reply }; const item = await this.db.feedback.update({ where: { id: feedbackId }, data: { payload: JSON.stringify(payload), status: '已处理', repliedAt: new Date() } }); await this.audit(actor, '处理反馈', feedbackId); return { ...payload, id: item.id, userId: item.userId, status: item.status, repliedAt: item.repliedAt?.toISOString() } }

  async saveMessage(payload: Record<string, any>, actor = 'admin') {
    const title = String(payload.title || '').trim()
    const content = String(payload.content || '').trim()
    if (!title || !content) throw new BadRequestException('消息标题和内容不能为空')
    const data = { payload: JSON.stringify({ title, content, channel: String(payload.channel || '站内消息') }), enabled: payload.enabled !== false }
    const item = payload.id
      ? await this.db.message.update({ where: { id: String(payload.id) }, data })
      : await this.db.message.create({ data: { id: id('MSG'), ...data } })
    await this.audit(actor, '消息维护', item.id)
    return { ...json<Record<string, any>>(item.payload, {}), id: item.id, enabled: item.enabled }
  }

  async adjustPoints(userId: string, points: number, reason: string, actor = 'admin') {
    if (!Number.isInteger(points) || points === 0 || !reason.trim()) throw new BadRequestException('积分变更必须为非零整数且填写原因')
    const user = await this.db.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('用户不存在')
    const item = await this.db.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: userId }, data: { points: { increment: points } } })
      await tx.pointLedger.create({ data: { id: id('PL'), userId, points, reason: reason.trim() } })
      return updated
    })
    await this.audit(actor, '用户积分调整', `${user.username}: ${points}`)
    return { userId: item.id, userName: item.name, points: item.points }
  }

  async saveSystemConfig(key: string, payload: Record<string, any>, actor = 'admin') {
    const normalizedKey = key.trim()
    const value = String(payload.value ?? '').trim()
    if (!normalizedKey || !value) throw new BadRequestException('配置键和值不能为空')
    const item = await this.db.systemConfig.upsert({ where: { key: normalizedKey }, create: { key: normalizedKey, value, description: String(payload.description || '') }, update: { value, description: String(payload.description || '') } })
    await this.audit(actor, '系统配置维护', normalizedKey)
    return item
  }

  async getAdminResource(name: string, action?: string): Promise<Array<Record<string, any>>> {
    if (name === 'messages') return (await this.db.message.findMany({ orderBy: { createdAt: 'desc' } })).map((item) => ({ ...json<Record<string, any>>(item.payload, {}), id: item.id, enabled: item.enabled }))
    if (name === 'points') return (await this.db.user.findMany({ orderBy: { createdAt: 'asc' } })).map((user) => ({ userId: user.id, userName: user.name, points: user.points }))
    if (name === 'configs') return this.db.systemConfig.findMany({ orderBy: { key: 'asc' } })
    if (name === 'audits') return (await this.db.auditLog.findMany({ where: action ? { action } : undefined, orderBy: { createdAt: 'desc' }, take: 500 })).map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))
    return []
  }

  async listAuditActions() {
    const rows = await this.db.auditLog.findMany({ select: { action: true }, orderBy: { action: 'asc' } })
    return Array.from(new Set(rows.map((item) => item.action)))
  }
}
