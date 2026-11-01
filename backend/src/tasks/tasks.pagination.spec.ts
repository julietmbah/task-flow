
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
  description: 'Implement task pagination',
  status: 'TODO',
  dueDate: null,
  createdAt: new Date('2026-11-02T10:00:00Z'),
  updatedAt: new Date('2026-11-02T10:00:00Z'),
};

// =====================================================
// SERVICE TESTS
// =====================================================

describe('TasksService.findAll pagination', () => {
  /**
   * Create a service with mocked Prisma operations.
   * No real database records are accessed.
   */
  function setup(total = 23) {
    const findMany = vi.fn().mockResolvedValue([sampleTask]);
    const count = vi.fn().mockResolvedValue(total);

    const prisma = {
      task: {
        findMany,
        count,
      },
    } as unknown as PrismaService;

    return {
      service: new TasksService(prisma),
      findMany,
      count,
    };
  }

  // TEST 1: Preserve the original API response.
  it('should return an array without pagination', async () => {
    const { service, findMany, count } = setup();

    const result = await service.findAll(userId);

    expect(result).toEqual([sampleTask]);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    );

    // Counting is unnecessary without pagination.
    expect(count).not.toHaveBeenCalled();

    // No skip/take should be applied.
    const query = findMany.mock.calls[0]?.[0];

    expect(query).not.toHaveProperty('skip');
    expect(query).not.toHaveProperty('take');
  });

  // TEST 2: Verify the first page and metadata.
  it('should paginate the first page correctly', async () => {
    const { service, findMany, count } = setup(23);

    const result = await service.findAll(
      userId,
      undefined,
      undefined,
      'createdAt',
      'desc',
      1,
      10,
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        skip: 0,
        take: 10,
      }),
    );

    expect(count).toHaveBeenCalledWith({
      where: { userId },
    });

    expect(result).toEqual({
      data: [sampleTask],
      meta: {
        page: 1,
        limit: 10,
        total: 23,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    });
  });

  // TEST 3: Verify the correct offset for page two.
  it('should calculate the offset for page two', async () => {
    const { service, findMany } = setup(23);

    const result = await service.findAll(
      userId,
      undefined,
      undefined,
      'createdAt',
      'desc',
      2,
      5,
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        skip: 5,
        take: 5,
      }),
    );

    expect(result).toEqual({
      data: [sampleTask],
      meta: {
        page: 2,
        limit: 5,
        total: 23,
        totalPages: 5,
        hasNextPage: true,
        hasPreviousPage: true,
      },
    });
  });

  // TEST 4: Last page must not have a next page.
  it('should identify the final page correctly', async () => {
    const { service } = setup(23);

    const result = await service.findAll(
      userId,
      undefined,
      undefined,
      'createdAt',
      'desc',
      3,
      10,
    );

    expect(result).toEqual({
      data: [sampleTask],
      meta: {
        page: 3,
        limit: 10,
        total: 23,
        totalPages: 3,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });
  });

  // TEST 5: Count and data must share all filters.
  it('should combine pagination, search, status, and sorting', async () => {
    const { service, findMany, count } = setup(12);

    await service.findAll(
      userId,
      'TODO',
      'report',
      'dueDate',
      'asc',
      1,
      5,
    );

    const expectedWhere = {
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
    };

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere,
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
        skip: 0,
        take: 5,
      }),
    );

    // Count must use identical ownership and filters.
    expect(count).toHaveBeenCalledWith({
      where: expectedWhere,
    });
  });
});

// =====================================================
// HTTP PAGINATION TESTS
// =====================================================

