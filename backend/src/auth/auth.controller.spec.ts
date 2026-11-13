
import { UnauthorizedException } from '@nestjs/common';

import {
  Test,
  type TestingModule,
} from '@nestjs/testing';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';

import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from './jwt-auth.guard.js';

// =====================================================
// AUTHENTICATION CONTROLLER TESTS
// =====================================================

describe('AuthController', () => {
  let controller: AuthController;

  // ===================================================
  // MOCK AUTHENTICATION SERVICE
  // ===================================================

  // Mock registration and login operations.
  // Controller tests do not require PostgreSQL.
  const authServiceMock = {
    register: vi.fn(),
    login: vi.fn(),
  };

  // ===================================================
  // TEST SETUP
  // ===================================================

  beforeEach(async () => {
    // Reset mock calls and results.
    vi.resetAllMocks();

    // Create a NestJS testing module.
    const module: TestingModule =
      await Test.createTestingModule({
        controllers: [AuthController],

        providers: [
          {
            provide: AuthService,
            useValue: authServiceMock,
          },
        ],
      })

      // Replace the real JWT guard with a mock.
      //
      // The actual guard's security behavior is tested
      // separately in jwt-auth.guard.spec.ts.
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: () => true,
      })

      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  // ===================================================
  // TEST 1: CONTROLLER INITIALIZATION
  // ===================================================

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ===================================================
  // TEST 2: SUCCESSFUL USER REGISTRATION
  // ===================================================

  it('should forward registration data to AuthService', async () => {
    const registrationData: RegisterDto = {
      name: 'Alice Example',
      email: 'alice@example.com',
      password: 'SecurePassword123!',
    };

    const createdUser = {
      id: 'test-user-id',
      name: 'Alice Example',
      email: 'alice@example.com',
      createdAt: new Date('2026-10-21T12:00:00Z'),
    };

    // Simulate successful registration.
    authServiceMock.register.mockResolvedValue(createdUser);

    // Execute registration controller.
    const result = await controller.register(registrationData);

    // Verify the request was forwarded correctly.
    expect(authServiceMock.register).toHaveBeenCalledWith(
      registrationData,
    );

    // Verify the response.
    expect(result).toEqual(createdUser);

    // Ensure sensitive information is not returned.
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('passwordHash');
  });

  // ===================================================
  // TEST 3: SUCCESSFUL USER LOGIN
  // ===================================================

  it('should forward login data and return the authentication response', async () => {
    const loginData: LoginDto = {
      email: 'alice@example.com',
      password: 'SecurePassword123!',
    };

    const loginResponse = {
      accessToken: 'mock.jwt.token',
      tokenType: 'Bearer',

      user: {
        id: 'test-user-id',
        name: 'Alice Example',
        email: 'alice@example.com',
        createdAt: new Date('2026-10-21T12:00:00Z'),
      },
    };

    // Simulate successful login.
    authServiceMock.login.mockResolvedValue(loginResponse);

    // Execute login controller.
    const result = await controller.login(loginData);

    // Verify credentials were forwarded.
    expect(authServiceMock.login).toHaveBeenCalledWith(
      loginData,
    );

    expect(authServiceMock.login).toHaveBeenCalledOnce();

    // Verify the response contains the access token.
    expect(result).toEqual(loginResponse);

    expect(result.accessToken).toBe('mock.jwt.token');

    // Ensure passwords remain private.
    expect(result.user).not.toHaveProperty('password');
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  // ===================================================
  // TEST 4: FAILED USER LOGIN
  // ===================================================

  it('should propagate UnauthorizedException for invalid credentials', async () => {
    const loginData: LoginDto = {
      email: 'alice@example.com',
      password: 'WrongPassword123!',
    };

    // Simulate rejected login credentials.
    authServiceMock.login.mockRejectedValue(
      new UnauthorizedException(
        'Invalid email or password.',
      ),
    );

    // The controller must propagate the error.
    await expect(
      controller.login(loginData),
    ).rejects.toThrow(UnauthorizedException);

    // Verify the login attempt.
    expect(authServiceMock.login).toHaveBeenCalledWith(
      loginData,
    );

    expect(authServiceMock.login).toHaveBeenCalledOnce();
  });

  // ===================================================
  // TEST 5: AUTHENTICATED USER PROFILE
  // ===================================================

  it('should return the authenticated user profile', () => {
    // Simulate a verified user attached by JwtAuthGuard.
    const authenticatedUser = {
      id: 'test-user-id',
      name: 'Alice Example',
      email: 'alice@example.com',
      createdAt: new Date('2026-10-21T12:00:00Z'),
    };

    // Simulate the request after successful authentication.
    const request = {
      user: authenticatedUser,
    } as unknown as AuthenticatedRequest;

    // Execute the protected profile controller method.
    const result = controller.getProfile(request);

    // Verify that the correct user is returned.
    expect(result).toEqual(authenticatedUser);

    // Confirm the user ID matches.
    expect(result.id).toBe('test-user-id');

    // Confirm sensitive information is excluded.
    expect(result).not.toHaveProperty('password');

    expect(result).not.toHaveProperty('passwordHash');
  });

  // ===================================================
  // TEST 6: MISSING AUTHENTICATED USER
  // ===================================================

  it('should reject profile access without an authenticated user', () => {
    // Simulate a request that has no authenticated user.
    const request = {
      user: undefined,
    } as unknown as AuthenticatedRequest;

    // The controller must reject the request.
    expect(() => {
      controller.getProfile(request);
    }).toThrow(UnauthorizedException);

    // The controller must not initiate registration
    // or login when processing profile requests.
    expect(authServiceMock.register).not.toHaveBeenCalled();

    expect(authServiceMock.login).not.toHaveBeenCalled();
  });
});
