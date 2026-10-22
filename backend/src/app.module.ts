
import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

import { DatabaseHealthController } from './database-health.controller.js';
import { DatabaseHealthService } from './database-health.service.js';

import { AuthModule } from './auth/auth.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

// Initialize the optional NestJS monitoring module.
export const { ObserveModule, ObserveInstrument } =
  createObserveModule();

@Module({
  // Import modules required by our application.
  imports: [
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'backend',
    }),

    // Authentication module handles registration and login.
    AuthModule,

    // Makes the exported PrismaService available
    // to services inside AppModule.
    PrismaModule,
  ],

  // Controllers handle incoming HTTP requests.
  controllers: [
    AppController,
    DatabaseHealthController,
  ],

  // Providers contain injectable application services.
  providers: [
    AppService,
    DatabaseHealthService,
  ],
})
export class AppModule {}
