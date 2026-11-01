
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Fields returned to API clients.
 *
 * Keeping this selection consistent ensures
 * we expose only the required task information.
 */
const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Data required to create a task.
 */
export interface CreateTaskInput {
  title: string;
  description?: string;
  dueDate?: Date;
}

/**
 * Data permitted when updating a task.
 *
 * Null clears optional fields.
 */
export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
  dueDate?: Date | null;
}

/**
 * TasksService
 *
 * Implements task-management business logic.
 *
 * Every operation enforces ownership using
 * the authenticated user's ID.
 */
@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * CREATE TASK
   *
   * Create a task belonging to the logged-in user.
   */
  async createTask(userId: string, input: CreateTaskInput) {
    return this.prisma.task.create({
      data: {
        title: input.title,

        // Include optional fields only when provided.
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),

        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate }
          : {}),

        // Connect the task to its authenticated owner.
        user: {
          connect: {
            id: userId,
          },
        },
      },

      // Return safe task fields.
      select: TASK_SELECT,
    });
  }

  /**
   * GET ALL TASKS
   *
   * Retrieve only the authenticated user's tasks.
   */
  async findAll(userId: string) {
    return this.prisma.task.findMany({
      // Restrict results to the current user.
      where: {
        userId,
      },

      // Display the newest tasks first.
      orderBy: {
        createdAt: 'desc',
      },

      select: TASK_SELECT,
    });
  }

  /**
   * GET SINGLE TASK
   *
   * Retrieve one task using both its ID and owner ID.
   */
  async findOne(userId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        userId,
      },

      select: TASK_SELECT,
    });

    // Do not reveal whether another user's task exists.
    if (!task) {
      throw new NotFoundException('Task not found.');
    }

    return task;
  }

  /**
   * UPDATE TASK
   *
   * Update only a task belonging to the current user.
   *
   * updateMany applies the ownership condition
   * directly inside the database operation.
   */
  async updateTask(
    userId: string,
    taskId: string,
    input: UpdateTaskInput,
  ) {
    const result = await this.prisma.task.updateMany({
      where: {
        id: taskId,
        userId,
      },

      data: input,
    });

    // No matching task means not found or not owned.
    if (result.count === 0) {
      throw new NotFoundException('Task not found.');
    }

    // Retrieve the updated task with ownership enforced.
    return this.findOne(userId, taskId);
  }

  /**
   * DELETE TASK
   *
   * Permanently delete a task owned by the current user.
   *
   * Security:
   * The database must match BOTH the task ID
   * and authenticated user's ID.
   *
   * deleteMany returns the number of deleted records.
   */
  async deleteTask(userId: string, taskId: string) {
    // Delete only when the task belongs to this user.
    const result = await this.prisma.task.deleteMany({
      where: {
        id: taskId,
        userId,
      },
    });

    // Return the same 404 for missing or foreign tasks.
    if (result.count === 0) {
      throw new NotFoundException('Task not found.');
    }

    // No response body is required after deletion.
  }
}
