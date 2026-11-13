
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
// SHARED TEST DATA
// =====================================================

const userId = 'user-123';

const sampleTask = {
  id: 'f1565cd7-142a-4c8c-9ee6-30d44a73a470',
  title: 'Complete TaskFlow Day 7',
  description: null,
  status: 'TODO',
  dueDate: null,
  createdAt: new Date('2026-11-01T10:00:00Z'),
  updatedAt: new Date('2026-11-01T10:00:00Z'),
};

// =====================================================
// SERVICE TESTS
// =====================================================

describe('TasksService.findAll status filtering', () => {
  // TEST 1: No status means all of the user's tasks.
  it('should filter by userId when no status is provided', async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    const prisma = {
      task: { findMany },
    } as unknown as PrismaService;

    const service = new TasksService(prisma);

    await service.findAll(userId);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  // TEST 2: Status and ownership must both be enforced.
  it('should combine the authenticated userId with the status', async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    const prisma = {
      task: { findMany },
    } as unknown as PrismaService;

    const service = new TasksService(prisma);

    await service.findAll(userId, 'COMPLETED');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId,
          status: 'COMPLETED',
        },
      }),
    );
  });
});

// =====================================================
// HTTP INTEGRATION TESTS
// =====================================================

describe('GET /tasks status filtering', () => {
  let app: INestApplication;

  // Authentication mocks.
  const verifyAsync = vi.fn();
  const findUnique = vi.fn();

  // Prisma query mock.
  const findMany = vi.fn();

  beforeEach(async () => {
    vi.resetAllMocks();

    // Simulate successful JWT verification.
    verifyAsync.mockResolvedValue({
      sub: userId,
    });

    // Simulate the authenticated database user.
    findUnique.mockResolvedValue({
      id: userId,
      name: 'Test User',
      email: 'test@example.com',
      createdAt: new Date('2026-11-01T10:00:00Z'),
    });

    // Simulate the database returning a task.
    findMany.mockResolvedValue([sampleTask]);

    const moduleRef = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        JwtAuthGuard,
        TasksService,

        {
          provide: JwtService,
          useValue: { verifyAsync },
        },

        {
          provide: PrismaService,
          useValue: {
            user: { findUnique },
            task: { findMany },
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();

    // Match production request validation.
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
    await app.close();
  });

  // TEST 3: Existing GET /tasks must still work.
  it('should return all owned tasks without a status filter', async () => {
    const response = await request(app.getHttpServer())
      .get('/tasks')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(response.body).toHaveLength(1);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
      }),
    );
  });

  // TESTS 4-6: Every allowed status must work.
  for (const status of [
    'TODO',
    'IN_PROGRESS',
    'COMPLETED',
  ] as const) {
    it(`should filter tasks by ${status}`, async () => {
      await request(app.getHttpServer())
        .get(`/tasks?status=${status}`)
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            status,
          },
        }),
      );
    });
  }

  // TEST 7: Unsupported statuses must be rejected.
  it('should reject an invalid status', async () => {
    await request(app.getHttpServer())
      .get('/tasks?status=CANCELLED')
      .set('Authorization', 'Bearer valid-token')
      .expect(400);

    expect(findMany).not.toHaveBeenCalled();
  });

  // TEST 8: Status validation must be case-sensitive.
  it('should reject a lowercase status', async () => {
    await request(app.getHttpServer())
      .get('/tasks?status=completed')
      .set('Authorization', 'Bearer valid-token')
      .expect(400);

    expect(findMany).not.toHaveBeenCalled();
  });

  // TEST 9: Authentication remains mandatory.
  it('should reject requests without a JWT', async () => {
    await request(app.getHttpServer())
      .get('/tasks?status=TODO')
      .expect(401);

    expect(findMany).not.toHaveBeenCalled();
  });

  // TEST 10: A client cannot override the authenticated owner.
  it('should ignore a forged userId query parameter', async () => {
    await request(app.getHttpServer())
      .get('/tasks?status=TODO&userId=another-user')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId,
          status: 'TODO',
        },
      }),
    );
  });

  // TEST 11: A different authenticated user gets
  // a query restricted to their own user ID.
  it('should use the verified identity of another user', async () => {
    verifyAsync.mockResolvedValue({
      sub: 'another-user',
    });

    findUnique.mockResolvedValue({
      id: 'another-user',
      name: 'Another User',
      email: 'another@example.com',
      createdAt: new Date('2026-11-01T10:00:00Z'),
    });

    await request(app.getHttpServer())
      .get('/tasks?status=IN_PROGRESS')
      .set('Authorization', 'Bearer another-token')
      .expect(200);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'another-user',
          status: 'IN_PROGRESS',
        },
      }),
    );
  });
});
