import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { createHash, randomBytes } from 'node:crypto'
import { hashPassword, passwordMatches, PrismaService } from '../prisma.service'

export type UserRole = 'admin' | 'user'
export interface DemoUser { id: string; username: string; role: UserRole }

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService, private readonly db: PrismaService) {}

  async login(username: string, password: string) {
    const row = await this.db.user.findUnique({ where: { username } })
    if (!row || !row.enabled || !passwordMatches(password, row.passwordHash)) throw new UnauthorizedException('账号或密码错误')
    await this.db.user.update({ where: { id: row.id }, data: { lastLoginAt: new Date() } })
    const user: DemoUser = { id: row.id, username: row.username, role: row.role === 'admin' ? 'admin' : 'user' }
    await this.db.revokeRefreshTokens(user.id)
    return this.issueTokens(user)
  }

  /**
   * 微信一键登录适配接口。
   * 生产环境应使用 code 向微信服务端换取 openid/unionid；当前未配置商户参数时，
   * 使用客户端提供的 deviceId/profileKey 生成稳定的开发环境身份，便于联调，不能作为生产鉴权依据。
   */
  async wechatLogin(code: string, profile: Record<string, any> = {}) {
    const identity = String(profile.openId || profile.unionId || profile.deviceId || code || '').trim()
    if (!identity) throw new UnauthorizedException('微信登录凭证无效')
    const wechatOpenId = `mock:${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`
    let row = await this.db.user.findFirst({ where: { wechatOpenId } })
    const name = String(profile.nickName || profile.name || '').trim()
    const avatarText = String(name || '微').slice(0, 2)
    const gender = String(profile.gender || '').trim()
    const phone = String(profile.phone || '').trim()
    const company = String(profile.company || '').trim()
    const email = String(profile.email || '').trim()
    if (!row) {
      const suffix = wechatOpenId.slice(-12)
      row = await this.db.user.create({ data: {
        id: `u-wx-${suffix}`,
        username: `wx_${suffix}`,
        passwordHash: hashPassword(randomBytes(24).toString('hex')),
        role: 'user', name: name || '微信用户', company: company || null, avatarText,
        phone: phone || null, gender: gender || null, email: email || null, wechatOpenId, lastLoginAt: new Date(), enabled: true,
      } })
    } else {
      row = await this.db.user.update({ where: { id: row.id }, data: {
        ...(name ? { name } : {}), ...(company ? { company } : {}), ...(phone ? { phone } : {}),
        ...(gender ? { gender } : {}), ...(email ? { email } : {}), ...(name ? { avatarText } : {}), lastLoginAt: new Date(),
      } })
    }
    if (!row.enabled) throw new UnauthorizedException('账号已被禁用')
    await this.db.revokeRefreshTokens(row.id)
    return this.issueTokens({ id: row.id, username: row.username, role: 'user' })
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
