
import { Module } from '@nestjs/common';

import {
  ConfigModule,
  ConfigService,
} from '@nestjs/config';

import { JwtModule } from '@nestjs/jwt';

import { PrismaModule } from '../prisma/prisma.module.js';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

// =====================================================
// AUTHENTICATION MODULE
// =====================================================

/**
 * AuthModule
 *
 * Responsible for:
 * - Registering new users.
 * - Authenticating existing users.
 * - Creating and verifying JWT access tokens.
 * - Protecting authenticated endpoints.
 */
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
        // Decode the Base64 secret into its original
        // 32 cryptographically random bytes.
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

  // Register authentication services and guards.
  providers: [
    // Handles registration and login business logic.
    AuthService,

    // Verifies JWTs and authenticates users.
    JwtAuthGuard,
  ],

  // Make JWT capabilities available to other modules
  // that import AuthModule, including TasksModule.
  exports: [
    JwtModule,
    JwtAuthGuard,
  ],
})
export class AuthModule {}
