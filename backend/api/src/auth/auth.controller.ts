import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { IsEmail, IsIn, IsObject, IsOptional, IsString, Length, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator'
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
  @IsIn(['mini_program', 'h5', 'official_account']) @IsOptional() scene?: 'mini_program' | 'h5' | 'official_account'
}

class RegisterDto {
  @IsString() @MinLength(3) @MaxLength(64) @Matches(/^[A-Za-z0-9_.@+-]+$/) username!: string
  @IsString() @MinLength(8) @MaxLength(64) password!: string
  @IsString() @MinLength(8) @MaxLength(64) confirmPassword!: string
  @IsOptional() @IsString() @MaxLength(80) name?: string
  @ValidateIf((_, value) => value !== undefined && value !== null && value !== '') @IsString() @Matches(/^1\d{10}$/) phone?: string
  @ValidateIf((_, value) => value !== undefined && value !== null && value !== '') @IsEmail() email?: string
}

class PhoneRegistrationRequestDto {
  @IsString() @Matches(/^1\d{10}$/) phone!: string
}

class PhoneRegistrationConfirmDto {
  @IsString() @Matches(/^PRG-[A-Za-z0-9-]+$/) challengeId!: string
  @IsString() @Matches(/^1\d{10}$/) phone!: string
  @IsString() @Length(6, 6) @Matches(/^\d{6}$/) code!: string
  @IsString() @MinLength(8) @MaxLength(64) password!: string
  @IsString() @MinLength(8) @MaxLength(64) confirmPassword!: string
  @IsOptional() @IsString() @MaxLength(80) name?: string
}

class PasswordResetRequestDto {
  @IsString() @MinLength(3) @MaxLength(120) identifier!: string
}

class PasswordResetConfirmDto {
  @IsString() @Matches(/^PRC-[A-Za-z0-9-]+$/) challengeId!: string
  @IsString() @Length(6, 6) @Matches(/^\d{6}$/) code!: string
  @IsString() @MinLength(8) @MaxLength(64) newPassword!: string
  @IsString() @MinLength(8) @MaxLength(64) confirmPassword!: string
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login') login(@Body() dto: LoginDto) { return this.auth.login(dto.username, dto.password) }
  @Post('register') register(@Body() dto: RegisterDto) { return this.auth.register(dto) }
  @Post('register/sms/request') requestPhoneRegistration(@Body() dto: PhoneRegistrationRequestDto, @Req() request: { ip?: string }) { return this.auth.requestPhoneRegistration(dto.phone, request.ip) }
  @Post('register/sms/confirm') confirmPhoneRegistration(@Body() dto: PhoneRegistrationConfirmDto) { return this.auth.confirmPhoneRegistration(dto) }
  @Post('password-reset/request') requestPasswordReset(@Body() dto: PasswordResetRequestDto, @Req() request: { ip?: string }) { return this.auth.requestPasswordReset(dto.identifier, request.ip) }
  @Post('password-reset/confirm') confirmPasswordReset(@Body() dto: PasswordResetConfirmDto) { return this.auth.confirmPasswordReset(dto) }
  @Post('wechat-login') wechatLogin(@Body() dto: WechatLoginDto) { return this.auth.wechatLogin(String(dto.code || ''), dto.profile || {}, dto.scene) }
  @Post('refresh') refresh(@Body() dto: RefreshDto) { return this.auth.refresh(dto.refreshToken) }

  @UseGuards(JwtGuard)
  @Get('me') me(@Req() request: { user?: unknown }) { return { user: request.user } }
}
