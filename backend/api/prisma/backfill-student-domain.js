#!/usr/bin/env node

/*
 * P2：把 Order.participants 的历史快照回填到 Student/AccountStudent/Enrollment。
 *
 * 设计原则：
 * - 默认按 createdAt、id 稳定排序，支持通过 cursorOrderId 断点续跑；
 * - 真实写入使用确定性 ID 和唯一键，重复执行不会产生重复履历；
 * - 无法安全判断的记录不擅自合并，写入 StudentMigrationIssue；
 * - --dry-run 完全不写数据库，只输出同样的对账结构。
 */

const { createHash, randomUUID } = require('node:crypto')
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { dirname, isAbsolute, resolve } = require('node:path')
const { DatabaseSync } = require('node:sqlite')

const args = new Set(process.argv.slice(2).filter((item) => item.startsWith('--') && !item.includes('=')))
const valueOf = (name, fallback = '') => {
  const prefix = `--${name}=`
  const item = process.argv.slice(2).find((entry) => entry.startsWith(prefix))
  return item ? item.slice(prefix.length) : fallback
}
const dryRun = args.has('--dry-run')
const rawDatabase = valueOf('database-file', process.env.DATABASE_FILE || process.env.DATABASE_URL || './data/training.db').replace(/^file:/, '')
const databaseFile = isAbsolute(rawDatabase) ? rawDatabase : resolve(process.cwd(), rawDatabase)
const requestedBatchId = valueOf('batch-id', '')
const reportFile = valueOf('report-file', '')
const db = new DatabaseSync(databaseFile)
db.exec('PRAGMA foreign_keys=ON')

const hash = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 24)
const idFor = (prefix, value) => `${prefix}-${hash(value)}`
const now = () => new Date().toISOString()
const text = (value) => String(value ?? '').trim()
const normalizePhone = (value) => {
  const digits = text(value).replace(/[\s-]/g, '')
  if (!digits) return null
  if (/^\+86/.test(digits)) return digits.slice(3)
  if (/^0086/.test(digits)) return digits.slice(4)
  return digits
}
const parseJson = (value) => {
  try { return JSON.parse(value) } catch { return null }
}
const jsonText = (value) => JSON.stringify(value ?? {})
const asDate = (value) => value instanceof Date ? value.toISOString() : (value ? new Date(value).toISOString() : now())
const nameKey = (value) => text(value).replace(/\s+/g, '').toLowerCase()
const safeRows = (sql, ...params) => db.prepare(sql).all(...params)
const one = (sql, ...params) => db.prepare(sql).get(...params)
const run = (sql, ...params) => db.prepare(sql).run(...params)

if (!one("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='StudentMigrationBatch'")) {
  throw new Error('P2 迁移运维表不存在，请先执行 pnpm.cmd --dir backend/api db:migrate')
}

const orders = safeRows('SELECT id,userId,courseId,participantCount,participants,status,createdAt,updatedAt FROM "Order" ORDER BY createdAt ASC, id ASC')
const courses = new Map(safeRows('SELECT id,title,registrationTemplateId FROM "Course"').map((item) => [item.id, item]))
const templates = new Map(safeRows('SELECT id,name,version,payload,updatedAt FROM "RegistrationTemplate"').map((item) => [item.id, item]))
const totalParticipants = orders.reduce((sum, order) => {
  const parsed = parseJson(order.participants)
  return sum + (Array.isArray(parsed) ? parsed.length : 0)
}, 0)

const issues = []
const orderReports = []
const courseReports = new Map()
const plannedStudentsByPhone = new Map()
let createdStudents = 0
let createdEnrollments = 0
let skippedParticipants = 0
let processedOrders = 0

const addIssue = (batchId, order, index, issueType, message, rawPayload) => {
  const issue = { id: idFor('issue', `${batchId}:${order?.id || 'none'}:${index ?? 'none'}:${issueType}:${message}`), batchId, orderId: order?.id || null, sourceParticipantIndex: index ?? null, issueType, message, rawPayload: rawPayload == null ? null : jsonText(rawPayload), status: 'open', createdAt: now() }
  issues.push(issue)
  return issue
}

