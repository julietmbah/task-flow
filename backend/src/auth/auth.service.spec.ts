
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;

  // =====================================================
  // MOCK PRISMA DATABASE
  // =====================================================

  // Mock database operations so tests do not
  // connect to a real PostgreSQL database.
  const prismaMock = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };

  // =====================================================
  // MOCK JWT SERVICE
  // =====================================================

  // Mock JWT token generation so tests do not
  // depend on actual authentication secrets.
  const jwtMock = {
    signAsync: vi.fn(),
  };

  // =====================================================
  // TEST SETUP
  // =====================================================

  beforeEach(async () => {
    // Reset all mock calls and return values.
    // This keeps tests independent.
    vi.resetAllMocks();

    // Create a NestJS testing module.
    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          AuthService,

          // Replace real PrismaService with a mock.
          {
            provide: PrismaService,
            useValue: prismaMock,
          },

          // Replace real JwtService with a mock.
          {
            provide: JwtService,
            useValue: jwtMock,
          },
        ],
      }).compile();

    // Retrieve AuthService from the testing module.
    service = module.get<AuthService>(AuthService);
  });

  // =====================================================
  // TEST 1: AUTH SERVICE INITIALIZATION
  // =====================================================

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =====================================================
  // TEST 2: SUCCESSFUL USER REGISTRATION
  // =====================================================

  it('should register a user without exposing the password hash', async () => {
    // Simulate an email that does not already exist.
    prismaMock.user.findUnique.mockResolvedValue(null);

    // Simulate public user data returned by Prisma.
    const createdUser = {
      id: 'test-user-id',
      name: 'Alice Example',
      email: 'alice@example.com',
      createdAt: new Date('2026-10-21T12:00:00Z'),
    };

    prismaMock.user.create.mockResolvedValue(createdUser);

    // Attempt to register a new user.
    const result = await service.register({
      name: '  Alice Example  ',
      email: 'ALICE@example.com',
      password: 'SecurePassword123!',
    });

    // Verify that email normalization works.
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: {
        email: 'alice@example.com',
      },
      select: {
        id: true,
      },
    });

    // Inspect the data sent to Prisma.
    const createArguments =
      prismaMock.user.create.mock.calls[0][0];

    // Verify that the name was trimmed.
    expect(createArguments.data.name).toBe('Alice Example');

    // Verify that the email was normalized.
    expect(createArguments.data.email).toBe(
      'alice@example.com',
    );

    // Ensure the password was hashed before saving.
    expect(createArguments.data.passwordHash).not.toBe(
      'SecurePassword123!',
    );

    // Verify that only public user information is returned.
    expect(result).toEqual(createdUser);

    // Never expose passwords or password hashes.
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('passwordHash');
  });

  // =====================================================
  // TEST 3: DUPLICATE EMAIL PREVENTION
  // =====================================================

  it('should reject an email that is already registered', async () => {
    // Simulate an existing user.
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'existing-user-id',
    });

    // Registration must fail with HTTP 409 Conflict.
    await expect(
      service.register({
        name: 'Alice Example',
        email: 'alice@example.com',
        password: 'SecurePassword123!',
      }),
    ).rejects.toThrow(ConflictException);

    // No new database record should be created.
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  // =====================================================
  // TEST 4: WHITESPACE-ONLY NAME VALIDATION
  // =====================================================

  it('should reject whitespace-only names', async () => {
    // Names consisting entirely of spaces are invalid.
    await expect(
      service.register({
        name: '     ',
        email: 'spaces@example.com',
        password: 'SecurePassword123!',
      }),
    ).rejects.toThrow(BadRequestException);

    // Invalid names must not trigger database operations.
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();

    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  // =====================================================
  // TEST 5: BCRYPT PASSWORD BYTE-LIMIT PROTECTION
  // =====================================================

  it('should reject passwords longer than 72 UTF-8 bytes', async () => {
    // The character represented by \u00E9 uses
    // two bytes in UTF-8.
    // 37 such characters therefore occupy 74 bytes.
    const longPassword = '\u00E9'.repeat(37);

    // Confirm the password exceeds bcrypt's limit.
    expect(Buffer.byteLength(longPassword, 'utf8')).toBe(74);

    // Registration must reject oversized passwords.
    await expect(
      service.register({
        name: 'Alice Example',
        email: 'alice@example.com',
        password: longPassword,
      }),
    ).rejects.toThrow(BadRequestException);

    // Invalid passwords must not reach PostgreSQL.
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();

    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  // =====================================================
  // TEST 6: DATABASE UNIQUE-CONSTRAINT VIOLATION
  // =====================================================

  it('should handle a concurrent duplicate email conflict', async () => {
    // Simulate an initial email check finding no user.
    prismaMock.user.findUnique.mockResolvedValue(null);

    // Simulate PostgreSQL rejecting a duplicate email.
    prismaMock.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on email',
        {
          code: 'P2002',
          clientVersion: '7.10.1',
          meta: {
            target: ['email'],
          },
        },
      ),
    );

    // AuthService must translate P2002 into HTTP 409.
    await expect(
      service.register({
        name: 'Alice Example',
        email: 'alice@example.com',
        password: 'SecurePassword123!',
      }),
    ).rejects.toThrow(ConflictException);

    // Confirm a database insertion was attempted.
    expect(prismaMock.user.create).toHaveBeenCalledOnce();
  });
});
