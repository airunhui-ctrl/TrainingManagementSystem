import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { createHash, randomBytes, randomInt } from 'node:crypto'
import { hashPassword, passwordMatches, PrismaService } from '../prisma.service'
import { resolveWechatIdentity } from '../channel-adapters'
import { deliverPasswordResetCode } from './password-reset-delivery'
import { deliverPhoneRegistrationCode } from './phone-registration-delivery'
import { normalizeUserRole, UserRole } from './roles'
import { AGREEMENT_VERSION } from '../common/agreement-version'
import { PASSWORD_POLICY_MESSAGE, isValidPassword } from '../common/password-policy'

export interface DemoUser { id: string; username: string; role: UserRole; sessionVersion: number }

function agreementRecord() {
  return { agreementVersion: AGREEMENT_VERSION, agreementAcceptedAt: new Date() }
}

function normalizeUsername(value: string) {
  return String(value || '').trim().toLowerCase()
}

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService, private readonly db: PrismaService) {}

  async login(usernameInput: string, password: string) {
    const username = String(usernameInput || '').trim()
    const row = (await this.db.user.findFirst({ where: { username } })) || (/^1\d{10}$/.test(username) ? await this.db.user.findFirst({ where: { phone: username } }) : null)
    if (!row || !row.enabled || !passwordMatches(password, row.passwordHash)) throw new UnauthorizedException('账号或密码错误')
    await this.db.user.update({ where: { id: row.id }, data: { lastLoginAt: new Date() } })
    const user: DemoUser = { id: row.id, username: row.username, role: normalizeUserRole(row.role), sessionVersion: row.sessionVersion }
    await this.db.revokeRefreshTokens(user.id)
    return this.issueTokens(user)
  }

  async register(input: { username: string; password: string; confirmPassword: string; name?: string; phone?: string; email?: string; agreementVersion?: string }) {
    const username = String(input.username || '').trim()
    const normalizedUsername = normalizeUsername(username)
    if (input.password !== input.confirmPassword) throw new BadRequestException('两次输入的密码不一致')
    if (!isValidPassword(input.password)) throw new BadRequestException(PASSWORD_POLICY_MESSAGE)
    if (input.agreementVersion !== AGREEMENT_VERSION) throw new BadRequestException('请先阅读并同意用户协议和隐私政策')
    const exists = await this.db.user.findFirst({ where: { username } })
    if (exists) throw new ConflictException('账号已存在，请直接登录')
    const name = String(input.name || '').trim()
    const phone = input.phone?.trim() || ''
    const email = input.email?.trim().toLowerCase() || ''
    if (phone && await this.db.user.findFirst({ where: { phone } })) throw new ConflictException('手机号已绑定其他账号')
    if (email && await this.db.user.findFirst({ where: { email } })) throw new ConflictException('邮箱已绑定其他账号')
    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.user.create({ data: {
        id: `u-${Date.now()}-${randomBytes(6).toString('hex')}`,
        username,
        usernameNormalized: normalizedUsername,
        passwordHash: hashPassword(input.password),
        role: 'user',
        name: name || null,
        phone: phone || null,
        email: email || null,
        avatarText: (name || username).slice(0, 2),
        enabled: true,
        ...agreementRecord(),
      } })
      await tx.auditLog.create({ data: { id: `LOG-${Date.now()}-${randomBytes(4).toString('hex')}`, actor: username, action: '用户注册', detail: '账号密码注册' } })
      return created
    })
    return this.issueTokens({ id: row.id, username: row.username, role: 'user', sessionVersion: row.sessionVersion })
  }

  async requestPhoneRegistration(phoneInput: string, requestIp?: string) {
    const phone = String(phoneInput || '').trim()
    if (!/^1\d{10}$/.test(phone)) throw new BadRequestException('请输入有效的手机号')
    const existing = await this.db.user.findFirst({ where: { phone } })
    const challengeId = `PRG-${Date.now()}-${randomBytes(6).toString('hex')}`
    if (existing) return { accepted: false, phoneRegistered: true, message: '该手机号已被注册，请直接登录' }
    const recentCount = await this.db.phoneRegistrationChallenge.count({ where: { phone, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } } })
    if (recentCount >= 5) return { accepted: true, challengeId, message: '请求过于频繁，请稍后再试' }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    await this.db.phoneRegistrationChallenge.updateMany({ where: { phone, usedAt: null }, data: { usedAt: new Date() } })
    await this.db.phoneRegistrationChallenge.create({ data: {
      id: challengeId,
      phone,
      codeHash: this.registrationCodeHash(challengeId, code),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      requestIp: requestIp || null,
    } })
    try {
      const delivery = await deliverPhoneRegistrationCode({ challengeId, phone, code })
      return { accepted: true, challengeId, message: '验证码已发送，请查收短信', ...(delivery.devCode ? { devCode: delivery.devCode } : {}) }
    } catch (error) {
      await this.db.phoneRegistrationChallenge.delete({ where: { id: challengeId } }).catch(() => undefined)
      throw error
    }
  }

  async confirmPhoneRegistration(input: { challengeId: string; phone: string; code: string; password: string; confirmPassword: string; username: string; agreementVersion?: string }) {
    const phone = String(input.phone || '').trim()
    if (!/^1\d{10}$/.test(phone)) throw new BadRequestException('请输入有效的手机号')
    if (input.password !== input.confirmPassword) throw new BadRequestException('两次输入的密码不一致')
    if (!isValidPassword(input.password)) throw new BadRequestException(PASSWORD_POLICY_MESSAGE)
    if (input.agreementVersion !== AGREEMENT_VERSION) throw new BadRequestException('请先阅读并同意用户协议和隐私政策')
    const challenge = await this.db.phoneRegistrationChallenge.findFirst({ where: { id: input.challengeId, phone } })
    if (!challenge) throw new BadRequestException('验证码无效，请重新获取')
    if (challenge.usedAt || challenge.expiresAt <= new Date()) throw new BadRequestException('验证码无效或已过期')
    if (challenge.attempts >= 5) throw new BadRequestException('验证码错误次数过多，请重新获取')
    if (challenge.codeHash !== this.registrationCodeHash(challenge.id, input.code)) {
      await this.db.phoneRegistrationChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } })
      throw new BadRequestException('验证码错误')
    }
    const existingPhone = await this.db.user.findFirst({ where: { phone } })
    if (existingPhone) throw new ConflictException('手机号已注册，请直接登录')
    const username = String(input.username || '').trim()
    const normalizedUsername = normalizeUsername(username)
    if (!/^[A-Za-z0-9_.@+-]{3,64}$/.test(username)) throw new BadRequestException('用户名需 3-64 位，可用字母、数字和 _ . @ + -')
    const existingUsername = await this.db.user.findFirst({ where: { username } })
    if (existingUsername) throw new ConflictException('用户名已存在，请更换后重试')
    const row = await this.db.$transaction(async (tx) => {
      const consumed = await tx.phoneRegistrationChallenge.updateMany({ where: { id: challenge.id, usedAt: null }, data: { usedAt: new Date() } })
      if (consumed.count !== 1) throw new BadRequestException('验证码无效或已被使用')
      const created = await tx.user.create({ data: {
        id: `u-${Date.now()}-${randomBytes(6).toString('hex')}`,
        username,
        usernameNormalized: normalizedUsername,
        passwordHash: hashPassword(input.password),
        role: 'user',
        name: null,
        phone,
        avatarText: username.slice(0, 2),
        enabled: true,
        ...agreementRecord(),
      } })
      await tx.auditLog.create({ data: { id: `LOG-${Date.now()}-${randomBytes(4).toString('hex')}`, actor: username, action: '用户注册', detail: '手机号短信注册' } })
      return created
    })
    return this.issueTokens({ id: row.id, username: row.username, role: 'user', sessionVersion: row.sessionVersion })
  }

  async requestPasswordReset(phoneInput: string, requestIp?: string) {
    const phone = String(phoneInput || '').trim()
    if (!/^1\d{10}$/.test(phone)) throw new BadRequestException('请输入有效的手机号')
    const row = await this.db.user.findFirst({ where: { phone } })
    const challengeId = `PRC-${Date.now()}-${randomBytes(6).toString('hex')}`
    if (!row || !row.enabled) return { accepted: true, challengeId, message: '如果手机号已注册，验证码会发送到该手机号' }
    const recentCount = await this.db.passwordResetChallenge.count({ where: { userId: row.id, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } } })
    if (recentCount >= 5) return { accepted: true, challengeId, message: '如果手机号已注册，请稍后再试' }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    await this.db.passwordResetChallenge.updateMany({ where: { userId: row.id, usedAt: null }, data: { usedAt: new Date() } })
    await this.db.passwordResetChallenge.create({ data: {
      id: challengeId,
      userId: row.id,
      targetType: 'phone',
      targetValue: phone,
      codeHash: this.resetCodeHash(challengeId, code),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      requestIp: requestIp || null,
    } })
    try {
      const delivery = await deliverPasswordResetCode({ challengeId, identifier: phone, targetType: 'phone', code })
      return { accepted: true, challengeId, message: '如果手机号已注册，验证码会发送到该手机号', ...(delivery.devCode ? { devCode: delivery.devCode } : {}) }
    } catch (error) {
      await this.db.passwordResetChallenge.delete({ where: { id: challengeId } }).catch(() => undefined)
      throw error
    }
  }

  async confirmPasswordReset(input: { challengeId: string; code: string; newPassword: string; confirmPassword: string }) {
    if (input.newPassword !== input.confirmPassword) throw new BadRequestException('两次输入的密码不一致')
    if (!isValidPassword(input.newPassword)) throw new BadRequestException(PASSWORD_POLICY_MESSAGE)
    const challenge = await this.db.passwordResetChallenge.findUnique({ where: { id: input.challengeId } })
    if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date()) throw new BadRequestException('验证码无效或已过期')
    if (challenge.attempts >= 5) throw new BadRequestException('验证码错误次数过多，请重新获取')
    if (challenge.codeHash !== this.resetCodeHash(challenge.id, input.code)) {
      await this.db.passwordResetChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } })
      throw new BadRequestException('验证码错误')
    }
    await this.db.$transaction(async (tx) => {
      const consumed = await tx.passwordResetChallenge.updateMany({ where: { id: challenge.id, usedAt: null }, data: { usedAt: new Date() } })
      if (consumed.count !== 1) throw new BadRequestException('验证码无效或已被使用')
      await tx.user.update({ where: { id: challenge.userId }, data: { passwordHash: hashPassword(input.newPassword), sessionVersion: { increment: 1 } } })
      await tx.refreshToken.updateMany({ where: { userId: challenge.userId, revokedAt: null }, data: { revokedAt: new Date() } })
      await tx.auditLog.create({ data: { id: `LOG-${Date.now()}-${randomBytes(4).toString('hex')}`, actor: challenge.userId, action: '找回密码', detail: '验证码校验通过并重置密码' } })
    })
    return { success: true, message: '密码已重置，请使用新密码登录' }
  }

  private resetCodeHash(challengeId: string, code: string) {
    const pepper = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET || 'development-reset-secret'
    return createHash('sha256').update(`${challengeId}:${code}:${pepper}`).digest('hex')
  }

  private registrationCodeHash(challengeId: string, code: string) {
    const pepper = process.env.PHONE_REGISTRATION_SECRET || process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET || 'development-registration-secret'
    return createHash('sha256').update(`${challengeId}:${code}:${pepper}`).digest('hex')
  }

  /**
   * 微信一键登录适配接口。
   * 生产环境应使用 code 向微信服务端换取 openid/unionid；当前未配置商户参数时，
   * 使用客户端提供的 deviceId/profileKey 生成稳定的开发环境身份，便于联调，不能作为生产鉴权依据。
   */
  async wechatLogin(code: string, profile: Record<string, any> = {}, scene?: 'mini_program' | 'h5' | 'official_account') {
    let identity: { openId: string; unionId?: string }
    try { identity = await resolveWechatIdentity(code, profile, scene) } catch (error: any) { throw new UnauthorizedException(error?.message || '微信登录凭证无效') }
    const wechatOpenId = identity.openId
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
        usernameNormalized: `wx_${suffix}`,
        passwordHash: hashPassword(randomBytes(24).toString('hex')),
        role: 'user', name: name || null, company: company || null, avatarText,
        phone: phone || null, gender: gender || null, email: email || null, wechatOpenId, lastLoginAt: new Date(), enabled: true,
      } })
    } else {
      row = await this.db.user.update({ where: { id: row.id }, data: {
        ...(row.usernameNormalized ? {} : { usernameNormalized: row.username.toLowerCase() }),
        ...(name ? { name } : {}), ...(company ? { company } : {}), ...(phone ? { phone } : {}),
        ...(gender ? { gender } : {}), ...(email ? { email } : {}), ...(name ? { avatarText } : {}), lastLoginAt: new Date(),
      } })
    }
    if (!row.enabled) throw new UnauthorizedException('账号已被禁用')
    await this.db.revokeRefreshTokens(row.id)
    return this.issueTokens({ id: row.id, username: row.username, role: 'user', sessionVersion: row.sessionVersion })
  }

  private async issueTokens(user: DemoUser) {
    const payload = { sub: user.id, username: user.username, role: user.role, sessionVersion: user.sessionVersion }
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
      return this.issueTokens({ id: user.id, username: user.username, role: normalizeUserRole(user.role), sessionVersion: user.sessionVersion })
    } catch { throw new UnauthorizedException('刷新令牌无效或已过期') }
  }
}
