
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service.js';
import { TasksService } from './tasks.service.js';

/**
 * TasksService Unit Tests
 *
 * These tests verify our task creation logic.
 *
 * We mock PrismaService so that:
 * 1. No real database records are created.
 * 2. Tests are fast and repeatable.
 * 3. We can inspect the exact Prisma arguments.
 */

/**
 * Create a fresh service and mock Prisma client.
 *
 * Each test receives its own mock, so tests do
 * not interfere with one another.
 */
function createTestService() {
  // Mock Prisma's task.create() database method.
  const create = vi.fn();

  // Provide only the Prisma functionality needed
  // by the TasksService.
  const prisma = {
    task: {
      create,
    },
  } as unknown as PrismaService;

  // Inject our mocked PrismaService.
  const service = new TasksService(prisma);

  return { service, create };
}

describe('TasksService', () => {
  /**
   * TEST 1
   *
   * A new task must be connected to its owner.
   */
  it('should create a task for the authenticated user', async () => {
    const { service, create } = createTestService();

    const userId = 'user-123';

    // Simulate Prisma returning a saved task.
    const savedTask = {
      id: 'task-123',
      title: 'Learn NestJS',
      description: null,
      status: 'TODO',
      dueDate: null,
      createdAt: new Date('2026-10-22T10:00:00Z'),
      updatedAt: new Date('2026-10-22T10:00:00Z'),
    };

    create.mockResolvedValue(savedTask);

    // Call our actual service method.
    const result = await service.createTask(userId, {
      title: 'Learn NestJS',
    });

    // Confirm Prisma was called exactly once.
    expect(create).toHaveBeenCalledOnce();

    // Confirm the task belongs to the correct user.
    expect(create).toHaveBeenCalledWith({
      data: {
        title: 'Learn NestJS',
        user: {
          connect: {
            id: userId,
          },
        },
      },
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

    // Confirm the service returns the saved task.
    expect(result).toEqual(savedTask);
  });

  /**
   * TEST 2
   *
   * A task may include a description and deadline.
   */
  it('should include optional task fields when provided', async () => {
    const { service, create } = createTestService();

    const dueDate = new Date('2026-11-01T12:00:00Z');

    create.mockResolvedValue({
      id: 'task-456',
      title: 'Finish portfolio',
    });

    await service.createTask('user-123', {
      title: 'Finish portfolio',
      description: 'Complete the backend project',
      dueDate,
    });

    // Verify optional fields were sent to Prisma.
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          title: 'Finish portfolio',
          description: 'Complete the backend project',
          dueDate,
          user: {
            connect: {
              id: 'user-123',
            },
          },
        },
      }),
    );
  });

  /**
   * TEST 3
   *
   * Optional fields should be omitted when absent.
   *
   * Prisma will use the database default TODO status.
   */
  it('should omit optional fields when not provided', async () => {
    const { service, create } = createTestService();

    create.mockResolvedValue({
      id: 'task-789',
      title: 'Write tests',
    });

    await service.createTask('user-456', {
      title: 'Write tests',
    });

    // Extract the arguments passed to Prisma.
    const prismaArguments = create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };

    // Optional fields must not be added unnecessarily.
    expect(prismaArguments.data).not.toHaveProperty(
      'description',
    );

    expect(prismaArguments.data).not.toHaveProperty(
      'dueDate',
    );

    // Let PostgreSQL apply the default status.
    expect(prismaArguments.data).not.toHaveProperty(
      'status',
    );
  });

  /**
   * TEST 4
   *
   * Database errors must not be silently ignored.
   *
   * Later, our controller and exception handling
   * will determine the correct HTTP error response.
   */
  it('should propagate database errors', async () => {
    const { service, create } = createTestService();

    create.mockRejectedValue(
      new Error('Database operation failed'),
    );

    await expect(
      service.createTask('user-123', {
        title: 'Example task',
      }),
    ).rejects.toThrow('Database operation failed');
  });
});
