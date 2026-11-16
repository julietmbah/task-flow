
import {
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import {
  Test,
  type TestingModule,
} from '@nestjs/testing';

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
// TASKS CONTROLLER HTTP SECURITY TESTS
// =====================================================

describe('TasksController HTTP Security', () => {
  let app: INestApplication;

  // Simulated authenticated user.
  const userId = 'test-user-123';

  // This is a mock token, not a real JWT.
  const validToken = 'valid-test-token';

  // ===================================================
  // MOCK JWT SERVICE
  // ===================================================

  // We simulate JWT verification without signing
  // or exposing real authentication credentials.
  const jwtServiceMock = {
    verifyAsync: vi.fn(),
  };

  // ===================================================
  // MOCK PRISMA SERVICE
  // ===================================================

  // The real JwtAuthGuard checks whether the user
  // exists in PostgreSQL.
  //
  // We mock that database lookup for our tests.
  const prismaServiceMock = {
    user: {
      findUnique: vi.fn(),
    },
  };

  // ===================================================
  // MOCK TASKS SERVICE
  // ===================================================

  // Prevent tests from creating real database records.
  const tasksServiceMock = {
    createTask: vi.fn(),
  };

  // ===================================================
  // TEST SETUP
  // ===================================================

  beforeEach(async () => {
    // Reset previous mock calls and implementations.
    vi.resetAllMocks();

    // Simulate a successfully verified JWT.
    jwtServiceMock.verifyAsync.mockResolvedValue({
      sub: userId,
    });

    // Simulate the registered user found by the guard.
    prismaServiceMock.user.findUnique.mockResolvedValue({
      id: userId,
      name: 'Test User',
      email: 'test@example.com',
      createdAt: new Date('2026-10-22T10:00:00Z'),
    });

    // Create an isolated NestJS testing module.
    const module: TestingModule =
      await Test.createTestingModule({
        controllers: [
          TasksController,
        ],

        providers: [
          // Use our real authentication guard.
          JwtAuthGuard,

          // Mock task creation.
          {
            provide: TasksService,
            useValue: tasksServiceMock,
          },

          // Mock JWT verification.
          {
            provide: JwtService,
            useValue: jwtServiceMock,
          },

          // Mock PostgreSQL access.
          {
            provide: PrismaService,
            useValue: prismaServiceMock,
          },
        ],
      }).compile();

    // Create the HTTP testing application.
    app = module.createNestApplication();

    // Match the validation configuration in main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    // Initialize the HTTP application.
    await app.init();
  });

  // ===================================================
  // TEST CLEANUP
  // ===================================================

  afterEach(async () => {
    // Close the testing application after each test.
    await app.close();
  });

  // ===================================================
  // TEST 1: SUCCESSFUL AUTHENTICATED TASK CREATION
  // ===================================================

  it('should create a task with a valid JWT', async () => {
    // Simulate the saved task returned by TasksService.
    const savedTask = {
      id: 'task-123',
      title: 'Complete TaskFlow Day 5',
      description: null,
      status: 'TODO',
      dueDate: null,
      createdAt: new Date('2026-10-22T12:00:00Z'),
      updatedAt: new Date('2026-10-22T12:00:00Z'),
    };

    tasksServiceMock.createTask.mockResolvedValue(
      savedTask,
    );

    // Send a real HTTP request to the test application.
    const response = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        title: 'Complete TaskFlow Day 5',
      })
      .expect(201);

    // Confirm JWT verification occurred.
    expect(jwtServiceMock.verifyAsync)
      .toHaveBeenCalledWith(validToken);

    // Confirm ownership came from the verified user.
    expect(tasksServiceMock.createTask)
      .toHaveBeenCalledWith(userId, {
        title: 'Complete TaskFlow Day 5',
      });

    // Confirm the API returned the created task.
    expect(response.body).toMatchObject({
      id: 'task-123',
      title: 'Complete TaskFlow Day 5',
      status: 'TODO',
    });

    // Confirm sensitive fields are not returned.
    expect(response.body).not.toHaveProperty(
      'passwordHash',
    );
  });

  // ===================================================
  // TEST 2: OPTIONAL TASK FIELDS
  // ===================================================

  it('should accept a valid description and deadline', async () => {
    const dueDate = '2026-11-01T12:00:00.000Z';

    tasksServiceMock.createTask.mockResolvedValue({
      id: 'task-456',
      title: 'Finish portfolio',
      description: 'Complete TaskFlow',
      status: 'TODO',
      dueDate: new Date(dueDate),
    });

    // Send an authenticated request with optional fields.
    await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        title: 'Finish portfolio',
        description: 'Complete TaskFlow',
        dueDate,
      })
      .expect(201);

    // Confirm the controller converts the deadline
    // into a JavaScript Date before calling the service.
    expect(tasksServiceMock.createTask)
      .toHaveBeenCalledWith(userId, {
        title: 'Finish portfolio',
        description: 'Complete TaskFlow',
        dueDate: new Date(dueDate),
      });
  });

  // ===================================================
  // TEST 3: MISSING AUTHENTICATION
  // ===================================================

  it('should reject requests without a JWT', async () => {
    const response = await request(app.getHttpServer())
      .post('/tasks')
      .send({
        title: 'Unauthenticated task',
      })
      .expect(401);

    // Confirm the authentication error.
    expect(response.body).toMatchObject({
      statusCode: 401,
      message: 'Authentication required.',
    });

    // Task creation must never be attempted.
    expect(tasksServiceMock.createTask)
      .not.toHaveBeenCalled();

    // No token means JWT verification cannot occur.
    expect(jwtServiceMock.verifyAsync)
      .not.toHaveBeenCalled();
  });

  // ===================================================
  // TEST 4: INVALID JWT
  // ===================================================

  it('should reject an invalid JWT', async () => {
    // Simulate failed JWT signature verification.
    jwtServiceMock.verifyAsync.mockRejectedValue(
      new Error('Invalid token'),
    );

    const response = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', 'Bearer invalid-token')
      .send({
        title: 'Unauthorized task',
      })
      .expect(401);

    expect(response.body).toMatchObject({
      statusCode: 401,
      message: 'Invalid or expired authentication token.',
    });

    // Invalid tokens must never reach the database.
    expect(prismaServiceMock.user.findUnique)
      .not.toHaveBeenCalled();

    expect(tasksServiceMock.createTask)
      .not.toHaveBeenCalled();
  });

  // ===================================================
  // TEST 5: MISSING TASK TITLE
  // ===================================================

  it('should reject a task without a title', async () => {
    const response = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        description: 'This task has no title',
      })
      .expect(400);

    // Confirm request validation rejected the title.
    expect(response.body.statusCode).toBe(400);

    expect(response.body.message).toEqual(
      expect.arrayContaining([
        expect.stringContaining('title'),
      ]),
    );

    // Invalid tasks must not be saved.
    expect(tasksServiceMock.createTask)
      .not.toHaveBeenCalled();
  });

  // ===================================================
  // TEST 6: WHITESPACE-ONLY TITLE
  // ===================================================

  it('should reject whitespace-only titles', async () => {
    await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        title: '     ',
      })
      .expect(400);

    // Validation must prevent task creation.
    expect(tasksServiceMock.createTask)
      .not.toHaveBeenCalled();
  });

  // ===================================================
  // TEST 7: INVALID TASK DEADLINE
  // ===================================================

  it('should reject an invalid task deadline', async () => {
    const response = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        title: 'Test deadline validation',
        dueDate: 'not-a-valid-date',
      })
      .expect(400);

    expect(response.body.message).toContain(
      'dueDate must be a valid ISO 8601 date string',
    );

    // The invalid deadline must never be saved.
    expect(tasksServiceMock.createTask)
      .not.toHaveBeenCalled();
  });

  // ===================================================
  // TEST 8: UNAUTHORIZED TASK OWNERSHIP
  // ===================================================

  it('should reject userId in the request body', async () => {
    const response = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        title: 'Unauthorized ownership test',
        userId: 'another-user-id',
      })
      .expect(400);

    // The global ValidationPipe must reject userId.
    expect(response.body.message).toContain(
      'property userId should not exist',
    );

    // No unauthorized task should be created.
    expect(tasksServiceMock.createTask)
      .not.toHaveBeenCalled();
  });
});
