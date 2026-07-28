import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { randomBytes } from 'node:crypto'
import { passwordMatches, PrismaService } from '../prisma.service'

export type UserRole = 'admin' | 'user'
export interface DemoUser { id: string; username: string; role: UserRole }

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService, private readonly db: PrismaService) {}

  async login(username: string, password: string) {
    const row = await this.db.user.findUnique({ where: { username } })
    if (!row || !row.enabled || !passwordMatches(password, row.passwordHash)) throw new UnauthorizedException('账号或密码错误')
    const user: DemoUser = { id: row.id, username: row.username, role: row.role === 'admin' ? 'admin' : 'user' }
    await this.db.revokeRefreshTokens(user.id)
    return this.issueTokens(user)
  }

  private async issueTokens(user: DemoUser) {
    const payload = { sub: user.id, username: user.username, role: user.role }
    const accessToken = this.jwt.sign({ ...payload, type: 'access' })
    const refreshToken = this.jwt.sign({ ...payload, type: 'refresh', jti: randomBytes(12).toString('hex') }, { expiresIn: process.env.JWT_REFRESH_TTL || '14d' })
    const decoded = this.jwt.decode(refreshToken) as { exp?: number }
    await this.db.saveRefreshToken({ id: `RT-${Date.now()}-${randomBytes(4).toString('hex')}`, userId: user.id, tokenHash: this.db.tokenHash(refreshToken), expiresAt: new Date((decoded.exp || Math.floor(Date.now() / 1000) + 14 * 86400) * 1000) })
    return { accessToken, refreshToken, user }
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify<{ sub: string; username: string; role: UserRole; type?: string }>(refreshToken)
      if (payload.type !== 'refresh' || !(await this.db.consumeRefreshToken(this.db.tokenHash(refreshToken)))) throw new UnauthorizedException('刷新令牌已吊销或无效')
      const user = await this.db.user.findUnique({ where: { id: payload.sub } })
      if (!user || !user.enabled) throw new UnauthorizedException('用户不可用')
      return this.issueTokens({ id: user.id, username: user.username, role: user.role === 'admin' ? 'admin' : 'user' })
    } catch { throw new UnauthorizedException('刷新令牌无效或已过期') }
  }
}
