
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Safe task fields returned to API clients.
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
 * Supported task statuses.
 */
export type TaskStatusFilter =
  | 'TODO'
  | 'IN_PROGRESS'
  | 'COMPLETED';

/**
 * Supported sorting fields.
 */
export type TaskSortBy =
  | 'createdAt'
  | 'dueDate';

/**
 * Supported sorting directions.
 */
export type TaskSortOrder =
  | 'asc'
  | 'desc';

/**
 * Input for creating a task.
 */
export interface CreateTaskInput {
  title: string;
  description?: string;
  dueDate?: Date;
}

/**
 * Input for updating a task.
 */
export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatusFilter;
  dueDate?: Date | null;
}

/**
 * TasksService
 *
 * Handles task CRUD, filtering, searching,
 * sorting, and pagination.
 *
 * All operations enforce authenticated ownership.
 */
@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * CREATE TASK
   */
  async createTask(userId: string, input: CreateTaskInput) {
    return this.prisma.task.create({
      data: {
        title: input.title,

        // Include optional values only when provided.
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),

        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate }
          : {}),

        // Associate the task with its owner.
        user: {
          connect: {
            id: userId,
          },
        },
      },

      select: TASK_SELECT,
    });
  }

  /**
   * GET ALL TASKS
   *
   * Supports:
   * - Status filtering.
   * - Case-insensitive searching.
   * - Sorting by creation date or deadline.
   * - Optional page/limit pagination.
   *
   * Without pagination:
   * Return the original array of tasks.
   *
   * With pagination:
   * Return data and pagination metadata.
   */
  async findAll(
    userId: string,
    status?: TaskStatusFilter,
    search?: string,
    sortBy: TaskSortBy = 'createdAt',
    order: TaskSortOrder = 'desc',
    page?: number,
    limit?: number,
  ) {
    /**
     * Build the common ownership and filter conditions.
     *
     * Every query includes the authenticated userId.
     */
    const where = {
      userId,

      // Filter by task status when provided.
      ...(status !== undefined
        ? { status }
        : {}),

      // Search task titles or descriptions.
      ...(search !== undefined
        ? {
            OR: [
              {
                title: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                description: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    /**
     * Build the sorting instructions.
     *
     * Tasks without deadlines appear last
     * when sorting by dueDate.
     */
    const orderBy =
      sortBy === 'dueDate'
        ? [
            {
              dueDate: {
                sort: order,
                nulls: 'last' as const,
              },
            },
            {
              createdAt: 'desc' as const,
            },
          ]
        : {
            createdAt: order,
          };

    /**
     * Preserve existing GET /tasks behavior.
     *
     * If neither page nor limit was provided,
     * return a regular array of tasks.
     */
    if (page === undefined && limit === undefined) {
      return this.prisma.task.findMany({
        where,
        orderBy,
        select: TASK_SELECT,
      });
    }

    /**
     * PAGINATION
     *
     * Default page: 1
     * Default limit: 10
     * Maximum limit: 100
     *
     * The controller validates these values
     * before calling the service.
     */
    const currentPage = page ?? 1;
    const pageSize = limit ?? 10;

    // Calculate how many records to skip.
    const skip = (currentPage - 1) * pageSize;

    /**
     * Run the task query and matching record count.
     *
     * Both operations use the same ownership
     * and filtering conditions.
     */
    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy,
        select: TASK_SELECT,
        skip,
        take: pageSize,
      }),

      this.prisma.task.count({
        where,
      }),
    ]);

    // Calculate the number of available pages.
    const totalPages = Math.ceil(total / pageSize);

    /**
     * Return paginated tasks and metadata.
     */
    return {
      data: tasks,

      meta: {
        page: currentPage,
        limit: pageSize,
        total,
        totalPages,

        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      },
    };
  }

  /**
   * GET SINGLE TASK
   */
  async findOne(userId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        userId,
      },

      select: TASK_SELECT,
    });

    // Reject missing or inaccessible tasks.
    if (!task) {
      throw new NotFoundException('Task not found.');
    }

    return task;
  }

  /**
   * UPDATE TASK
   */
  async updateTask(
    userId: string,
    taskId: string,
    input: UpdateTaskInput,
  ) {
    // Apply ownership conditions during the update.
    const result = await this.prisma.task.updateMany({
      where: {
        id: taskId,
        userId,
      },

      data: input,
    });

    // Return 404 for missing or foreign tasks.
    if (result.count === 0) {
      throw new NotFoundException('Task not found.');
    }

    // Retrieve and return the updated task.
    return this.findOne(userId, taskId);
  }

  /**
   * DELETE TASK
   */
  async deleteTask(userId: string, taskId: string) {
    // Delete only tasks belonging to the current user.
    const result = await this.prisma.task.deleteMany({
      where: {
        id: taskId,
        userId,
      },
    });

    // Return 404 when no owned task matches.
    if (result.count === 0) {
      throw new NotFoundException('Task not found.');
    }
  }
}
