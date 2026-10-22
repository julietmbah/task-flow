
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

import { DatabaseHealthController } from './database-health.controller.js';
import { DatabaseHealthService } from './database-health.service.js';

import { AuthModule } from './auth/auth.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

// Initialize our existing monitoring module.
export const { ObserveModule, ObserveInstrument } =
  createObserveModule();

@Module({
  imports: [
    // Load environment variables from the .env file.
    ConfigModule.forRoot({
      // Make ConfigService available throughout the application.
      isGlobal: true,

      // Cache environment variable lookups.
      cache: true,

      // Validate critical configuration during application startup.
      validate: (config: Record<string, unknown>) => {
        const secret = config.JWT_SECRET;

        // Our secret must be a Base64-encoded string containing
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

        // Return validated environment configuration.
        return config;
      },
    }),

    // Preserve our existing optional monitoring configuration.
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'backend',
    }),

    // Handles user registration and login.
    AuthModule,

    // Provides database access through PrismaService.
    PrismaModule,
  ],

  // Keep our existing HTTP controllers.
  controllers: [
    AppController,
    DatabaseHealthController,
  ],

  // Keep our existing application services.
  providers: [
    AppService,
    DatabaseHealthService,
  ],
})
export class AppModule {}
