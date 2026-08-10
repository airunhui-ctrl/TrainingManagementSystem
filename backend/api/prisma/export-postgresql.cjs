const { createHash } = require('node:crypto')
const { mkdirSync, writeFileSync } = require('node:fs')
const { dirname, isAbsolute, resolve } = require('node:path')
const { DatabaseSync } = require('node:sqlite')

const valueOf = (name, fallback) => {
  const prefix = `--${name}=`
  const value = process.argv.slice(2).find((item) => item.startsWith(prefix))
  return value ? value.slice(prefix.length) : fallback
}
const rawDatabase = valueOf('database-file', process.env.DATABASE_FILE || './data/training.db').replace(/^file:/, '')
const databaseFile = isAbsolute(rawDatabase) ? rawDatabase : resolve(process.cwd(), rawDatabase)
const output = resolve(process.cwd(), valueOf('output', `data/postgresql-export-${Date.now()}.json`))
const db = new DatabaseSync(databaseFile, { readOnly: true })
const tableNames = ['User', 'RefreshToken', 'Course', 'RegistrationTemplate', 'RegistrationTemplateVersion', 'Order', 'PaymentTransaction', 'PaymentProof', 'Invoice', 'Preview', 'Feedback', 'PointLedger', 'Message', 'MessageRead', 'AuditLog', 'Banner', 'PaymentSetting', 'DiscountRule', 'SystemConfig', 'Student', 'StudentMigrationBatch', 'StudentMigrationIssue', 'AccountStudent', 'Enrollment', 'PasswordResetChallenge']
const exists = (name) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
const data = Object.fromEntries(tableNames.map((name) => [name, exists(name) ? db.prepare(`SELECT * FROM "${name}"`).all() : []]))
const replacer = (_key, value) => typeof value === 'bigint' ? `${value}` : value
const payload = { format: 'training-management.sqlite-export.v1', source: databaseFile, userVersion: Number(db.prepare('PRAGMA user_version').get().user_version || 0), generatedAt: new Date().toISOString(), counts: Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.length])), tables: data }
const serialized = JSON.stringify(payload, replacer, 2)
payload.sha256 = createHash('sha256').update(serialized).digest('hex')
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify(payload, replacer, 2), 'utf8')
db.close()
console.log(JSON.stringify({ output, source: databaseFile, userVersion: payload.userVersion, counts: payload.counts, sha256: payload.sha256 }, null, 2))
