import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { ProfileController } from './profile.controller.js';
import { PasswordResetController } from './password-reset.controller.js';
import { PasswordResetMailService } from './password-reset-mail.service.js';
import { PasswordResetService } from './password-reset.service.js';

/**
 * Existing login, registration, and profile providers are unchanged.
 * Only the public password-recovery controller and its services are added.
 */
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: Buffer.from(
          configService.getOrThrow<string>('JWT_SECRET'),
          'base64',
        ),
        signOptions: { algorithm: 'HS256', expiresIn: '15m' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [
    AuthController,
    ProfileController,
    PasswordResetController,
  ],
  providers: [
    AuthService,
    JwtAuthGuard,
    PasswordResetMailService,
    PasswordResetService,
  ],
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
