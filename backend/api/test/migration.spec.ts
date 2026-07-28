/// <reference path="./globals.d.ts" />
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { hashPassword, PrismaService } from '../src/prisma.service'

test('旧 AppState/文本日期数据库可无损迁移到 Prisma 结构化表', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'training-legacy-'))
  const databaseFile = join(dir, 'training.db')
  const legacy = new DatabaseSync(databaseFile)
  legacy.exec('CREATE TABLE AppState(id INTEGER PRIMARY KEY,payload TEXT NOT NULL,updatedAt TEXT NOT NULL); CREATE TABLE User(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,passwordHash TEXT NOT NULL,role TEXT NOT NULL,name TEXT,company TEXT,enabled INTEGER NOT NULL,points INTEGER NOT NULL,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL); CREATE TABLE PaymentProof(id TEXT PRIMARY KEY,orderId TEXT NOT NULL,originalName TEXT NOT NULL,storedName TEXT NOT NULL,mimeType TEXT NOT NULL,size INTEGER NOT NULL,path TEXT NOT NULL,status TEXT NOT NULL,remark TEXT,createdAt TEXT NOT NULL,reviewedAt TEXT); CREATE TABLE AuditLog(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL,createdAt TEXT NOT NULL);')
  const timestamp = '2026-07-23T08:58:30.947Z'
  for (const user of [['u-demo','demo','user'],['u-admin','admin','admin'],['u-operator','operator','admin']]) legacy.prepare('INSERT INTO User VALUES(?,?,?,?,?,?,?,?,?,?)').run(user[0],user[1],hashPassword('123456'),user[2],user[1],'测试企业',1,0,timestamp,timestamp)
  const state = {
    courses: [{ id:'course-legacy',title:'旧库课程',subtitle:'',category:'测试',date:'2026-08-01',location:'厦门',instructor:'测试讲师',price:100,capacity:10,enrolled:1,status:'报名中',description:'迁移测试' }],
    templates: { 'course-legacy': [{ key:'name',label:'姓名',type:'text',required:true }] },
    orders: { 'HX-LEGACY': { id:'HX-LEGACY',userId:'u-demo',courseId:'course-legacy',participants:[{ name:'旧学员' }],participantCount:1,originalAmount:100,discount:0,amount:100,status:'待审核',paymentMethod:'offline',createdAt:timestamp } },
    invoices: [], previews: [], banners: [], feedbacks: [], auditLogs: [], discountRules: [{ id:'rule-legacy',minPeople:2,discountRate:0.9,enabled:true }], paymentSettings: { accountName:'旧收款户' }, profiles: { 'u-demo': { name:'旧用户',company:'旧企业',registeredAt:'2026-07-01',enabled:true,points:12 } },
  }
  legacy.prepare('INSERT INTO AppState VALUES(1,?,?)').run(JSON.stringify(state), timestamp)
  legacy.prepare('INSERT INTO PaymentProof VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('PP-LEGACY','HX-LEGACY','proof.png','proof.png','image/png',8,'payment-proofs/proof.png','pending',null,timestamp,null)
  legacy.close()

  const cwd = resolve(__dirname, '..')
  const env = { ...process.env, DATABASE_FILE: databaseFile }
  execFileSync(process.execPath, [resolve(cwd, 'prisma/migrate.js')], { cwd, env, stdio: 'pipe' })
  execFileSync(process.execPath, [resolve(cwd, 'prisma/seed.js')], { cwd, env, stdio: 'pipe' })
  process.env.DATABASE_FILE = databaseFile
  const db = new PrismaService()
  await db.$connect()
  expect((await db.course.findUnique({ where: { id: 'course-legacy' } }))?.title).toBe('旧库课程')
  expect((await db.order.findUnique({ where: { id: 'HX-LEGACY' } }))?.status).toBe('待审核')
  expect(await db.paymentProof.count()).toBe(1)
  expect((await db.user.findUnique({ where: { username: 'demo' } }))?.createdAt).toBeInstanceOf(Date)
  await db.$disconnect()
  const check = new DatabaseSync(databaseFile)
  const appStateTable = check.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='AppState'").get() as { count: number }
  expect(appStateTable.count).toBe(0)
  check.close()
  rmSync(dir, { recursive: true, force: true })
})
