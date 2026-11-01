
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

// =====================================================
// TASK MANAGEMENT MODULE
// =====================================================

/**
 * TasksModule
 *
 * Organizes the TaskFlow task-management feature.
 *
 * Responsibilities:
 * - Handle task-related HTTP requests.
 * - Authenticate users before accessing tasks.
 * - Execute task-management business logic.
 * - Read and write task data using Prisma.
 */
@Module({
  imports: [
    // Provides our configured JWT authentication
    // functionality and JwtAuthGuard.
    AuthModule,

    // Provides PrismaService for database operations.
    PrismaModule,
  ],

  // Register the controller for /tasks requests.
  controllers: [
    TasksController,
  ],

  // Register the task-management business logic.
  providers: [
    TasksService,
  ],
})
export class TasksModule {}
