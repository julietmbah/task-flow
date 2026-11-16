
import {
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';

import { describe, expect, it } from 'vitest';

import { RegisterDto } from './register.dto.js';

// Test the registration DTO with the same validation
// settings configured globally in main.ts.
describe('RegisterDto Validation', () => {

  // Create a validation pipe for these tests.
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  // Helper function that validates a registration request.
  // It simulates the body-validation stage in NestJS.
  const validateRegistration = (data: Record<string, unknown>) => {
    return validationPipe.transform(data, {
      type: 'body',
      metatype: RegisterDto,
    });
  };

  // TEST 1: Valid registration information.
  it('should accept valid registration data', async () => {
    const data = {
      name: 'Alice Example',
      email: 'alice@example.com',
      password: 'SecurePassword123!',
    };

    const result = await validateRegistration(data);

    expect(result).toBeInstanceOf(RegisterDto);
    expect(result).toMatchObject(data);
  });

  // TEST 2: Invalid email address.
  it('should reject an invalid email', async () => {
    const data = {
      name: 'Alice Example',
      email: 'invalid-email',
      password: 'SecurePassword123!',
    };

    await expect(
      validateRegistration(data),
    ).rejects.toThrow(BadRequestException);
  });

  // TEST 3: Password shorter than 12 characters.
  it('should reject a short password', async () => {
    const data = {
      name: 'Alice Example',
      email: 'alice@example.com',
      password: '12345',
    };

    await expect(
      validateRegistration(data),
    ).rejects.toThrow(BadRequestException);
  });

  // TEST 4: Unexpected properties.
  it('should reject an unexpected isAdmin field', async () => {
    const data = {
      name: 'Alice Example',
      email: 'alice@example.com',
      password: 'SecurePassword123!',
      isAdmin: true,
    };

    await expect(
      validateRegistration(data),
    ).rejects.toThrow(BadRequestException);
  });

  // TEST 5: Missing required name.
  it('should reject registration without a name', async () => {
    const data = {
      email: 'alice@example.com',
      password: 'SecurePassword123!',
    };

    await expect(
      validateRegistration(data),
    ).rejects.toThrow(BadRequestException);
  });
});
