import { createHash, randomBytes, scryptSync } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }
if (/^(postgres(ql)?|mysql):\/\//i.test(String(process.env.DATABASE_URL || '').trim())) throw new Error('SQLite seed 不能处理 PostgreSQL/MySQL；请使用 PostgreSQL 专用迁移和导入流程')
const dbPath = resolve(process.env.DATABASE_FILE || 'data/training.db')
mkdirSync(resolve(dbPath, '..'), { recursive: true })
const db = new DatabaseSync(dbPath)
db.exec(`PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS User (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, passwordHash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', name TEXT, company TEXT, enabled INTEGER NOT NULL DEFAULT 1, points INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL); CREATE TABLE IF NOT EXISTS AppState (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updatedAt TEXT NOT NULL);`)
const hash = (password: string) => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}` }
const passwordHash = hash('123456')
const now = new Date().toISOString()
for (const user of [
  ['u-demo', 'demo', 'user', '培训用户', '厦门六边形人才科技有限公司', 128],
  ['u-admin', 'admin', 'admin', '系统管理员', '六边形培训', 0],
  ['u-operator', 'operator', 'admin', '运营管理员', '六边形培训', 0],
]) db.prepare('INSERT INTO User(id,username,passwordHash,role,name,company,enabled,points,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(username) DO UPDATE SET passwordHash=excluded.passwordHash,role=excluded.role,name=excluded.name,company=excluded.company,enabled=1,points=excluded.points,updatedAt=excluded.updatedAt').run(...user.slice(0, 6), 1, user[5], now, now)
db.prepare('INSERT INTO AppState(id,payload,updatedAt) VALUES(1,?,?) ON CONFLICT(id) DO NOTHING').run(JSON.stringify({}), now)
console.log(`SQLite seed complete: ${dbPath}`)
db.close()
