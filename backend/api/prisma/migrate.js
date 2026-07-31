const { mkdirSync, readFileSync } = require('node:fs')
const { dirname, isAbsolute, resolve } = require('node:path')
const { DatabaseSync } = require('node:sqlite')

const raw = process.env.DATABASE_FILE || process.env.DATABASE_URL || './data/training.db'
const value = raw.replace(/^file:/, '')
const dbPath = isAbsolute(value) ? value : resolve(process.cwd(), value)
mkdirSync(dirname(dbPath), { recursive: true })
const db = new DatabaseSync(dbPath)
const migration = readFileSync(resolve(__dirname, 'migrations/0001_init/migration.sql'), 'utf8')

const exists = (name) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
const info = (name) => exists(name) ? db.prepare(`PRAGMA table_info("${name}")`).all() : []
const has = (name, column) => info(name).some((row) => row.name === column)
const typeOf = (name, column) => String(info(name).find((row) => row.name === column)?.type || '').toUpperCase()
const rows = (name) => exists(name) ? db.prepare(`SELECT * FROM "${name}"`).all() : []
const parse = (value, fallback) => { try { return value ? JSON.parse(value) : fallback } catch { return fallback } }
const now = Date.now()
const legacyTables = ['AppState','OrderRecord','_Legacy_Banner','_Legacy_Course','_Legacy_DiscountRule','_Legacy_Feedback','_Legacy_Invoice','_Legacy_Message','_Legacy_PaymentSetting','_Legacy_PointLedger','_Legacy_RegistrationTemplate']
const sqlDate = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  if (Number.isFinite(number) && number > 10_000_000_000) return BigInt(Math.trunc(number))
  const parsed = new Date(value).getTime()
  return BigInt(Number.isFinite(parsed) ? parsed : now)
}

