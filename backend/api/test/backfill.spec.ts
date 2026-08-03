/// <reference path="./globals.d.ts" />
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { join, resolve } from 'node:path'

const runScript = (script: string, databaseFile: string, args: string[] = []) => {
  const cwd = resolve(__dirname, '..')
  return JSON.parse(execFileSync(process.execPath, [resolve(cwd, script), ...args], { cwd, env: { ...process.env, DATABASE_FILE: databaseFile }, encoding: 'utf8' }))
}

test('P2 历史回填支持 dry-run、异常留痕和幂等重复执行', () => {
  const dir = mkdtempSync(join(tmpdir(), 'training-backfill-'))
  const databaseFile = join(dir, 'training.db')
  const db = new DatabaseSync(databaseFile)
  db.exec(`
    CREATE TABLE User(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, passwordHash TEXT NOT NULL, role TEXT NOT NULL, name TEXT, company TEXT, avatarText TEXT, phone TEXT, gender TEXT, email TEXT, wechatOpenId TEXT, lastLoginAt DATETIME, registeredAt DATETIME NOT NULL, enabled INTEGER NOT NULL, points INTEGER NOT NULL, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL);
    CREATE TABLE Course(id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT, category TEXT NOT NULL, date TEXT NOT NULL, location TEXT NOT NULL, instructor TEXT NOT NULL, image TEXT, price REAL NOT NULL, originalPrice REAL, specialPrice REAL, allowMultiParticipant INTEGER NOT NULL, registrationDeadline TEXT, capacity INTEGER NOT NULL, enrolled INTEGER NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL, registrationTemplateId TEXT, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL);
    CREATE TABLE RegistrationTemplate(id TEXT PRIMARY KEY, name TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL, updatedAt DATETIME NOT NULL);
    CREATE TABLE [Order](id TEXT PRIMARY KEY, userId TEXT NOT NULL, courseId TEXT NOT NULL, participantCount INTEGER NOT NULL, participants TEXT NOT NULL, originalAmount REAL NOT NULL, discount REAL NOT NULL, amount REAL NOT NULL, status TEXT NOT NULL, paymentMethod TEXT, paymentChannel TEXT, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL);
  `)
  const timestamp = '2026-07-31T08:00:00.000Z'
  db.prepare('INSERT INTO User VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('u-1', 'demo', 'hash', 'user', '账号用户', '企业', null, null, null, null, null, null, timestamp, 1, 0, timestamp, timestamp)
  db.prepare('INSERT INTO Course VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('c-1', '测试课程', '', '测试', '2026-08-01', '厦门', '老师', null, 100, null, null, 1, null, 20, 0, '报名中', '', 'tpl-1', timestamp, timestamp)
  db.prepare('INSERT INTO RegistrationTemplate VALUES(?,?,?,?,?)').run('tpl-1', '测试模板', 1, JSON.stringify([{ key: 'name', type: 'text' }, { key: 'phone', type: 'phone' }]), timestamp)
  const insertOrder = db.prepare('INSERT INTO [Order] VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
  insertOrder.run('o-1', 'u-1', 'c-1', 1, JSON.stringify([{ name: '张三', phone: '13800000001' }]), 100, 0, 100, '待支付', 'offline', null, timestamp, timestamp)
  insertOrder.run('o-2', 'u-1', 'c-1', 1, '{bad-json', 100, 0, 100, '待支付', 'offline', null, timestamp, timestamp)
  insertOrder.run('o-3', 'u-1', 'c-1', 1, JSON.stringify([{ name: '冲突姓名', phone: '13800000001' }]), 100, 0, 100, '待支付', 'offline', null, timestamp, timestamp)
  db.close()

  const cwd = resolve(__dirname, '..')
  execFileSync(process.execPath, [resolve(cwd, 'prisma/migrate.js')], { cwd, env: { ...process.env, DATABASE_FILE: databaseFile }, stdio: 'pipe' })
  const dry = runScript('prisma/backfill-student-domain.js', databaseFile, ['--dry-run', '--batch-id=test-dry'])
  expect(dry.dryRun).toBe(true)
  expect(dry.students).toBe(0)
  expect(dry.issueCount).toBe(2)
  expect(dry.issues.map((item: { issueType: string }) => item.issueType).sort()).toEqual(['INVALID_PARTICIPANTS_JSON', 'PHONE_NAME_CONFLICT'])

  const first = runScript('prisma/backfill-student-domain.js', databaseFile, ['--batch-id=test-actual'])
  expect(first.status).toBe('completed')
  expect(first.createdStudents).toBe(1)
  expect(first.createdEnrollments).toBe(1)
  expect(first.issueCount).toBe(2)

  const second = runScript('prisma/backfill-student-domain.js', databaseFile, ['--batch-id=test-actual'])
  expect(second.status).toBe('completed')
  const check = new DatabaseSync(databaseFile)
  expect((check.prepare('SELECT COUNT(*) AS count FROM Student').get() as { count: number }).count).toBe(1)
  expect((check.prepare('SELECT COUNT(*) AS count FROM Enrollment').get() as { count: number }).count).toBe(1)
  expect((check.prepare('SELECT COUNT(*) AS count FROM StudentMigrationIssue').get() as { count: number }).count).toBe(2)
  check.close()
  rmSync(dir, { recursive: true, force: true })
})
