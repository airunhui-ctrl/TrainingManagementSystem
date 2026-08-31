import './load-env'
import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true })
  app.set('trust proxy', 1)
  app.setGlobalPrefix('api')
  app.enableCors()
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  await app.listen(process.env.PORT || 3100)
}
bootstrap()