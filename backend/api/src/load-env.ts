import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

for (const file of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '..', '..', '.env')]) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
}

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'mvp-only-change-me')) {
  throw new Error('生产环境必须配置安全的 JWT_SECRET')
}