const ensureBatch = () => {
  if (dryRun) return { id: requestedBatchId || `dry-run-${hash(`${databaseFile}:${Date.now()}`)}`, cursorOrderId: null, status: 'dry-run' }
  const id = requestedBatchId || `student-backfill-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${hash(randomUUID())}`
  const existing = one('SELECT * FROM "StudentMigrationBatch" WHERE id=?', id)
  if (existing?.status === 'completed') return existing
  if (!existing) {
    run('INSERT INTO "StudentMigrationBatch"(id,status,totalOrders,summary,startedAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)', id, 'running', orders.length, '{}', now(), now(), now())
    return one('SELECT * FROM "StudentMigrationBatch" WHERE id=?', id)
  }
  run('UPDATE "StudentMigrationBatch" SET status=?, totalOrders=?, updatedAt=? WHERE id=?', 'running', orders.length, now(), id)
  return one('SELECT * FROM "StudentMigrationBatch" WHERE id=?', id)
}

const batch = ensureBatch()
if (!dryRun && batch.status === 'completed') {
  const summary = parseJson(batch.summary) || {}
  const output = { batchId: batch.id, status: batch.status, resumed: false, ...summary }
  if (reportFile) { mkdirSync(dirname(resolve(process.cwd(), reportFile)), { recursive: true }); writeFileSync(resolve(process.cwd(), reportFile), JSON.stringify(output, null, 2)) }
  console.log(JSON.stringify(output, null, 2))
  db.close()
  process.exit(0)
}

const startIndex = batch.cursorOrderId ? Math.max(0, orders.findIndex((order) => order.id === batch.cursorOrderId) + 1) : 0
const selectedOrders = orders.slice(startIndex)

