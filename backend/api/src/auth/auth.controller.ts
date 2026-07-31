import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { IsObject, IsOptional, IsString, MinLength } from 'class-validator'
import { AuthService } from './auth.service'
import { JwtGuard } from './jwt.guard'

class LoginDto {
  @IsString() username!: string
  @IsString() @MinLength(6) password!: string
}

class RefreshDto {
  @IsString() @MinLength(20) refreshToken!: string
}

class WechatLoginDto {
  @IsString() @IsOptional() code?: string
  @IsObject() @IsOptional() profile?: Record<string, any>
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login') login(@Body() dto: LoginDto) { return this.auth.login(dto.username, dto.password) }
  @Post('wechat-login') wechatLogin(@Body() dto: WechatLoginDto) { return this.auth.wechatLogin(String(dto.code || ''), dto.profile || {}) }
  @Post('refresh') refresh(@Body() dto: RefreshDto) { return this.auth.refresh(dto.refreshToken) }

  @UseGuards(JwtGuard)
  @Get('me') me(@Req() request: { user?: unknown }) { return { user: request.user } }
}
