
import { Module } from '@nestjs/common';

import {
  ConfigModule,
  ConfigService,
} from '@nestjs/config';

import { JwtModule } from '@nestjs/jwt';

import { PrismaModule } from '../prisma/prisma.module.js';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

// Import our authentication guard.
import { JwtAuthGuard } from './jwt-auth.guard.js';

// =====================================================
// AUTHENTICATION MODULE
// =====================================================

@Module({
  imports: [
    // Provides PrismaService for database operations.
    PrismaModule,

    // Configure JWT using environment variables.
    JwtModule.registerAsync({
      imports: [ConfigModule],

      // Inject ConfigService to read JWT_SECRET.
      inject: [ConfigService],

      useFactory: (configService: ConfigService) => ({
        // Decode our Base64 environment secret into
        // its original 32 cryptographically random bytes.
        secret: Buffer.from(
          configService.getOrThrow<string>('JWT_SECRET'),
          'base64',
        ),

        // Configure access token signing.
        signOptions: {
          algorithm: 'HS256',

          // Access tokens expire after 15 minutes.
          expiresIn: '15m',
        },

        // Only permit our chosen JWT algorithm.
        verifyOptions: {
          algorithms: ['HS256'],
        },
      }),
    }),
  ],

  // Handles registration, login, and user profile.
  controllers: [
    AuthController,
  ],

  // Register authentication services.
  providers: [
    // Handles registration and login business logic.
    AuthService,

    // Protects routes requiring valid access tokens.
    // NestJS injects JwtService and PrismaService
    // into this guard automatically.
    JwtAuthGuard,
  ],
})
export class AuthModule {}