const processOrder = (order) => {
  const course = courses.get(order.courseId)
  const parsed = parseJson(order.participants)
  const report = { orderId: order.id, courseId: order.courseId, expectedParticipantCount: Number(order.participantCount || 0), parsedParticipantCount: 0, enrollmentCountBefore: 0, enrollmentCountAfter: 0, createdEnrollments: 0, skipped: 0, issues: 0 }
  if (!Array.isArray(parsed)) {
    report.issues += 1
    addIssue(batch.id, order, null, 'INVALID_PARTICIPANTS_JSON', 'participants 不是合法 JSON 数组', order.participants)
    orderReports.push(report)
    return
  }
  report.parsedParticipantCount = parsed.length
  report.enrollmentCountBefore = Number(one('SELECT COUNT(*) AS count FROM "Enrollment" WHERE orderId=?', order.id)?.count || 0)
  const template = course?.registrationTemplateId ? templates.get(course.registrationTemplateId) : null
  let templateVersionId = null
  if (template && !dryRun) {
    templateVersionId = one('SELECT id FROM "RegistrationTemplateVersion" WHERE templateId=? AND version=?', template.id, Number(template.version || 1))?.id || idFor('rtv', `${template.id}:${Number(template.version || 1)}`)
    run('INSERT INTO "RegistrationTemplateVersion"(id,templateId,version,payload,checksum,status,publishedAt,createdAt) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(templateId,version) DO NOTHING', templateVersionId, template.id, Number(template.version || 1), template.payload || '[]', hash(template.payload || '[]'), 'published', asDate(template.updatedAt), asDate(template.updatedAt))
    templateVersionId = one('SELECT id FROM "RegistrationTemplateVersion" WHERE templateId=? AND version=?', template.id, Number(template.version || 1))?.id || templateVersionId
  } else if (!template) {
    report.issues += 1
    addIssue(batch.id, order, null, 'MISSING_TEMPLATE', '订单所属课程没有可用的报名模板版本', { courseId: order.courseId })
  }

  for (const [index, raw] of parsed.entries()) {
    const participant = raw && typeof raw === 'object' ? raw : null
    if (!participant) {
      report.skipped += 1; skippedParticipants += 1; report.issues += 1
      addIssue(batch.id, order, index, 'INVALID_PARTICIPANT', '报名人不是对象', raw)
      continue
    }
    const name = text(participant.name)
    const phoneNormalized = normalizePhone(participant.phone)
    if (!name) {
      report.skipped += 1; skippedParticipants += 1; report.issues += 1
      addIssue(batch.id, order, index, 'MISSING_NAME', '报名人姓名为空，无法建立学员档案', participant)
      continue
    }
    let student = null
    if (phoneNormalized) {
      const persistedCandidates = safeRows('SELECT * FROM "Student" WHERE phoneNormalized=? ORDER BY createdAt ASC, id ASC', phoneNormalized)
      const plannedCandidate = plannedStudentsByPhone.get(phoneNormalized) || []
      const candidates = [...persistedCandidates]
      for (const item of plannedCandidate) if (!candidates.some((candidate) => candidate.id === item.id)) candidates.push(item)
      if (candidates.length > 1) {
        report.skipped += 1; skippedParticipants += 1; report.issues += 1
        addIssue(batch.id, order, index, 'PHONE_CONFLICT', `手机号 ${phoneNormalized} 已对应多个学员档案`, participant)
        continue
      }
      if (candidates.length === 1 && nameKey(candidates[0].name) !== nameKey(name)) {
        report.skipped += 1; skippedParticipants += 1; report.issues += 1
        addIssue(batch.id, order, index, 'PHONE_NAME_CONFLICT', `手机号 ${phoneNormalized} 与已有姓名不一致`, participant)
        continue
      }
      student = candidates[0] || null
    }
    const studentId = student?.id || idFor('stu', phoneNormalized ? `phone:${phoneNormalized}` : `legacy:${order.id}:${index}`)
      if (!student && !dryRun) {
      const existing = one('SELECT * FROM "Student" WHERE id=?', studentId)
      if (existing) student = existing
      else {
        run('INSERT INTO "Student"(id,name,phone,phoneNormalized,gender,email,company,department,position,status,extraPayload,createdByUserId,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', studentId, name, text(participant.phone) || null, phoneNormalized, text(participant.gender) || null, text(participant.email) || null, text(participant.company) || null, text(participant.department) || null, text(participant.position || participant.role) || null, 'active', jsonText(participant), order.userId, asDate(order.createdAt), asDate(order.updatedAt || order.createdAt))
        student = one('SELECT * FROM "Student" WHERE id=?', studentId)
        createdStudents += 1
      }
      } else if (!student) {
        student = { id: studentId, name }
      }
      if (phoneNormalized && student) plannedStudentsByPhone.set(phoneNormalized, [student])
    if (!phoneNormalized) {
      report.issues += 1
      addIssue(batch.id, order, index, 'MISSING_PHONE', '报名人手机号为空，已按订单和序号建立临时可追溯档案', participant)
    }
    if (!dryRun) {
      run('INSERT INTO "AccountStudent"(id,userId,studentId,relationType,isDefault,source,status,createdByUserId,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(userId,studentId) DO NOTHING', idFor('acct-stu', `${order.userId}:${studentId}`), order.userId, studentId, '代理报名', 0, 'migration', 'active', order.userId, asDate(order.createdAt), asDate(order.updatedAt || order.createdAt))
      const enrollmentId = idFor('enr', `${order.id}:${index}`)
      const existingEnrollment = one('SELECT * FROM "Enrollment" WHERE orderId=? AND sourceParticipantIndex=?', order.id, index)
      if (existingEnrollment && (existingEnrollment.studentId !== studentId || existingEnrollment.formPayload !== jsonText(participant))) {
        report.skipped += 1; skippedParticipants += 1; report.issues += 1
        addIssue(batch.id, order, index, 'ENROLLMENT_CONFLICT', '已存在的报名履历与历史快照不一致，未覆盖已有数据', participant)
        continue
      }
      if (!existingEnrollment) {
        const cancelled = order.status === '已取消'
        run('INSERT INTO "Enrollment"(id,studentId,courseId,orderId,accountUserId,sourceParticipantIndex,templateVersionId,templateVersion,formPayload,status,registeredAt,cancelledAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', enrollmentId, studentId, order.courseId, order.id, order.userId, index, templateVersionId, template ? Number(template.version || 1) : null, jsonText(participant), cancelled ? 'cancelled' : 'registered', asDate(order.createdAt), cancelled ? asDate(order.updatedAt || order.createdAt) : null, asDate(order.createdAt), asDate(order.updatedAt || order.createdAt))
        createdEnrollments += 1; report.createdEnrollments += 1
      }
    } else {
      report.createdEnrollments += 1
    }
  }
  report.enrollmentCountAfter = dryRun ? report.enrollmentCountBefore + report.createdEnrollments : Number(one('SELECT COUNT(*) AS count FROM "Enrollment" WHERE orderId=?', order.id)?.count || 0)
  if (report.expectedParticipantCount !== report.parsedParticipantCount) {
    report.issues += 1
    addIssue(batch.id, order, null, 'PARTICIPANT_COUNT_MISMATCH', `订单 participantCount=${report.expectedParticipantCount}，JSON 数组=${report.parsedParticipantCount}`, { participantCount: order.participantCount, parsed: report.parsedParticipantCount })
  }
  orderReports.push(report)
  const courseReport = courseReports.get(order.courseId) || { courseId: order.courseId, courseTitle: course?.title || order.courseId, orders: 0, participants: 0, enrollments: 0, issues: 0 }
  courseReport.orders += 1; courseReport.participants += report.parsedParticipantCount; courseReport.enrollments += report.enrollmentCountAfter; courseReport.issues += report.issues
  courseReports.set(order.courseId, courseReport)
}

