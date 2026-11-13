
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';

import { hash } from 'bcryptjs';

import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService - User Login', () => {
  let service: AuthService;

  // The password used throughout our login tests.
  const correctPassword = 'SecurePassword123!';

  // This variable will contain a real bcrypt hash.
  let passwordHash: string;

  // Sample user data matching our Prisma User model.
  const userData = {
    id: 'test-user-id',
    name: 'Alice Example',
    email: 'alice@example.com',
    createdAt: new Date('2026-10-21T12:00:00Z'),
  };

  // =====================================================
  // MOCK DATABASE SERVICE
  // =====================================================

  // Mock Prisma so tests never access real PostgreSQL.
  const prismaMock = {
    user: {
      findUnique: vi.fn(),
    },
  };

  // =====================================================
  // MOCK JWT SERVICE
  // =====================================================

  // Simulate JWT signing without using our real secret.
  const jwtMock = {
    signAsync: vi.fn(),
  };

  // =====================================================
  // TEST SETUP
  // =====================================================

  // Generate a real bcrypt hash once before the tests.
  // Cost factor 4 keeps tests fast.
  // Production registration continues to use cost 12.
  beforeAll(async () => {
    passwordHash = await hash(correctPassword, 4);
  });

  beforeEach(async () => {
    // Reset all mocks between tests.
    vi.resetAllMocks();

    // Return a simulated JWT whenever signing succeeds.
    jwtMock.signAsync.mockResolvedValue('mock.jwt.token');

    // Create our NestJS testing module.
    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          AuthService,

          // Replace PostgreSQL access with our mock.
          {
            provide: PrismaService,
            useValue: prismaMock,
          },

          // Replace JWT signing with our mock.
          {
            provide: JwtService,
            useValue: jwtMock,
          },
        ],
      }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // =====================================================
  // TEST 1: SUCCESSFUL LOGIN
  // =====================================================

  it('should log in with valid credentials and return a JWT', async () => {
    // Simulate finding a registered user.
    prismaMock.user.findUnique.mockResolvedValue({
      ...userData,
      passwordHash,
    });

    // Attempt login using the correct credentials.
    const result = await service.login({
      email: 'alice@example.com',
      password: correctPassword,
    });

    // Verify the generated login response.
    expect(result).toEqual({
      accessToken: 'mock.jwt.token',
      tokenType: 'Bearer',
      user: userData,
    });

    // JWT must identify the authenticated user.
    expect(jwtMock.signAsync).toHaveBeenCalledWith({
      sub: userData.id,
    });

    // Sensitive password information must not leak.
    expect(result).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('password');
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  // =====================================================
  // TEST 2: EMAIL NORMALIZATION
  // =====================================================

  it('should normalize email addresses during login', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userData,
      passwordHash,
    });

    // Supply uppercase letters and surrounding spaces.
    await service.login({
      email: '  ALICE@EXAMPLE.COM  ',
      password: correctPassword,
    });

    // Prisma must receive a normalized email.
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: 'alice@example.com',
        },
      }),
    );

    // Valid credentials should still generate a token.
    expect(jwtMock.signAsync).toHaveBeenCalledOnce();
  });

  // =====================================================
  // TEST 3: NONEXISTENT ACCOUNT
  // =====================================================

  it('should reject login for an unknown email', async () => {
    // Simulate an account that does not exist.
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'unknown@example.com',
        password: correctPassword,
      }),
    ).rejects.toThrow(UnauthorizedException);

    // Unknown users must never receive JWT tokens.
    expect(jwtMock.signAsync).not.toHaveBeenCalled();
  });

  // =====================================================
  // TEST 4: INCORRECT PASSWORD
  // =====================================================

  it('should reject an incorrect password', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userData,
      passwordHash,
    });

    // Supply an incorrect password.
    await expect(
      service.login({
        email: 'alice@example.com',
        password: 'WrongPassword123!',
      }),
    ).rejects.toThrow(UnauthorizedException);

    // JWT signing must not happen.
    expect(jwtMock.signAsync).not.toHaveBeenCalled();
  });

  // =====================================================
  // TEST 5: PASSWORD CASE SENSITIVITY
  // =====================================================

  it('should treat passwords as case-sensitive', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userData,
      passwordHash,
    });

    // This differs from the real password in case.
    await expect(
      service.login({
        email: 'alice@example.com',
        password: 'securePassword123!',
      }),
    ).rejects.toThrow(UnauthorizedException);

    // Incorrect capitalization must not generate a JWT.
    expect(jwtMock.signAsync).not.toHaveBeenCalled();
  });

  // =====================================================
  // TEST 6: BCRYPT PASSWORD LENGTH PROTECTION
  // =====================================================

  it('should reject passwords exceeding 72 UTF-8 bytes', async () => {
    // Each character occupies two UTF-8 bytes.
    // 37 characters = 74 bytes.
    const longPassword = '\u00E9'.repeat(37);

    expect(Buffer.byteLength(longPassword, 'utf8')).toBe(74);

    // Login should reject the oversized password.
    await expect(
      service.login({
        email: 'alice@example.com',
        password: longPassword,
      }),
    ).rejects.toThrow(UnauthorizedException);

    // No database access or JWT signing should occur.
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(jwtMock.signAsync).not.toHaveBeenCalled();
  });
});
