import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuthController } from './auth/auth.controller'
import { AuthService } from './auth/auth.service'
import { JwtGuard } from './auth/jwt.guard'
import { AdminGuard } from './auth/admin.guard'
import { MvpModule } from './mvp/mvp.module'
import { DatabaseModule } from './database.module'

@Module({ imports: [DatabaseModule, JwtModule.register({ secret: process.env.JWT_SECRET || 'mvp-only-change-me', signOptions: { expiresIn: process.env.JWT_ACCESS_TTL || '2h' } }), MvpModule], controllers: [AuthController], providers: [AuthService, JwtGuard, AdminGuard], exports: [JwtModule, AuthService, JwtGuard, AdminGuard] })
export class AppModule {}
