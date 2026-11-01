
import {
  type INestApplication,
  NotFoundException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

// =====================================================
// TEST DATA
// =====================================================

// Valid version 4 task UUID.
const taskId = 'f1565cd7-142a-4c8c-9ee6-30d44a73a470';

// Simulated authenticated user ID.
const userId = 'user-123';

// =====================================================
// TASK DELETION SERVICE TESTS
// =====================================================

describe('TasksService.deleteTask', () => {
  /**
   * Create a TasksService with a mocked Prisma client.
   *
   * No real PostgreSQL records will be deleted.
   */
  function setup() {
    const deleteMany = vi.fn();

    const prisma = {
      task: { deleteMany },
    } as unknown as PrismaService;

    const service = new TasksService(prisma);

    return { service, deleteMany };
  }

  /**
   * TEST 1
   *
   * Delete a task belonging to the authenticated user.
   */
  it('should delete a task owned by the user', async () => {
    const { service, deleteMany } = setup();

    // Simulate one successful database deletion.
    deleteMany.mockResolvedValue({ count: 1 });

    // Successful deletion returns no response data.
    await expect(
      service.deleteTask(userId, taskId),
    ).resolves.toBeUndefined();

    // Verify ownership is enforced in the SQL operation.
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: taskId,
        userId,
      },
    });
  });

  /**
   * TEST 2
   *
   * A missing or inaccessible task must return 404.
   */
  it('should reject deletion when no owned task matches', async () => {
    const { service, deleteMany } = setup();

    // No task matches both the task ID and owner ID.
    deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      service.deleteTask(userId, taskId),
    ).rejects.toThrow(NotFoundException);

    // Confirm the database received both conditions.
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: taskId,
        userId,
      },
    });
  });
});

// =====================================================
// DELETE /tasks/:id HTTP TESTS
// =====================================================

describe('DELETE /tasks/:id HTTP Security', () => {
  let app: INestApplication;

  // Mock authentication operations.
  const verifyAsync = vi.fn();
  const findUnique = vi.fn();

  // Mock the Prisma deletion operation.
  const deleteMany = vi.fn();

  // ===================================================
  // TEST SETUP
  // ===================================================

  beforeEach(async () => {
    // Reset mocks before each test.
    vi.resetAllMocks();

    // Simulate a valid JWT.
    verifyAsync.mockResolvedValue({
      sub: userId,
    });

    // Simulate a user found in PostgreSQL.
    findUnique.mockResolvedValue({
      id: userId,
      name: 'Test User',
      email: 'test@example.com',
      createdAt: new Date('2026-10-22T10:00:00Z'),
    });

    // Simulate successful deletion by default.
    deleteMany.mockResolvedValue({
      count: 1,
    });

    // Create a temporary NestJS testing module.
    const module = await Test.createTestingModule({
      controllers: [
        TasksController,
      ],

      providers: [
        // Use the real JWT authentication guard.
        JwtAuthGuard,

        // Use the real task-management service.
        TasksService,

        // Mock JWT verification.
        {
          provide: JwtService,
          useValue: { verifyAsync },
        },

        // Mock database operations.
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique,
            },
            task: {
              deleteMany,
            },
          },
        },
      ],
    }).compile();

    // Create the HTTP test application.
    app = module.createNestApplication();

    // Initialize the application.
    await app.init();
  });

  // ===================================================
  // TEST CLEANUP
  // ===================================================

  afterEach(async () => {
    // Close the temporary server after each test.
    await app.close();
  });

  /**
   * TEST 3
   *
   * Successfully delete an owned task.
   */
  it('should return HTTP 204 after deleting an owned task', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/tasks/${taskId}`)
      .set('Authorization', 'Bearer valid-token')
      .expect(204);

    // HTTP 204 must not contain a response body.
    expect(response.text).toBe('');

    // Verify the authenticated user owns the task.
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: taskId,
        userId,
      },
    });

    expect(deleteMany).toHaveBeenCalledOnce();
  });

  /**
   * TEST 4
   *
   * Reject deletion when a task does not exist.
   */
  it('should return 404 for a nonexistent task', async () => {
    // Simulate no matching database record.
    deleteMany.mockResolvedValue({
      count: 0,
    });

    await request(app.getHttpServer())
      .delete(`/tasks/${taskId}`)
      .set('Authorization', 'Bearer valid-token')
      .expect(404);

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: taskId,
        userId,
      },
    });
  });

  /**
   * TEST 5
   *
   * Prevent deleting another user's task.
   */
  it('should return 404 when another user attempts deletion', async () => {
    // Simulate a different authenticated account.
    verifyAsync.mockResolvedValue({
      sub: 'another-user',
    });

    findUnique.mockResolvedValue({
      id: 'another-user',
      name: 'Another User',
      email: 'another@example.com',
      createdAt: new Date('2026-10-22T10:00:00Z'),
    });

    // The requested task does not belong to this user.
    deleteMany.mockResolvedValue({
      count: 0,
    });

    await request(app.getHttpServer())
      .delete(`/tasks/${taskId}`)
      .set('Authorization', 'Bearer another-user-token')
      .expect(404);

    // The deletion query must use the verified user.
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: taskId,
        userId: 'another-user',
      },
    });
  });

  /**
   * TEST 6
   *
   * Reject requests without authentication.
   */
  it('should reject deletion without a JWT', async () => {
    await request(app.getHttpServer())
      .delete(`/tasks/${taskId}`)
      .expect(401);

    // Unauthenticated users cannot reach deletion.
    expect(deleteMany).not.toHaveBeenCalled();
  });

  /**
   * TEST 7
   *
   * Reject invalid authentication tokens.
   */
  it('should reject an invalid JWT', async () => {
    verifyAsync.mockRejectedValue(
      new Error('Invalid authentication token'),
    );

    await request(app.getHttpServer())
      .delete(`/tasks/${taskId}`)
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    // Invalid authentication must block deletion.
    expect(deleteMany).not.toHaveBeenCalled();
  });

  /**
   * TEST 8
   *
   * Reject malformed task identifiers.
   */
  it('should reject an invalid task UUID', async () => {
    await request(app.getHttpServer())
      .delete('/tasks/not-a-valid-uuid')
      .set('Authorization', 'Bearer valid-token')
      .expect(400);

    // Invalid task IDs must never reach Prisma.
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
