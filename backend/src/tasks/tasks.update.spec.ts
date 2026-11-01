
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
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

// Use a valid version 4 task UUID.
const taskId = 'f1565cd7-142a-4c8c-9ee6-30d44a73a470';

// Simulated authenticated user.
const userId = 'user-123';

// Simulated task returned after updating.
const updatedTask = {
  id: taskId,
  title: 'Updated TaskFlow task',
  description: null,
  status: 'TODO',
  dueDate: null,
  createdAt: new Date('2026-10-22T10:00:00Z'),
  updatedAt: new Date('2026-10-22T11:00:00Z'),
};

// =====================================================
// PATCH /tasks/:id TESTS
// =====================================================

describe('PATCH /tasks/:id', () => {
  let app: INestApplication;

  // Mock authentication operations.
  const verifyAsync = vi.fn();
  const findUnique = vi.fn();

  // Mock Prisma task operations.
  const updateMany = vi.fn();
  const findFirst = vi.fn();

  // ===================================================
  // TEST SETUP
  // ===================================================

  beforeEach(async () => {
    // Clear previous test calls and implementations.
    vi.resetAllMocks();

    // Simulate a successfully verified JWT.
    verifyAsync.mockResolvedValue({
      sub: userId,
    });

    // Simulate the authenticated user in PostgreSQL.
    findUnique.mockResolvedValue({
      id: userId,
      name: 'Test User',
      email: 'test@example.com',
      createdAt: new Date('2026-10-22T10:00:00Z'),
    });

    // Simulate one successfully updated database row.
    updateMany.mockResolvedValue({
      count: 1,
    });

    // Simulate retrieving the updated task.
    findFirst.mockResolvedValue(updatedTask);

    // Create a NestJS testing module.
    const module = await Test.createTestingModule({
      controllers: [TasksController],

      providers: [
        // Use the real JWT authentication guard.
        JwtAuthGuard,

        // Use the real TasksService.
        TasksService,

        // Mock JWT verification.
        {
          provide: JwtService,
          useValue: { verifyAsync },
        },

        // Mock Prisma database operations.
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique,
            },
            task: {
              updateMany,
              findFirst,
            },
          },
        },
      ],
    }).compile();

    // Create the temporary HTTP application.
    app = module.createNestApplication();

    // Match our production validation configuration.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    // Start the test application.
    await app.init();
  });

  // ===================================================
  // TEST CLEANUP
  // ===================================================

  afterEach(async () => {
    // Close the temporary application after each test.
    await app.close();
  });

  // ===================================================
  // TEST 1: UPDATE AN OWNED TASK
  // ===================================================

  it('should update a task owned by the user', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        title: 'Updated TaskFlow task',
      })
      .expect(200);

    // Ownership must be enforced during the update.
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: taskId,
        userId,
      },
      data: {
        title: 'Updated TaskFlow task',
      },
    });

    // The service must retrieve the updated task.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: taskId,
          userId,
        },
      }),
    );

    // Verify the response.
    expect(response.body.title).toBe(
      'Updated TaskFlow task',
    );
  });

  // ===================================================
  // TEST 2: UPDATE STATUS
  // ===================================================

  it('should accept a valid task status', async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        status: 'COMPLETED',
      })
      .expect(200);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: taskId,
        userId,
      },
      data: {
        status: 'COMPLETED',
      },
    });
  });

  // ===================================================
  // TEST 3: UPDATE DEADLINE
  // ===================================================

  it('should convert a valid deadline into a Date', async () => {
    const deadline = '2026-11-15T12:00:00.000Z';

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        dueDate: deadline,
      })
      .expect(200);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: taskId,
        userId,
      },
      data: {
        dueDate: new Date(deadline),
      },
    });
  });

  // ===================================================
  // TEST 4: CLEAR OPTIONAL FIELDS
  // ===================================================

  it('should allow clearing description and deadline', async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        description: null,
        dueDate: null,
      })
      .expect(200);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: taskId,
        userId,
      },
      data: {
        description: null,
        dueDate: null,
      },
    });
  });

  // ===================================================
  // TEST 5: CROSS-USER OWNERSHIP PROTECTION
  // ===================================================

  it('should return 404 when the task is not owned by the user', async () => {
    // No task matches both the ID and owner.
    updateMany.mockResolvedValue({
      count: 0,
    });

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        title: 'Unauthorized update',
      })
      .expect(404);

    // The update query must include the verified owner.
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: taskId,
        userId,
      },
      data: {
        title: 'Unauthorized update',
      },
    });

    // Do not retrieve a task that wasn't updated.
    expect(findFirst).not.toHaveBeenCalled();
  });

  // ===================================================
  // TEST 6: MISSING AUTHENTICATION
  // ===================================================

  it('should reject requests without a JWT', async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .send({
        title: 'Unauthorized update',
      })
      .expect(401);

    expect(updateMany).not.toHaveBeenCalled();
  });

  // ===================================================
  // TEST 7: INVALID JWT
  // ===================================================

  it('should reject invalid authentication tokens', async () => {
    verifyAsync.mockRejectedValue(
      new Error('Invalid token'),
    );

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Authorization', 'Bearer invalid-token')
      .send({
        title: 'Unauthorized update',
      })
      .expect(401);

    expect(updateMany).not.toHaveBeenCalled();
  });

  // ===================================================
  // TEST 8: INVALID TASK UUID
  // ===================================================

  it('should reject malformed task IDs', async () => {
    await request(app.getHttpServer())
      .patch('/tasks/invalid-id')
      .set('Authorization', 'Bearer valid-token')
      .send({
        title: 'Updated title',
      })
      .expect(400);

    expect(updateMany).not.toHaveBeenCalled();
  });

  // ===================================================
  // TEST 9: INVALID TASK STATUS
  // ===================================================

  it('should reject unsupported task statuses', async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        status: 'CANCELLED',
      })
      .expect(400);

    expect(updateMany).not.toHaveBeenCalled();
  });

  // ===================================================
  // TEST 10: EMPTY UPDATE
  // ===================================================

  it('should reject an empty update request', async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Authorization', 'Bearer valid-token')
      .send({})
      .expect(400);

    expect(updateMany).not.toHaveBeenCalled();
  });

  // ===================================================
  // TEST 11: INVALID TITLE
  // ===================================================

  it('should reject whitespace-only task titles', async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        title: '    ',
      })
      .expect(400);

    expect(updateMany).not.toHaveBeenCalled();
  });

  // ===================================================
  // TEST 12: FORGED USER ID
  // ===================================================

  it('should reject userId in the request body', async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        title: 'Unauthorized update',
        userId: 'another-user',
      })
      .expect(400);

    // Ownership cannot be overridden by the client.
    expect(updateMany).not.toHaveBeenCalled();
  });
});
