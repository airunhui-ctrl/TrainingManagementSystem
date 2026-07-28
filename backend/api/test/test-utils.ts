import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export interface TestDatabase { dir: string; databaseFile: string; uploadDir: string; cleanup: () => void }

export function createTestDatabase(): TestDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'training-api-'))
  const databaseFile = join(dir, 'training.db')
  const uploadDir = join(dir, 'payment-proofs')
  process.env.DATABASE_FILE = databaseFile
  process.env.UPLOAD_DIR = uploadDir
  process.env.JWT_SECRET = 'test-secret-at-least-32-characters'
  process.env.JWT_ACCESS_TTL = '15m'
  process.env.JWT_REFRESH_TTL = '1d'
  const cwd = resolve(__dirname, '..')
  const env = { ...process.env, DATABASE_FILE: databaseFile, UPLOAD_DIR: uploadDir }
  execFileSync(process.execPath, [resolve(cwd, 'prisma/migrate.js')], { cwd, env, stdio: 'pipe' })
  execFileSync(process.execPath, [resolve(cwd, 'prisma/seed.js')], { cwd, env, stdio: 'pipe' })
  return { dir, databaseFile, uploadDir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}
