const { createHash } = require('node:crypto')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { PrismaClient } = require('@prisma/client')

const inputArg = process.argv.find((item) => item.startsWith('--input='))
const databaseUrl = String(process.env.DATABASE_URL || '').trim()
if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) throw new Error('导入 PostgreSQL 前必须设置 DATABASE_URL=postgresql://...')
if (!inputArg) throw new Error('请提供 --input=path/to/export.json')
const input = resolve(process.cwd(), inputArg.slice('--input='.length))
const snapshot = JSON.parse(readFileSync(input, 'utf8'))
if (snapshot.format !== 'training-management.sqlite-export.v1' || !snapshot.tables) throw new Error('导出文件格式不受支持')
const { sha256, ...withoutHash } = snapshot
const expectedHash = createHash('sha256').update(JSON.stringify(withoutHash, null, 2)).digest('hex')
if (sha256 && sha256 !== expectedHash) throw new Error(`导出文件 SHA-256 校验失败：expected=${sha256} actual=${expectedHash}`)

const dateFields = { User: ['lastLoginAt', 'registeredAt', 'createdAt', 'updatedAt'], RefreshToken: ['expiresAt', 'revokedAt', 'createdAt'], Course: ['createdAt', 'updatedAt'], RegistrationTemplate: ['updatedAt'], RegistrationTemplateVersion: ['publishedAt', 'createdAt'], Order: ['createdAt', 'updatedAt'], PaymentTransaction: ['createdAt', 'updatedAt', 'paidAt'], PaymentProof: ['createdAt', 'reviewedAt'], Invoice: ['createdAt', 'processedAt'], Preview: ['viewedAt'], Feedback: ['createdAt', 'repliedAt'], PointLedger: ['createdAt'], Message: ['createdAt'], MessageRead: ['readAt'], AuditLog: ['createdAt'], Banner: ['createdAt', 'updatedAt'], PaymentSetting: ['updatedAt'], DiscountRule: ['updatedAt'], SystemConfig: ['updatedAt'], Student: ['createdAt', 'updatedAt'], StudentMigrationBatch: ['startedAt', 'completedAt', 'createdAt', 'updatedAt'], StudentMigrationIssue: ['handledAt', 'createdAt'], AccountStudent: ['revokedAt', 'createdAt', 'updatedAt'], Enrollment: ['registeredAt', 'cancelledAt', 'completedAt', 'createdAt', 'updatedAt'], PasswordResetChallenge: ['expiresAt', 'usedAt', 'createdAt'] }
const booleanFields = { User: ['enabled'], Message: ['enabled'], Banner: ['enabled'], DiscountRule: ['enabled'], Course: ['allowMultiParticipant'], AccountStudent: ['isDefault'] }
const asDate = (value) => { if (value === null || value === undefined || value === '') return null; const numeric = typeof value === 'number' || /^\d+$/.test(String(value)) ? Number(value) : NaN; const date = Number.isFinite(numeric) && numeric > 10_000_000_000 ? new Date(numeric) : new Date(value); if (Number.isNaN(date.getTime())) throw new Error(`无法转换日期：${value}`); return date }
const normalizeRow = (table, row) => {
  const result = { ...row }
  // SQLite keeps a legacy RegistrationTemplate.courseId column, while the
  // PostgreSQL schema models the relation from Course.registrationTemplateId.
  // Drop the legacy field before passing data to Prisma.
  if (table === 'RegistrationTemplate') delete result.courseId
  for (const field of dateFields[table] || []) if (field in result) result[field] = asDate(result[field])
  for (const field of booleanFields[table] || []) if (field in result && result[field] !== null) result[field] = Boolean(Number(result[field]))
  return result
}
const importOrder = ['User', 'Course', 'RegistrationTemplate', 'RegistrationTemplateVersion', 'SystemConfig', 'DiscountRule', 'Message', 'MessageRead', 'Banner', 'AuditLog', 'Student', 'StudentMigrationBatch', 'StudentMigrationIssue', 'AccountStudent', 'Order', 'PaymentTransaction', 'PaymentProof', 'Invoice', 'Preview', 'Feedback', 'PointLedger', 'Enrollment']
const skippedTables = ['RefreshToken', 'PasswordResetChallenge']
const modelName = (table) => table[0].toLowerCase() + table.slice(1)
async function main() {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  const imported = {}
  try {
    await db.$connect()
    await db.$transaction(async (tx) => {
      // Course.registrationTemplateId and RegistrationTemplate.courseId form a
      // cycle. Insert courses without the optional template FK first, import
      // templates (which require the course), then restore the FK values.
      const deferredCourseTemplateIds = new Map()
      for (const table of importOrder) {
        let rows = (snapshot.tables[table] || []).map((row) => normalizeRow(table, row))
        if (table === 'Course') {
          rows = rows.map((row) => {
            if (row.registrationTemplateId) deferredCourseTemplateIds.set(row.id, row.registrationTemplateId)
            return { ...row, registrationTemplateId: null }
          })
        }
        if (!rows.length) { imported[table] = 0; continue }
        imported[table] = (await tx[modelName(table)].createMany({ data: rows, skipDuplicates: true })).count
      }
      for (const [courseId, registrationTemplateId] of deferredCourseTemplateIds) {
        await tx.course.update({ where: { id: courseId }, data: { registrationTemplateId } })
      }
    }, { timeout: 120000 })
    const counts = {}; for (const table of importOrder) counts[table] = await db[modelName(table)].count()
    console.log(JSON.stringify({ input, imported, counts, skippedTables, sourceCounts: snapshot.counts, sha256 }, null, 2))
  } finally { await db.$disconnect() }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