try {
  for (const order of selectedOrders) {
    processOrder(order)
    processedOrders += 1
    if (!dryRun) {
      run('UPDATE "StudentMigrationBatch" SET cursorOrderId=?,processedOrders=?,createdStudents=?,createdEnrollments=?,skippedParticipants=?,issueCount=?,summary=?,updatedAt=? WHERE id=?', order.id, startIndex + processedOrders, createdStudents, createdEnrollments, skippedParticipants, issues.length, JSON.stringify({ phase: 'processing' }), now(), batch.id)
    }
  }
  const existingEnrollmentCount = Number(one('SELECT COUNT(*) AS count FROM "Enrollment"')?.count || 0)
  const existingStudentCount = Number(one('SELECT COUNT(*) AS count FROM "Student"')?.count || 0)
  const summary = {
    batchId: batch.id,
    status: dryRun ? 'dry-run' : 'completed',
    databaseFile,
    dryRun,
    orders: orders.length,
    processedOrders: dryRun ? selectedOrders.length : startIndex + processedOrders,
    participants: totalParticipants,
    enrollments: existingEnrollmentCount,
    students: existingStudentCount,
    createdStudents,
    createdEnrollments,
    skippedParticipants,
    issueCount: issues.length,
    ordersWithDifferences: orderReports.filter((item) => item.expectedParticipantCount !== item.parsedParticipantCount || item.issues > 0 || item.enrollmentCountAfter !== item.parsedParticipantCount).length,
    orderReports,
    courseReports: [...courseReports.values()],
    issues,
    generatedAt: now(),
  }
  if (!dryRun) {
    for (const issue of issues) run('INSERT INTO "StudentMigrationIssue"(id,batchId,orderId,sourceParticipantIndex,issueType,message,rawPayload,status,createdAt) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING', issue.id, issue.batchId, issue.orderId, issue.sourceParticipantIndex, issue.issueType, issue.message, issue.rawPayload, issue.status, issue.createdAt)
    run('UPDATE "StudentMigrationBatch" SET status=?,cursorOrderId=?,processedOrders=?,createdStudents=?,createdEnrollments=?,skippedParticipants=?,issueCount=?,summary=?,completedAt=?,updatedAt=? WHERE id=?', 'completed', orders.at(-1)?.id || null, orders.length, createdStudents, createdEnrollments, skippedParticipants, issues.length, JSON.stringify(summary), now(), now(), batch.id)
  }
  if (reportFile) { const target = resolve(process.cwd(), reportFile); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(summary, null, 2)) }
  console.log(JSON.stringify(summary, null, 2))
} catch (error) {
  if (!dryRun) run('UPDATE "StudentMigrationBatch" SET status=?,summary=?,updatedAt=? WHERE id=?', 'failed', JSON.stringify({ error: String(error?.message || error) }), now(), batch.id)
  throw error
} finally {
  db.close()
}
