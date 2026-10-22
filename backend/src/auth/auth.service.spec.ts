
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;

  // Mock database operations so tests do not
  // need to connect to a real PostgreSQL database.
  const prismaMock = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };

  beforeEach(async () => {
    // Clear previous mock calls and return values.
    // This ensures that tests do not affect each other.
    vi.resetAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          AuthService,

          // Replace the real PrismaService with our mock.
          {
            provide: PrismaService,
            useValue: prismaMock,
          },
        ],
      }).compile();

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

    // Simulate the public user data returned by Prisma.
    const createdUser = {
      id: 'test-user-id',
      name: 'Alice Example',
      email: 'alice@example.com',
      createdAt: new Date('2026-10-21T12:00:00Z'),
    };

    prismaMock.user.create.mockResolvedValue(createdUser);

    // Attempt to register the user.
    const result = await service.register({
      name: '  Alice Example  ',
      email: 'ALICE@example.com',
      password: 'SecurePassword123!',
    });

    // Verify that the email was converted to lowercase.
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

    // Verify that plaintext passwords are not saved.
    expect(createArguments.data.passwordHash).not.toBe(
      'SecurePassword123!',
    );

    // Verify that only safe user information is returned.
    expect(result).toEqual(createdUser);

    // Passwords must never appear in API responses.
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('passwordHash');
  });

  // =====================================================
  // TEST 3: DUPLICATE EMAIL PREVENTION
  // =====================================================

  it('should reject an email that is already registered', async () => {
    // Simulate an existing user in PostgreSQL.
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'existing-user-id',
    });

    // Attempt to register using the existing email.
    await expect(
      service.register({
        name: 'Alice Example',
        email: 'alice@example.com',
        password: 'SecurePassword123!',
      }),
    ).rejects.toThrow(ConflictException);

    // No new user should be inserted into the database.
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  // =====================================================
  // TEST 4: WHITESPACE-ONLY NAME VALIDATION
  // =====================================================

  it('should reject whitespace-only names', async () => {
    // A name containing only spaces should be rejected
    // after AuthService removes surrounding whitespace.
    await expect(
      service.register({
        name: '     ',
        email: 'spaces@example.com',
        password: 'SecurePassword123!',
      }),
    ).rejects.toThrow(BadRequestException);

    // Invalid names should not trigger database operations.
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();

    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  // =====================================================
  // TEST 5: BCRYPT PASSWORD BYTE-LIMIT PROTECTION
  // =====================================================

  it('should reject passwords longer than 72 UTF-8 bytes', async () => {
    // Each 'é' occupies 2 bytes in UTF-8.
    // 37 characters therefore occupy 74 bytes.
    const longPassword = 'é'.repeat(37);

    // Verify our test password actually exceeds 72 bytes.
    expect(Buffer.byteLength(longPassword, 'utf8')).toBe(74);

    // AuthService must reject passwords exceeding
    // bcrypt's 72-byte input limit.
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
    // Simulate our initial email check finding no user.
    prismaMock.user.findUnique.mockResolvedValue(null);

    // Simulate PostgreSQL rejecting the insertion because
    // another registration request inserted this email
    // between our initial check and create operation.
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

    // AuthService should translate the Prisma P2002
    // error into an HTTP 409 Conflict exception.
    await expect(
      service.register({
        name: 'Alice Example',
        email: 'alice@example.com',
        password: 'SecurePassword123!',
      }),
    ).rejects.toThrow(ConflictException);

    // Verify that the database insertion was attempted.
    expect(prismaMock.user.create).toHaveBeenCalledOnce();
  });
});
