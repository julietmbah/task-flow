
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
  title: 'Complete monthly report',
  description: 'Prepare the financial report',
  status: 'TODO',
  dueDate: null,
  createdAt: new Date('2026-11-01T10:00:00Z'),
  updatedAt: new Date('2026-11-01T10:00:00Z'),
};

// Expected Prisma search conditions.
const reportSearch = [
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
];

// =====================================================
// SERVICE TESTS
// =====================================================

describe('TasksService.findAll search', () => {
  /**
   * TEST 1
   *
   * Search title and description while enforcing
   * authenticated user ownership.
   */
  it('should search title and description for the current user', async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    const prisma = {
      task: { findMany },
    } as unknown as PrismaService;

    const service = new TasksService(prisma);

    await service.findAll(userId, undefined, 'report');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId,
          OR: reportSearch,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    );
  });

  /**
   * TEST 2
   *
   * Combine status filtering and searching.
   */
  it('should combine userId, status, and search', async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    const prisma = {
      task: { findMany },
    } as unknown as PrismaService;

    const service = new TasksService(prisma);

    await service.findAll(userId, 'TODO', 'report');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId,
          status: 'TODO',
          OR: reportSearch,
        },
      }),
    );
  });
});

// =====================================================
// HTTP INTEGRATION TESTS
// =====================================================

describe('GET /tasks search', () => {
  let app: INestApplication;

  // Authentication mocks.
  const verifyAsync = vi.fn();
  const findUnique = vi.fn();

  // Prisma task-query mock.
  const findMany = vi.fn();

  beforeEach(async () => {
    // Reset mocks before every test.
    vi.resetAllMocks();

    // Simulate a valid JWT.
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

    // Simulate the database returning a matching task.
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

    // Initialize the HTTP testing application.
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
    // Close the temporary HTTP server.
    await app.close();
  });

  /**
   * TEST 3
   *
   * Search for a task using a keyword.
   */
  it('should search tasks by keyword', async () => {
    const response = await request(app.getHttpServer())
      .get('/tasks?search=report')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(response.body).toHaveLength(1);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId,
          OR: reportSearch,
        },
      }),
    );
  });

  /**
   * TEST 4
   *
   * Searching should be case-insensitive.
   */
  it('should support case-insensitive searching', async () => {
    await request(app.getHttpServer())
      .get('/tasks?search=REPORT')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId,
          OR: [
            {
              title: {
                contains: 'REPORT',
                mode: 'insensitive',
              },
            },
            {
              description: {
                contains: 'REPORT',
                mode: 'insensitive',
              },
            },
          ],
        },
      }),
    );
  });

  /**
   * TEST 5
   *
   * Remove surrounding spaces from search terms.
   */
  it('should trim surrounding search whitespace', async () => {
    await request(app.getHttpServer())
      .get('/tasks?search=%20%20report%20%20')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId,
          OR: reportSearch,
        },
      }),
    );
  });

  /**
   * TEST 6
   *
   * Search and status filtering must work together.
   */
  it('should combine search with a status filter', async () => {
    await request(app.getHttpServer())
      .get('/tasks?status=TODO&search=report')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId,
          status: 'TODO',
          OR: reportSearch,
        },
      }),
    );
  });

  /**
   * TEST 7
   *
   * Reject an empty search parameter.
   */
  it('should reject an empty search term', async () => {
    await request(app.getHttpServer())
      .get('/tasks?search=')
      .set('Authorization', 'Bearer valid-token')
      .expect(400);

    expect(findMany).not.toHaveBeenCalled();
  });

  /**
   * TEST 8
   *
   * Reject search terms containing only whitespace.
   */
  it('should reject whitespace-only searches', async () => {
    await request(app.getHttpServer())
      .get('/tasks?search=%20%20%20')
      .set('Authorization', 'Bearer valid-token')
      .expect(400);

    expect(findMany).not.toHaveBeenCalled();
  });

  /**
   * TEST 9
   *
   * Reject excessively long search terms.
   */
  it('should reject searches longer than 100 characters', async () => {
    const longSearch = 'a'.repeat(101);

    await request(app.getHttpServer())
      .get(`/tasks?search=${longSearch}`)
      .set('Authorization', 'Bearer valid-token')
      .expect(400);

    expect(findMany).not.toHaveBeenCalled();
  });

  /**
   * TEST 10
   *
   * Authentication remains mandatory.
   */
  it('should reject searching without a JWT', async () => {
    await request(app.getHttpServer())
      .get('/tasks?search=report')
      .expect(401);

    expect(findMany).not.toHaveBeenCalled();
  });

  /**
   * TEST 11
   *
   * Reject invalid authentication tokens.
   */
  it('should reject searching with an invalid JWT', async () => {
    verifyAsync.mockRejectedValue(
      new Error('Invalid token'),
    );

    await request(app.getHttpServer())
      .get('/tasks?search=report')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    expect(findMany).not.toHaveBeenCalled();
  });

  /**
   * TEST 12
   *
   * Ignore forged userId query parameters.
   *
   * The query must use the authenticated userId.
   */
  it('should prevent searching another user’s tasks', async () => {
    await request(app.getHttpServer())
      .get('/tasks?search=report&userId=another-user')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId,
          OR: reportSearch,
        },
      }),
    );
  });
});
