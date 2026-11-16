
import {
  type INestApplication,
  ValidationPipe,
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
// TASK LISTING SERVICE TESTS
// =====================================================

describe('TasksService.findAll', () => {
  /**
   * TEST 1
   *
   * Tasks must be filtered by the authenticated user.
   * Newest tasks should appear first.
   */
  it('should retrieve only tasks belonging to the user', async () => {
    // Mock Prisma's task listing operation.
    const findMany = vi.fn().mockResolvedValue([]);

    const prisma = {
      task: { findMany },
    } as unknown as PrismaService;

    const service = new TasksService(prisma);

    // Request tasks belonging to user-123.
    const result = await service.findAll('user-123');

    expect(result).toEqual([]);

    // Verify the database query enforces ownership.
    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-123',
      },
      orderBy: {
        createdAt: 'desc',
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
  });

  /**
   * TEST 2
   *
   * Different users must generate separate
   * ownership-filtered database queries.
   */
  it('should filter tasks separately for different users', async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    const prisma = {
      task: { findMany },
    } as unknown as PrismaService;

    const service = new TasksService(prisma);

    await service.findAll('user-a');
    await service.findAll('user-b');

    // First user receives an ownership-filtered query.
    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { userId: 'user-a' },
      }),
    );

    // Second user receives a different filtered query.
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { userId: 'user-b' },
      }),
    );
  });
});

// =====================================================
// TASK LISTING HTTP SECURITY TESTS
// =====================================================

describe('GET /tasks HTTP Security', () => {
  let app: INestApplication;

  // Mock JWT verification and database access.
  const verifyAsync = vi.fn();
  const findUnique = vi.fn();
  const findAll = vi.fn();

  // ===================================================
  // TEST SETUP
  // ===================================================

  beforeEach(async () => {
    // Reset mocks between tests.
    vi.resetAllMocks();

    // Simulate a verified JWT belonging to user-a.
    verifyAsync.mockResolvedValue({
      sub: 'user-a',
    });

    // Simulate the authenticated user.
    findUnique.mockResolvedValue({
      id: 'user-a',
      name: 'Test User',
      email: 'test@example.com',
      createdAt: new Date('2026-10-22T10:00:00Z'),
    });

    // Simulate tasks returned by TasksService.
    findAll.mockResolvedValue([
      {
        id: 'task-a',
        title: 'My private task',
        status: 'TODO',
      },
    ]);

    // Create a temporary NestJS testing module.
    const module = await Test.createTestingModule({
      controllers: [TasksController],

      providers: [
        // Use our real JWT authentication guard.
        JwtAuthGuard,

        // Mock JWT verification.
        {
          provide: JwtService,
          useValue: { verifyAsync },
        },

        // Mock database user lookup.
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique },
          },
        },

        // Mock task operations.
        {
          provide: TasksService,
          useValue: {
            createTask: vi.fn(),
            findAll,
          },
        },
      ],
    }).compile();

    // Create and initialize the HTTP application.
    app = module.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterEach(async () => {
    // Release the testing application.
    await app.close();
  });

  /**
   * TEST 3
   *
   * Valid authentication should return
   * tasks belonging to the verified user.
   *
   * A query parameter must not override ownership.
   */
  it('should return tasks for the authenticated user', async () => {
    const response = await request(app.getHttpServer())
      .get('/tasks')
      .query({ userId: 'another-user' })
      .set('Authorization', 'Bearer valid-test-token')
      .expect(200);

    // The controller must use the JWT user's ID.
    expect(findAll).toHaveBeenCalledWith('user-a');

    expect(response.body).toEqual([
      {
        id: 'task-a',
        title: 'My private task',
        status: 'TODO',
      },
    ]);
  });

  /**
   * TEST 4
   *
   * Reject task listing without authentication.
   */
  it('should reject requests without a JWT', async () => {
    await request(app.getHttpServer())
      .get('/tasks')
      .expect(401);

    // An unauthenticated user cannot list tasks.
    expect(findAll).not.toHaveBeenCalled();
  });

  /**
   * TEST 5
   *
   * Reject requests containing invalid JWTs.
   */
  it('should reject an invalid JWT', async () => {
    // Simulate a failed JWT verification.
    verifyAsync.mockRejectedValue(
      new Error('Invalid token'),
    );

    await request(app.getHttpServer())
      .get('/tasks')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    // An invalid JWT must not reach task retrieval.
    expect(findAll).not.toHaveBeenCalled();
  });
});
