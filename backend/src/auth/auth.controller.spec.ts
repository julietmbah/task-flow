
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';

describe('AuthController', () => {
  let controller: AuthController;

  // Mock AuthService so we can test our controller
  // without connecting to a real database.
  const authServiceMock = {
    register: vi.fn(),
  };

  beforeEach(async () => {
    // Reset mock results between tests.
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],

      providers: [
        {
          provide: AuthService,
          useValue: authServiceMock,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should forward registration data to AuthService', async () => {
    // Sample registration information.
    const registrationData: RegisterDto = {
      name: 'Alice Example',
      email: 'alice@example.com',
      password: 'SecurePassword123!',
    };

    // Simulate the successful response from AuthService.
    const createdUser = {
      id: 'test-user-id',
      name: 'Alice Example',
      email: 'alice@example.com',
      createdAt: new Date('2026-10-21T12:00:00Z'),
    };

    authServiceMock.register.mockResolvedValue(createdUser);

    // Call the controller method.
    const result = await controller.register(registrationData);

    // Verify the controller passed the data to AuthService.
    expect(authServiceMock.register).toHaveBeenCalledWith(
      registrationData,
    );

    // Verify the controller returned the expected user.
    expect(result).toEqual(createdUser);

    // Ensure the response doesn't expose a password.
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('passwordHash');
  });
});
