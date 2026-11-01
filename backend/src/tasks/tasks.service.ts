
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Describes the information needed to create a task.
 *
 * We will validate incoming HTTP data using a DTO
 * when we build the TasksController.
 *
 * Notice that userId is NOT included here.
 * The task owner will come from the authenticated user.
 */
export interface CreateTaskInput {
  title: string;
  description?: string;
  dueDate?: Date;
}

/**
 * TasksService
 *
 * Contains the business logic for managing tasks.
 * PrismaService provides access to PostgreSQL.
 */
@Injectable()
export class TasksService {
  /**
   * NestJS injects PrismaService automatically.
   *
   * This is called dependency injection.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a task belonging to a registered user.
   *
   * @param userId - ID obtained from verified authentication.
   * @param input - Task information supplied by the user.
   */
  async createTask(userId: string, input: CreateTaskInput) {
    return this.prisma.task.create({
      data: {
        // Every task must have a title.
        title: input.title,

        // Include optional fields only when provided.
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),

        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate }
          : {}),

        // Connect the task to its registered owner.
        user: {
          connect: {
            id: userId,
          },
        },

        // The database automatically defaults status to TODO.
      },

      // Return only the fields needed by our API.
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