describe('GET /tasks pagination', () => {
  let app: INestApplication;

  // Mock authentication operations.
  const verifyAsync = vi.fn();
  const findUnique = vi.fn();

  // Mock Prisma task operations.
  const findMany = vi.fn();
  const count = vi.fn();

  beforeEach(async () => {
    vi.resetAllMocks();

    // Simulate a valid JWT.
    verifyAsync.mockResolvedValue({
      sub: userId,
    });

    // Simulate an authenticated user.
    findUnique.mockResolvedValue({
      id: userId,
      name: 'Test User',
      email: 'test@example.com',
      createdAt: new Date('2026-11-02T10:00:00Z'),
    });

    // Simulate task data and total records.
    findMany.mockResolvedValue([sampleTask]);
    count.mockResolvedValue(23);

    const moduleRef = await Test.createTestingModule({
      controllers: [TasksController],

      providers: [
        // Use the real authentication guard.
        JwtAuthGuard,

        // Use the real task service.
        TasksService,

        // Mock JWT verification.
        {
          provide: JwtService,
          useValue: { verifyAsync },
        },

        // Mock PostgreSQL operations through Prisma.
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique },
            task: {
              findMany,
              count,
            },
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();

    // Match production validation settings.
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

  // TEST 6: Existing GET /tasks behavior.
  it('should preserve the original task array', async () => {
    const response = await request(app.getHttpServer())
      .get('/tasks')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(response.body).toHaveLength(1);

    // Unpaginated queries should not count records.
    expect(count).not.toHaveBeenCalled();
  });

  // TEST 7: First page with 10 records per page.
  it('should return pagination metadata', async () => {
    const response = await request(app.getHttpServer())
      .get('/tasks?page=1&limit=10')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(response.body.data).toHaveLength(1);

    expect(response.body.meta).toEqual({
      page: 1,
      limit: 10,
      total: 23,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: false,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        skip: 0,
        take: 10,
      }),
    );
  });

  // TEST 8: Page two with five records per page.
  it('should calculate the next page offset', async () => {
    await request(app.getHttpServer())
      .get('/tasks?page=2&limit=5')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        skip: 5,
        take: 5,
      }),
    );
  });

  // TEST 9: Only page is provided.
  it('should default limit to 10', async () => {
    const response = await request(app.getHttpServer())
      .get('/tasks?page=2')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(response.body.meta.page).toBe(2);
    expect(response.body.meta.limit).toBe(10);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      }),
    );
  });

  // TEST 10: Only limit is provided.
  it('should default page to 1', async () => {
    const response = await request(app.getHttpServer())
      .get('/tasks?limit=5')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(response.body.meta.page).toBe(1);
    expect(response.body.meta.limit).toBe(5);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 5,
      }),
    );
  });

  // TEST 11: Combine all supported query features.
  it('should combine pagination with other filters', async () => {
    await request(app.getHttpServer())
      .get(
        '/tasks?status=TODO&search=report&sortBy=dueDate&order=asc&page=2&limit=5',
      )
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    const expectedWhere = {
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
    };

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere,
        skip: 5,
        take: 5,
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

    expect(count).toHaveBeenCalledWith({
      where: expectedWhere,
    });
  });

  // TEST 12: Reject zero page numbers.
  it('should reject page zero', async () => {
    await request(app.getHttpServer())
      .get('/tasks?page=0')
      .set('Authorization', 'Bearer valid-token')
      .expect(400);

    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  // TEST 13: Reject invalid page text.
  it('should reject nonnumeric page values', async () => {
    await request(app.getHttpServer())
      .get('/tasks?page=abc')
      .set('Authorization', 'Bearer valid-token')
      .expect(400);

    expect(findMany).not.toHaveBeenCalled();
  });

  // TEST 14: Reject zero page sizes.
  it('should reject limit zero', async () => {
    await request(app.getHttpServer())
      .get('/tasks?limit=0')
      .set('Authorization', 'Bearer valid-token')
      .expect(400);

    expect(findMany).not.toHaveBeenCalled();
  });

  // TEST 15: Enforce the maximum page size.
  it('should reject limits greater than 100', async () => {
    await request(app.getHttpServer())
      .get('/tasks?limit=101')
      .set('Authorization', 'Bearer valid-token')
      .expect(400);

    expect(findMany).not.toHaveBeenCalled();
  });

  // TEST 16: Reject unsafe database offsets.
  it('should reject excessively large page offsets', async () => {
    await request(app.getHttpServer())
      .get('/tasks?page=21474838&limit=100')
      .set('Authorization', 'Bearer valid-token')
      .expect(400);

    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  // TEST 17: JWT authentication is mandatory.
  it('should reject pagination without a JWT', async () => {
    await request(app.getHttpServer())
      .get('/tasks?page=1&limit=10')
      .expect(401);

    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  // TEST 18: Prevent forged ownership parameters.
  it('should ignore a forged userId', async () => {
    await request(app.getHttpServer())
      .get('/tasks?page=1&limit=10&userId=another-user')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    // Both queries must use the verified user ID.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
      }),
    );

    expect(count).toHaveBeenCalledWith({
      where: { userId },
    });
  });
});
