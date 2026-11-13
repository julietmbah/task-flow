
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

import { DatabaseHealthController } from './database-health.controller.js';
import { DatabaseHealthService } from './database-health.service.js';

import { AuthModule } from './auth/auth.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TasksModule } from './tasks/tasks.module.js';

// =====================================================
// APPLICATION MONITORING
// =====================================================

// Initialize our existing monitoring module.
export const { ObserveModule, ObserveInstrument } =
  createObserveModule();

// =====================================================
// ROOT APPLICATION MODULE
// =====================================================

/**
 * AppModule
 *
 * The root module of our TaskFlow backend.
 *
 * Connects authentication, task management,
 * database access, and existing application services.
 */
@Module({
  imports: [
    // Load environment variables from the .env file.
    ConfigModule.forRoot({
      // Make ConfigService available throughout the app.
      isGlobal: true,

      // Cache environment variable lookups.
      cache: true,

      // Validate critical configuration during startup.
      validate: (config: Record<string, unknown>) => {
        const secret = config.JWT_SECRET;

        // Require a Base64-encoded secret containing
        // exactly 32 cryptographically random bytes.
        if (
          typeof secret !== 'string' ||
          !/^[A-Za-z0-9+/]{43}=$/.test(secret) ||
          Buffer.from(secret, 'base64').length !== 32
        ) {
          throw new Error(
            'JWT_SECRET must be a valid Base64-encoded 32-byte secret.',
          );
        }

        // Return the validated configuration.
        return config;
      },
    }),

    // Preserve our existing monitoring configuration.
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'backend',
    }),

    // Handles registration, login, and JWT authentication.
    AuthModule,

    // Provides Prisma database access.
    PrismaModule,

    // Registers our new task-management functionality.
    TasksModule,
  ],

  // Preserve existing application controllers.
  controllers: [
    AppController,
    DatabaseHealthController,
  ],

  // Preserve existing application services.
  providers: [
    AppService,
    DatabaseHealthService,
  ],
})
export class AppModule {}
