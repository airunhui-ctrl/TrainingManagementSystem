const { createHash } = require('node:crypto')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { PrismaClient } = require('@prisma/client')

const inputArg = process.argv.find((item) => item.startsWith('--input='))
const databaseUrl = String(process.env.DATABASE_URL || '').trim()
if (process.argv.includes('--help')) {
  console.log('用法：DATABASE_URL=postgresql://... node prisma/verify-postgresql-reconciliation.cjs --input=/migration/postgresql-export.json')
  process.exit(0)
}
if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) throw new Error('对账前必须设置 DATABASE_URL=postgresql://...')
if (!inputArg) throw new Error('请提供 --input=path/to/export.json')

const input = resolve(process.cwd(), inputArg.slice('--input='.length))
const snapshot = JSON.parse(readFileSync(input, 'utf8'))
if (snapshot.format !== 'training-management.sqlite-export.v1' || !snapshot.tables) throw new Error('导出文件格式不受支持')
const { sha256, ...withoutHash } = snapshot
const expectedHash = createHash('sha256').update(JSON.stringify(withoutHash, null, 2)).digest('hex')
if (sha256 && sha256 !== expectedHash) throw new Error(`导出文件 SHA-256 校验失败：expected=${sha256} actual=${expectedHash}`)

const importTables = [
  'User', 'Course', 'RegistrationTemplate', 'RegistrationTemplateVersion', 'SystemConfig',
  'DiscountRule', 'Message', 'MessageRead', 'Banner', 'AuditLog', 'Student',
  'StudentMigrationBatch', 'StudentMigrationIssue', 'AccountStudent', 'Order',
  'PaymentTransaction', 'PaymentProof', 'Invoice', 'Preview', 'Feedback', 'PointLedger', 'Enrollment',
]
const modelName = (table) => table[0].toLowerCase() + table.slice(1)
const byStatus = (rows) => rows.reduce((result, row) => {
  const status = String(row.status || '未设置')
  const item = result[status] || { count: 0, amount: 0 }
  item.count += 1
  item.amount += Number(row.amount || 0)
  result[status] = item
  return result
}, {})
const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100
const sameMoney = (left, right) => Math.abs(roundMoney(left) - roundMoney(right)) < 0.01

async function main() {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    await db.$connect()
    const counts = {}
    const mismatches = []
    for (const table of importTables) {
      const expected = Number(snapshot.counts?.[table] ?? (snapshot.tables[table] || []).length)
      const actual = await db[modelName(table)].count()
      counts[table] = { expected, actual }
      if (expected !== actual) mismatches.push(`${table} count expected=${expected} actual=${actual}`)
    }

    const sourceOrders = snapshot.tables.Order || []
    const targetOrders = await db.order.findMany({ select: { amount: true, status: true } })
    const expectedStatuses = byStatus(sourceOrders)
    const actualStatuses = byStatus(targetOrders)
    const statuses = [...new Set([...Object.keys(expectedStatuses), ...Object.keys(actualStatuses)])].sort()
    const orderStatus = {}
    for (const status of statuses) {
      const expected = expectedStatuses[status] || { count: 0, amount: 0 }
      const actual = actualStatuses[status] || { count: 0, amount: 0 }
      orderStatus[status] = { expected: { count: expected.count, amount: roundMoney(expected.amount) }, actual: { count: actual.count, amount: roundMoney(actual.amount) } }
      if (expected.count !== actual.count || !sameMoney(expected.amount, actual.amount)) mismatches.push(`Order status ${status} count/amount mismatch`)
    }

    const sourceCourses = snapshot.tables.Course || []
    const targetCourses = await db.course.findMany({ select: { id: true, enrolled: true } })
    const targetCourseMap = new Map(targetCourses.map((course) => [course.id, course.enrolled]))
    let courseEnrollmentMismatches = 0
    for (const course of sourceCourses) {
      if (!targetCourseMap.has(course.id) || Number(course.enrolled || 0) !== Number(targetCourseMap.get(course.id) || 0)) courseEnrollmentMismatches += 1
    }
    if (courseEnrollmentMismatches) mismatches.push(`Course enrolled mismatch count=${courseEnrollmentMismatches}`)

    const result = {
      input,
      sha256: sha256 || null,
      passed: mismatches.length === 0,
      counts,
      orderStatus,
      courseEnrollmentMismatches,
      relations: {
        student: counts.Student,
        accountStudent: counts.AccountStudent,
        enrollment: counts.Enrollment,
      },
      mismatches,
    }
    console.log(JSON.stringify(result, null, 2))
    if (mismatches.length) process.exitCode = 1
  } finally {
    await db.$disconnect()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
