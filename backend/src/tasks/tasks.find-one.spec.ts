
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

// Valid version 4 UUID used for our tests.
const taskId = 'f1565cd7-142a-4c8c-9ee6-30d44a73a470';

// Mock authenticated user.
const userId = 'user-123';

// Sample task returned by Prisma.
const sampleTask = {
  id: taskId,
  title: 'Complete TaskFlow Day 5',
  description: null,
  status: 'TODO',
  dueDate: null,
  createdAt: new Date('2026-10-23T00:14:43.168Z'),
  updatedAt: new Date('2026-10-23T00:14:43.168Z'),
};

// =====================================================
// TASK SERVICE UNIT TESTS
// =====================================================

describe('TasksService.findOne', () => {
  // Create the service using a mocked Prisma client.
  function setup() {
    const findFirst = vi.fn();

    const prisma = {
      task: { findFirst },
    } as unknown as PrismaService;

    const service = new TasksService(prisma);

    return { service, findFirst };
  }

  // TEST 1: Retrieve an owned task.
  it('should retrieve a task belonging to the user', async () => {
    const { service, findFirst } = setup();

    findFirst.mockResolvedValue(sampleTask);

    const result = await service.findOne(userId, taskId);

    expect(result).toEqual(sampleTask);

    // Both the task ID and owner ID must match.
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: taskId,
        userId,
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

  // TEST 2: Reject a nonexistent task.
  it('should return 404 when the task does not exist', async () => {
    const { service, findFirst } = setup();

    findFirst.mockResolvedValue(null);

    await expect(
      service.findOne(userId, taskId),
    ).rejects.toThrow(NotFoundException);
  });

  // TEST 3: Prevent cross-user access.
  it('should reject tasks not owned by the user', async () => {
    const { service, findFirst } = setup();

    // Prisma returns no matching record because
    // the requested task belongs to another user.
    findFirst.mockResolvedValue(null);

    await expect(
      service.findOne('different-user', taskId),
    ).rejects.toThrow('Task not found.');

    // Ensure ownership is enforced in the query.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: taskId,
          userId: 'different-user',
        },
      }),
    );
  });
});

// =====================================================
// HTTP ENDPOINT TESTS
// =====================================================

describe('GET /tasks/:id HTTP Security', () => {
  let app: INestApplication;

  // Mock authentication and database operations.
  const verifyAsync = vi.fn();
  const findUnique = vi.fn();
  const findOne = vi.fn();

  beforeEach(async () => {
    vi.resetAllMocks();

    // Simulate successful JWT verification.
    verifyAsync.mockResolvedValue({
      sub: userId,
    });

    // Simulate an existing registered user.
    findUnique.mockResolvedValue({
      id: userId,
      name: 'Test User',
      email: 'test@example.com',
      createdAt: new Date('2026-10-23T00:00:00Z'),
    });

    // Simulate successful task retrieval.
    findOne.mockResolvedValue(sampleTask);

    // Create an isolated NestJS HTTP application.
    const module = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        // Use the real JWT authentication guard.
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

        // Mock task service operations.
        {
          provide: TasksService,
          useValue: {
            createTask: vi.fn(),
            findAll: vi.fn(),
            findOne,
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();

    await app.init();
  });

  afterEach(async () => {
    // Close the application after every test.
    await app.close();
  });

  // TEST 4: Valid task retrieval.
  it('should return an owned task with HTTP 200', async () => {
    const response = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', 'Bearer valid-test-token')
      .expect(200);

    expect(findOne).toHaveBeenCalledWith(userId, taskId);

    expect(response.body).toMatchObject({
      id: taskId,
      title: 'Complete TaskFlow Day 5',
      status: 'TODO',
    });
  });

  // TEST 5: Missing authentication.
  it('should reject requests without a JWT', async () => {
    await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .expect(401);

    expect(findOne).not.toHaveBeenCalled();
  });

  // TEST 6: Invalid authentication token.
  it('should reject invalid JWTs', async () => {
    verifyAsync.mockRejectedValue(
      new Error('Invalid token'),
    );

    await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    expect(findOne).not.toHaveBeenCalled();
  });

  // TEST 7: Invalid task UUID.
  it('should reject malformed task IDs', async () => {
    await request(app.getHttpServer())
      .get('/tasks/not-a-valid-uuid')
      .set('Authorization', 'Bearer valid-test-token')
      .expect(400);

    expect(findOne).not.toHaveBeenCalled();
  });

  // TEST 8: Unauthorized task ownership.
  it('should return 404 for another user task', async () => {
    // Simulate the service rejecting an inaccessible task.
    findOne.mockRejectedValue(
      new NotFoundException('Task not found.'),
    );

    const response = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', 'Bearer valid-test-token')
      .expect(404);

    expect(response.body.statusCode).toBe(404);

    // Confirm the verified user's ID was used.
    expect(findOne).toHaveBeenCalledWith(userId, taskId);
  });
});
