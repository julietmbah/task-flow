
import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

import { PrismaService } from './prisma/prisma.service.js';

import { DatabaseHealthController } from './database-health.controller.js';
import { DatabaseHealthService } from './database-health.service.js';

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
  ],

  // Controllers handle incoming HTTP requests.
  controllers: [
    AppController,
    DatabaseHealthController,
  ],

  // Providers contain application logic and
  // database functionality.
  providers: [
    AppService,
    PrismaService,
    DatabaseHealthService,
  ],
})
export class AppModule {}