const normalized = exists('User') && typeOf('User', 'createdAt') === 'DATETIME' && exists('Course') && has('Course', 'category') && typeOf('Course', 'createdAt') === 'DATETIME'
if (normalized) {
  if (exists('User') && !has('User', 'phone')) db.exec(`ALTER TABLE "User" ADD COLUMN "phone" TEXT`)
  if (exists('User') && !has('User', 'gender')) db.exec(`ALTER TABLE "User" ADD COLUMN "gender" TEXT`)
  if (exists('User') && !has('User', 'email')) db.exec(`ALTER TABLE "User" ADD COLUMN "email" TEXT`)
  if (exists('User') && !has('User', 'wechatOpenId')) db.exec(`ALTER TABLE "User" ADD COLUMN "wechatOpenId" TEXT`)
  if (exists('User') && !has('User', 'lastLoginAt')) db.exec(`ALTER TABLE "User" ADD COLUMN "lastLoginAt" DATETIME`)
  if (exists('Course') && !has('Course', 'image')) db.exec(`ALTER TABLE "Course" ADD COLUMN "image" TEXT`)
  if (exists('DiscountRule') && !has('DiscountRule', 'scopeCourseIds')) db.exec(`ALTER TABLE "DiscountRule" ADD COLUMN "scopeCourseIds" TEXT NOT NULL DEFAULT '[]'`)
  if (exists('Course') && !has('Course', 'registrationTemplateId')) db.exec(`ALTER TABLE "Course" ADD COLUMN "registrationTemplateId" TEXT`)
  if (exists('RegistrationTemplate') && !has('RegistrationTemplate', 'name')) db.exec(`ALTER TABLE "RegistrationTemplate" ADD COLUMN "name" TEXT NOT NULL DEFAULT '报名模板'`)
  if (exists('Course') && exists('RegistrationTemplate') && has('RegistrationTemplate', 'courseId')) db.exec(`UPDATE "Course" SET "registrationTemplateId"=(SELECT "id" FROM "RegistrationTemplate" WHERE "RegistrationTemplate"."courseId"="Course"."id") WHERE "registrationTemplateId" IS NULL`)
  const templateInfo = info('RegistrationTemplate')
  const legacyTemplateCourseColumn = templateInfo.find((column) => column.name === 'courseId')
  const rebuildTemplateTable = legacyTemplateCourseColumn?.notnull === 1
    ? `ALTER TABLE "RegistrationTemplate" RENAME TO "__legacy_RegistrationTemplate";
       CREATE TABLE "RegistrationTemplate" ("id" TEXT NOT NULL PRIMARY KEY, "courseId" TEXT, "name" TEXT NOT NULL DEFAULT '报名模板', "version" INTEGER NOT NULL DEFAULT 1, "payload" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL);
       INSERT INTO "RegistrationTemplate"(id,courseId,name,version,payload,updatedAt) SELECT id,courseId,name,version,payload,updatedAt FROM "__legacy_RegistrationTemplate";
       DROP TABLE "__legacy_RegistrationTemplate";`
    : ''
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE; ${rebuildTemplateTable} ${migration}`)
  for (const name of legacyTables) if (exists(name)) db.exec(`DROP TABLE "${name}"`)
  db.exec('PRAGMA user_version=4; COMMIT; PRAGMA foreign_keys=ON;')
  console.log(`SQLite schema already current: ${dbPath}`)
  db.close()
  process.exit(0)
}

const stateRow = exists('AppState') ? db.prepare('SELECT payload FROM AppState WHERE id=1').get() : null
const state = parse(stateRow?.payload, {})
const legacyUsers = rows('User')
const legacyProofs = rows('PaymentProof')
const legacyAudits = rows('AuditLog')
const currentCourses = has('Course', 'category') ? rows('Course') : rows('Course').map((row) => parse(row.payload, null)).filter(Boolean)
const currentTemplates = has('RegistrationTemplate', 'version') ? rows('RegistrationTemplate') : rows('RegistrationTemplate').map((row) => ({ id: row.id, courseId: row.courseId, name: '报名模板', version: 1, payload: row.payload }))
const currentOrders = exists('Order') ? rows('Order') : rows('OrderRecord').map((row) => parse(row.payload, null)).filter(Boolean)
const currentInvoices = has('Invoice', 'orderIds') ? rows('Invoice') : rows('Invoice').map((row) => parse(row.payload, null)).filter(Boolean)
const currentPreviews = rows('Preview')
const currentFeedbacks = has('Feedback', 'status') ? rows('Feedback') : rows('Feedback').map((row) => parse(row.payload, null)).filter(Boolean)
const currentBanners = has('Banner', 'sort') ? rows('Banner') : rows('Banner').map((row) => parse(row.payload, null)).filter(Boolean)
const currentRules = has('DiscountRule', 'minPeople') ? rows('DiscountRule') : rows('DiscountRule').map((row) => parse(row.payload, null)).filter(Boolean)
const currentPayment = has('PaymentSetting', 'updatedAt') ? rows('PaymentSetting') : rows('PaymentSetting').map((row) => ({ id: row.id, payload: row.payload }))

const tables = ['RefreshToken','RegistrationTemplate','PaymentProof','Invoice','Preview','Feedback','PointLedger','Message','AuditLog','Banner','PaymentSetting','DiscountRule','SystemConfig','Order','Course','User']
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;')
try {
  for (const name of tables) {
    const backup = `__backup_${name}`
    if (exists(backup)) db.exec(`DROP TABLE "${backup}"`)
    if (exists(name)) db.exec(`ALTER TABLE "${name}" RENAME TO "${backup}"`)
  }
  for (const indexName of ['User_username_key','RefreshToken_tokenHash_key','RegistrationTemplate_courseId_key','Order_userId_createdAt_idx','Order_courseId_status_idx','PaymentProof_orderId_createdAt_idx','Invoice_userId_createdAt_idx','Preview_userId_courseId_key','Feedback_userId_createdAt_idx']) db.exec(`DROP INDEX IF EXISTS "${indexName}"`)
  db.exec(migration)

  const insertUser = db.prepare('INSERT INTO "User"(id,username,passwordHash,role,name,company,avatarText,phone,gender,email,wechatOpenId,lastLoginAt,registeredAt,enabled,points,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(username) DO NOTHING')
  for (const user of legacyUsers) insertUser.run(user.id,user.username,user.passwordHash,user.role === 'admin' ? 'admin' : 'user',user.name || '',user.company || '',user.avatarText || null,user.phone || null,user.gender || null,user.email || null,user.wechatOpenId || null,sqlDate(user.lastLoginAt),sqlDate(user.registeredAt || user.createdAt) || BigInt(now),user.enabled === 0 ? 0 : 1,Number(user.points || 0),sqlDate(user.createdAt) || BigInt(now),sqlDate(user.updatedAt) || BigInt(now))

  const courses = Array.isArray(state.courses) && state.courses.length ? state.courses : currentCourses
  const insertCourse = db.prepare('INSERT INTO "Course"(id,title,subtitle,category,date,location,instructor,image,price,originalPrice,specialPrice,allowMultiParticipant,registrationDeadline,capacity,enrolled,status,description,registrationTemplateId,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
  for (const item of courses) insertCourse.run(item.id,item.title,item.subtitle || '',item.category || '综合管理',item.date || '',item.location || '',item.instructor || '',item.image || null,Number(item.price || 0),item.originalPrice ?? null,item.specialPrice ?? null,item.allowMultiParticipant === false ? 0 : 1,item.registrationDeadline || null,Number(item.capacity || 0),Number(item.enrolled || 0),item.status || '报名中',item.description || '',item.registrationTemplateId || null,sqlDate(item.createdAt) || BigInt(now),sqlDate(item.updatedAt) || BigInt(now))

  const templates = state.templates ? Object.entries(state.templates).map(([courseId, fields]) => ({ id:`tpl-${courseId}`,courseId,name:`${courseId}报名模板`,version:1,payload:JSON.stringify(fields) })) : currentTemplates
  const insertTemplate = db.prepare('INSERT INTO "RegistrationTemplate"(id,courseId,name,version,payload,updatedAt) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
  for (const item of templates) if (item.courseId) insertTemplate.run(item.id || `tpl-${item.courseId}`,item.courseId,item.name || '报名模板',Number(item.version || 1),item.payload || '[]',sqlDate(item.updatedAt) || BigInt(now))
  db.exec('UPDATE "Course" SET "registrationTemplateId"=(SELECT "id" FROM "RegistrationTemplate" WHERE "RegistrationTemplate"."courseId"="Course"."id") WHERE "registrationTemplateId" IS NULL')

  const orders = state.orders ? Object.values(state.orders) : currentOrders
  const insertOrder = db.prepare('INSERT INTO "Order"(id,userId,courseId,participantCount,participants,originalAmount,discount,amount,status,paymentMethod,paymentChannel,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
  for (const item of orders) if (item?.id) insertOrder.run(item.id,item.userId,item.courseId,Number(item.participantCount || 0),typeof item.participants === 'string' ? item.participants : JSON.stringify(item.participants || []),Number(item.originalAmount || 0),Number(item.discount || 0),Number(item.amount || 0),item.status || '待支付',item.paymentMethod || null,item.paymentChannel || null,sqlDate(item.createdAt) || BigInt(now),sqlDate(item.updatedAt) || BigInt(now))

  const insertProof = db.prepare('INSERT INTO "PaymentProof"(id,orderId,originalName,storedName,mimeType,size,path,status,remark,createdAt,reviewedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
  for (const item of legacyProofs) insertProof.run(item.id,item.orderId,item.originalName,item.storedName,item.mimeType,Number(item.size || 0),item.path,item.status || 'pending',item.remark || null,sqlDate(item.createdAt) || BigInt(now),sqlDate(item.reviewedAt))

  const invoices = Array.isArray(state.invoices) && state.invoices.length ? state.invoices : currentInvoices
  const insertInvoice = db.prepare('INSERT INTO "Invoice"(id,userId,orderIds,payload,status,createdAt,processedAt) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
  for (const item of invoices) if (item?.id) insertInvoice.run(item.id,item.userId,typeof item.orderIds === 'string' ? item.orderIds : JSON.stringify(item.orderIds || []),item.payload || JSON.stringify(item),item.status || '待处理',sqlDate(item.createdAt) || BigInt(now),sqlDate(item.processedAt))

  const previews = Array.isArray(state.previews) && state.previews.length ? state.previews : currentPreviews
  const insertPreview = db.prepare('INSERT INTO "Preview"(id,userId,courseId,viewedAt) VALUES(?,?,?,?) ON CONFLICT(userId,courseId) DO NOTHING')
  for (const item of previews) if (item?.id) insertPreview.run(item.id,item.userId,item.courseId,sqlDate(item.viewedAt) || BigInt(now))

  const feedbacks = Array.isArray(state.feedbacks) && state.feedbacks.length ? state.feedbacks : currentFeedbacks
  const insertFeedback = db.prepare('INSERT INTO "Feedback"(id,userId,payload,status,createdAt,repliedAt) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
  for (const item of feedbacks) if (item?.id) insertFeedback.run(item.id,item.userId,item.payload || JSON.stringify(item),item.status || '待处理',sqlDate(item.createdAt) || BigInt(now),sqlDate(item.repliedAt))

  const banners = Array.isArray(state.banners) && state.banners.length ? state.banners : currentBanners
  const insertBanner = db.prepare('INSERT INTO "Banner"(id,payload,enabled,sort,createdAt,updatedAt) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
  for (const item of banners) if (item?.id) { const payload = item.payload || JSON.stringify(item); insertBanner.run(item.id,payload,item.enabled === false || item.enabled === 0 ? 0 : 1,Number(item.sort || 0),sqlDate(item.createdAt) || BigInt(now),sqlDate(item.updatedAt) || BigInt(now)) }

  const rules = Array.isArray(state.discountRules) && state.discountRules.length ? state.discountRules : currentRules
  const insertRule = db.prepare('INSERT INTO "DiscountRule"(id,minPeople,discountRate,scopeCourseIds,enabled,updatedAt) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
  for (const item of rules) if (item?.id) insertRule.run(item.id,Number(item.minPeople || 1),Number(item.discountRate ?? 1),typeof item.scopeCourseIds === 'string' ? item.scopeCourseIds : JSON.stringify(item.courseIds || []),item.enabled === false || item.enabled === 0 ? 0 : 1,sqlDate(item.updatedAt) || BigInt(now))

  const payment = state.paymentSettings ? [{ id:'default',payload:JSON.stringify(state.paymentSettings) }] : currentPayment
  const insertPayment = db.prepare('INSERT INTO "PaymentSetting"(id,payload,updatedAt) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING')
  for (const item of payment) insertPayment.run(item.id || 'default',item.payload || '{}',sqlDate(item.updatedAt) || BigInt(now))

  const profileStmt = db.prepare('UPDATE "User" SET name=?,company=?,avatarText=?,registeredAt=?,enabled=?,points=?,updatedAt=? WHERE id=?')
  for (const [userId, item] of Object.entries(state.profiles || {})) profileStmt.run(item.name || '',item.company || '',item.avatarText || null,sqlDate(item.registeredAt) || BigInt(now),item.enabled === false ? 0 : 1,Number(item.points || 0),BigInt(now),userId)

  const auditMap = new Map()
  for (const item of [...legacyAudits, ...(state.auditLogs || [])]) if (item?.id) auditMap.set(item.id, item)
  const insertAudit = db.prepare('INSERT INTO "AuditLog"(id,actor,action,detail,createdAt) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
  for (const item of auditMap.values()) insertAudit.run(item.id,item.actor || 'system',item.action || '历史操作',item.detail || '',sqlDate(item.createdAt) || BigInt(now))

  for (const name of [...tables].reverse()) { const backup = `__backup_${name}`; if (exists(backup)) db.exec(`DROP TABLE "${backup}"`) }
  for (const name of legacyTables) if (exists(name)) db.exec(`DROP TABLE "${name}"`)
  db.exec('PRAGMA user_version=4; COMMIT; PRAGMA foreign_keys=ON;')
  console.log(`SQLite legacy data migrated: ${dbPath}`)
} catch (error) {
  db.exec('ROLLBACK')
  throw error
} finally {
  db.close()
}
