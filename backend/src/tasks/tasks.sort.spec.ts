
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
  description: 'Testing task sorting',
  status: 'TODO',
  dueDate: new Date('2026-11-15T12:00:00Z'),
  createdAt: new Date('2026-11-01T10:00:00Z'),
  updatedAt: new Date('2026-11-01T10:00:00Z'),
};

// =====================================================
// SERVICE TESTS
// =====================================================

describe('TasksService.findAll sorting', () => {
  /**
   * Create a service using a mocked Prisma client.
   *
   * No real database connection is required.
   */
  function setup() {
    const findMany = vi.fn().mockResolvedValue([]);

    const prisma = {
      task: { findMany },
    } as unknown as PrismaService;

    const service = new TasksService(prisma);

    return { service, findMany };
  }

  // TEST 1: Preserve the existing default sorting.
  it('should sort by newest creation date by default', async () => {
    const { service, findMany } = setup();

    await service.findAll(userId);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  // TEST 2: Sort oldest tasks first.
  it('should sort creation dates in ascending order', async () => {
    const { service, findMany } = setup();

    await service.findAll(
      userId,
      undefined,
      undefined,
      'createdAt',
      'asc',
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
    );
  });

  // TEST 3: Sort by earliest deadline first.
  it('should sort deadlines ascending with nulls last', async () => {
    const { service, findMany } = setup();

    await service.findAll(
      userId,
      undefined,
      undefined,
      'dueDate',
      'asc',
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        orderBy: [
          {
            dueDate: {
              sort: 'asc',
              nulls: 'last',
            },
          },
          {
            createdAt: 'desc',
          },
        ],
      }),
    );
  });

  // TEST 4: Combine filtering, searching and sorting.
  it('should combine status, search, and descending deadlines', async () => {
    const { service, findMany } = setup();

    await service.findAll(
      userId,
      'COMPLETED',
      'report',
      'dueDate',
      'desc',
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId,
          status: 'COMPLETED',
          OR: [
            {
              title: {
                contains: 'report',
                mode: 'insensitive',
              },
            },
            {
              description: {
                contains: 'report',
                mode: 'insensitive',
              },
            },
          ],
        },
        orderBy: [
          {
            dueDate: {
              sort: 'desc',
              nulls: 'last',
            },
          },
          {
            createdAt: 'desc',
          },
        ],
      }),
    );
  });
});

// =====================================================
// HTTP SORTING TESTS
// =====================================================

describe('GET /tasks sorting', () => {
  let app: INestApplication;

  // Mock JWT and user lookup operations.
  const verifyAsync = vi.fn();
  const findUnique = vi.fn();

  // Mock the Prisma task retrieval operation.
  const findMany = vi.fn();

  beforeEach(async () => {
    // Reset mocks before each test.
    vi.resetAllMocks();

    // Simulate a valid authentication token.
    verifyAsync.mockResolvedValue({
      sub: userId,
    });

    // Simulate an authenticated database user.
    findUnique.mockResolvedValue({
      id: userId,
      name: 'Test User',
      email: 'test@example.com',
      createdAt: new Date('2026-11-01T10:00:00Z'),
    });

    // Simulate a database task response.
    findMany.mockResolvedValue([sampleTask]);

    // Create the NestJS testing module.
    const moduleRef = await Test.createTestingModule({
      controllers: [TasksController],

      providers: [
        // Use the real authentication guard.
        JwtAuthGuard,

        // Use the real TasksService.
        TasksService,

        {
          provide: JwtService,
          useValue: { verifyAsync },
        },

        // Replace database operations with mocks.
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique },
            task: { findMany },
          },
        },
      ],
    }).compile();

    // Create the temporary HTTP application.
    app = moduleRef.createNestApplication();

    // Match production validation settings.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    // Initialize the application.
    await app.init();
  });

  afterEach(async () => {
    // Close the temporary HTTP application.
    await app.close();
  });

  // TEST 5: Default sorting.
  it('should return tasks newest first by default', async () => {
    await request(app.getHttpServer())
      .get('/tasks')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  // TEST 6: Ascending creation date.
  it('should accept createdAt ascending sorting', async () => {
    await request(app.getHttpServer())
      .get('/tasks?sortBy=createdAt&order=asc')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
    );
  });

  // TEST 7: Ascending deadline.
  it('should accept dueDate ascending sorting', async () => {
    await request(app.getHttpServer())
      .get('/tasks?sortBy=dueDate&order=asc')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        orderBy: [
          {
            dueDate: {
              sort: 'asc',
              nulls: 'last',
            },
          },
          {
            createdAt: 'desc',
          },
        ],
      }),
    );
  });

  // TEST 8: Descending deadline.
  it('should accept dueDate descending sorting', async () => {
    await request(app.getHttpServer())
      .get('/tasks?sortBy=dueDate&order=desc')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        orderBy: [
          {
            dueDate: {
              sort: 'desc',
              nulls: 'last',
            },
          },
          {
            createdAt: 'desc',
          },
        ],
      }),
    );
  });

  // TEST 9: Allow order without sortBy.
  it('should default to createdAt when only order is provided', async () => {
    await request(app.getHttpServer())
      .get('/tasks?order=asc')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
    );
  });

  // TEST 10: Combine all implemented query features.
  it('should combine status, search, and sorting', async () => {
    await request(app.getHttpServer())
      .get(
        '/tasks?status=TODO&search=report&sortBy=dueDate&order=asc',
      )
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId,
          status: 'TODO',
          OR: [
            {
              title: {
                contains: 'report',
                mode: 'insensitive',
              },
            },
            {
              description: {
                contains: 'report',
                mode: 'insensitive',
              },
            },
          ],
        },
        orderBy: [
          {
            dueDate: {
              sort: 'asc',
              nulls: 'last',
            },
          },
          {
            createdAt: 'desc',
          },
        ],
      }),
    );
  });

  // TEST 11: Reject unsupported sort fields.
  it('should reject invalid sortBy values', async () => {
    await request(app.getHttpServer())
      .get('/tasks?sortBy=title')
      .set('Authorization', 'Bearer valid-token')
      .expect(400);

    // Invalid requests must not reach Prisma.
    expect(findMany).not.toHaveBeenCalled();
  });

  // TEST 12: Reject unsupported directions.
  it('should reject invalid sorting directions', async () => {
    await request(app.getHttpServer())
      .get('/tasks?order=random')
      .set('Authorization', 'Bearer valid-token')
      .expect(400);

    expect(findMany).not.toHaveBeenCalled();
  });

  // TEST 13: Authentication is mandatory.
  it('should reject sorting requests without a JWT', async () => {
    await request(app.getHttpServer())
      .get('/tasks?sortBy=dueDate&order=asc')
      .expect(401);

    expect(findMany).not.toHaveBeenCalled();
  });

  // TEST 14: Prevent forged user ownership.
  it('should use the authenticated owner despite a forged userId', async () => {
    await request(app.getHttpServer())
      .get('/tasks?sortBy=dueDate&userId=another-user')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        orderBy: [
          {
            dueDate: {
              sort: 'desc',
              nulls: 'last',
            },
          },
          {
            createdAt: 'desc',
          },
        ],
      }),
    );
  });
});
