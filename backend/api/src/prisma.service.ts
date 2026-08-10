import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

const databaseUrl = () => {
  const configuredUrl = String(process.env.DATABASE_URL || '').trim()
  // Prisma Client is generated for the selected provider at build/deploy time.
  // Keep local SQLite compatibility, but do not reinterpret a PostgreSQL/MySQL
  // connection string as a filesystem path.
  if (/^(postgres(ql)?|mysql):\/\//i.test(configuredUrl)) return configuredUrl
  const raw = process.env.DATABASE_FILE || configuredUrl || './data/training.db'
  const value = raw.replace(/^file:/, '')
  const filePath = isAbsolute(value) ? value : resolve(process.cwd(), value)
  mkdirSync(dirname(filePath), { recursive: true })
  return `file:${filePath.replace(/\\/g, '/')}`
}

export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

export const passwordMatches = (password: string, encoded: string) => {
  const [salt, digest] = String(encoded || '').split(':')
  if (!salt || !digest) return false
  const actual = scryptSync(password, salt, 64)
  const expected = Buffer.from(digest, 'hex')
  return expected.length === actual.length && timingSafeEqual(actual, expected)
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ datasources: { db: { url: databaseUrl() } } })
  }

  async onModuleInit() { await this.$connect() }
  async onModuleDestroy() { await this.$disconnect() }

  async setPassword(userId: string, password: string) {
    return this.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(password), sessionVersion: { increment: 1 } } })
  }

  async revokeRefreshTokens(userId: string) {
    return this.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
  }

  async saveRefreshToken(row: { id: string; userId: string; tokenHash: string; expiresAt: Date }) {
    return this.refreshToken.create({ data: row })
  }

  async consumeRefreshToken(tokenHash: string) {
    return this.$transaction(async (tx) => {
      const row = await tx.refreshToken.findFirst({ where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } } })
      if (!row) return null
      await tx.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } })
      return row
    })
  }

  async saveAudit(actor: string, action: string, detail: string) {
    return this.auditLog.create({ data: { id: `LOG-${Date.now()}-${randomBytes(4).toString('hex')}`, actor, action, detail } })
  }

  tokenHash(token: string) { return createHash('sha256').update(token).digest('hex') }
}
