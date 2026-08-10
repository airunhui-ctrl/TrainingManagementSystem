import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma.service'
import { normalizeUserRole, UserRole } from './roles'

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly db: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: unknown }>()
    const header = request.headers.authorization || ''
    const [scheme, token] = header.split(' ')
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('缺少 Bearer token')
    try {
      const payload = this.jwt.verify<{ sub: string; username: string; role: UserRole; sessionVersion?: number; type?: string }>(token)
      if (payload.type !== 'access') throw new UnauthorizedException('令牌类型无效')
      const user = await this.db.user.findUnique({ where: { id: payload.sub }, select: { id: true, username: true, role: true, enabled: true, sessionVersion: true } })
      if (!user?.enabled) throw new UnauthorizedException('用户不可用')
      if (Number(payload.sessionVersion ?? 0) !== user.sessionVersion) throw new UnauthorizedException('登录状态已失效，请重新登录')
      request.user = { sub: user.id, username: user.username, role: normalizeUserRole(user.role), type: 'access' }
      return true
    } catch { throw new UnauthorizedException('JWT 无效或已过期') }
  }
}
