import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { MvpController } from './mvp.controller'
import { MvpService } from './mvp.service'
import { JwtGuard } from '../auth/jwt.guard'
import { AdminGuard } from '../auth/admin.guard'

@Module({ imports: [JwtModule.register({ secret: process.env.JWT_SECRET || 'mvp-only-change-me' })], controllers: [MvpController], providers: [MvpService, JwtGuard, AdminGuard], exports: [MvpService] })
export class MvpModule {}
