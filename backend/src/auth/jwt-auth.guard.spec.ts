
import {
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { PrismaService } from '../prisma/prisma.service.js';

import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from './jwt-auth.guard.js';

// =====================================================
// JWT AUTHENTICATION GUARD TESTS
// =====================================================

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  // ===================================================
  // MOCK JWT SERVICE
  // ===================================================

  // Prevent tests from depending on real JWT secrets.
  const jwtMock = {
    verifyAsync: vi.fn(),
  };

  // ===================================================
  // MOCK PRISMA SERVICE
  // ===================================================

  // Prevent tests from connecting to PostgreSQL.
  const prismaMock = {
    user: {
      findUnique: vi.fn(),
    },
  };

  // ===================================================
  // SAMPLE USER
  // ===================================================

  const testUser = {
    id: 'test-user-id',
    name: 'Alice Example',
    email: 'alice@example.com',
    createdAt: new Date('2026-10-22T12:00:00Z'),
  };

  // ===================================================
  // MOCK HTTP REQUEST HELPER
  // ===================================================

  // Simulate an HTTP request with an optional
  // Authorization header.
  function createRequest(
    authorization?: string,
  ): AuthenticatedRequest {
    return {
      headers: {
        authorization,
      },
    } as unknown as AuthenticatedRequest;
  }

  // ===================================================
  // MOCK EXECUTION CONTEXT HELPER
  // ===================================================

  // NestJS guards receive ExecutionContext.
  // This helper simulates the HTTP request context.
  function createContext(
    request: AuthenticatedRequest,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  // ===================================================
  // TEST SETUP
  // ===================================================

  beforeEach(async () => {
    // Reset all mock calls and results.
    vi.resetAllMocks();

    // Create our NestJS testing module.
    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          JwtAuthGuard,

          // Replace real JWT verification with a mock.
          {
            provide: JwtService,
            useValue: jwtMock,
          },

          // Replace PostgreSQL queries with a mock.
          {
            provide: PrismaService,
            useValue: prismaMock,
          },
        ],
      }).compile();

    // Retrieve the guard from NestJS.
    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  // ===================================================
  // TEST 1: GUARD INITIALIZATION
  // ===================================================

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  // ===================================================
  // TEST 2: MISSING JWT
  // ===================================================

  it('should reject requests without a JWT', async () => {
    // Create a request without Authorization.
    const request = createRequest();
    const context = createContext(request);

    // The guard must reject unauthenticated requests.
    await expect(
      guard.canActivate(context),
    ).rejects.toThrow(UnauthorizedException);

    // No token should be verified.
    expect(jwtMock.verifyAsync).not.toHaveBeenCalled();

    // No database lookup should occur.
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  // ===================================================
  // TEST 3: INVALID AUTHORIZATION FORMAT
  // ===================================================

  it('should reject incorrectly formatted Authorization headers', async () => {
    // Use Basic instead of Bearer authentication.
    const request = createRequest('Basic invalid-token');
    const context = createContext(request);

    await expect(
      guard.canActivate(context),
    ).rejects.toThrow(UnauthorizedException);

    // Incorrect headers must not reach JWT verification.
    expect(jwtMock.verifyAsync).not.toHaveBeenCalled();
  });

  // ===================================================
  // TEST 4: INVALID JWT SIGNATURE
  // ===================================================

  it('should reject an invalid JWT signature', async () => {
    const request = createRequest('Bearer invalid.jwt.token');
    const context = createContext(request);

    // Simulate JWT verification rejecting the signature.
    jwtMock.verifyAsync.mockRejectedValue(
      new Error('invalid signature'),
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toThrow(UnauthorizedException);

    // No database lookup for an invalid token.
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  // ===================================================
  // TEST 5: EXPIRED JWT
  // ===================================================

  it('should reject expired JWT tokens', async () => {
    const request = createRequest('Bearer expired.jwt.token');
    const context = createContext(request);

    // Simulate the JWT library detecting expiration.
    jwtMock.verifyAsync.mockRejectedValue(
      new Error('jwt expired'),
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toThrow(UnauthorizedException);

    // Expired tokens must not reach the database.
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  // ===================================================
  // TEST 6: INVALID TOKEN SUBJECT
  // ===================================================

  it('should reject JWTs without a valid user ID', async () => {
    const request = createRequest('Bearer test.jwt.token');
    const context = createContext(request);

    // Simulate a verified token with no user identifier.
    jwtMock.verifyAsync.mockResolvedValue({
      iat: 1000,
      exp: 2000,
    });

    await expect(
      guard.canActivate(context),
    ).rejects.toThrow(UnauthorizedException);

    // No database lookup should occur.
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  // ===================================================
  // TEST 7: DELETED OR UNKNOWN USER
  // ===================================================

  it('should reject a valid JWT for a deleted user', async () => {
    const request = createRequest('Bearer valid.jwt.token');
    const context = createContext(request);

    // Simulate a verified JWT containing the user's ID.
    jwtMock.verifyAsync.mockResolvedValue({
      sub: testUser.id,
    });

    // Simulate the account no longer existing.
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(context),
    ).rejects.toThrow(UnauthorizedException);

    // Verify that the database was queried.
    expect(prismaMock.user.findUnique).toHaveBeenCalledOnce();

    // Never authenticate a user whose account is missing.
    expect(request.user).toBeUndefined();
  });

  // ===================================================
  // TEST 8: SUCCESSFUL AUTHENTICATION
  // ===================================================

  it('should allow valid JWTs and attach the authenticated user', async () => {
    const request = createRequest('Bearer valid.jwt.token');
    const context = createContext(request);

    // Simulate successful JWT verification.
    jwtMock.verifyAsync.mockResolvedValue({
      sub: testUser.id,
    });

    // Simulate PostgreSQL returning the user.
    prismaMock.user.findUnique.mockResolvedValue(testUser);

    // Execute our authentication guard.
    const result = await guard.canActivate(context);

    // Authentication should succeed.
    expect(result).toBe(true);

    // Verify that the token was checked.
    expect(jwtMock.verifyAsync).toHaveBeenCalledWith(
      'valid.jwt.token',
    );

    // Verify the guard searches for the correct user.
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: {
        id: testUser.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    // Confirm the authenticated user is attached.
    expect(request.user).toEqual(testUser);

    // Sensitive fields must never be attached.
    expect(request.user).not.toHaveProperty('password');
    expect(request.user).not.toHaveProperty('passwordHash');
  });
});
