import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { isAdminRole } from './roles'

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ user?: { role?: string } }>()
    if (!isAdminRole(request.user?.role)) throw new ForbiddenException('需要管理员权限')
    return true
  }
}
