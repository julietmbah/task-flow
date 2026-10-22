
import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';

import { LoginDto } from './login.dto.js';

// Helper function that creates a LoginDto
// using the values supplied by each test.
function createLoginDto(data: Partial<LoginDto>): LoginDto {
  return Object.assign(new LoginDto(), data);
}

describe('LoginDto', () => {

  // TEST 1: Accept correct login information.
  it('should accept a valid email and password', async () => {
    const dto = createLoginDto({
      email: 'user@example.com',
      password: 'SecurePassword123!',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  // TEST 2: Reject an incorrectly formatted email.
  it('should reject an invalid email address', async () => {
    const dto = createLoginDto({
      email: 'invalid-email',
      password: 'SecurePassword123!',
    });

    const errors = await validate(dto);

    expect(errors.some(error => error.property === 'email'))
      .toBe(true);
  });

  // TEST 3: Reject a request without an email.
  it('should reject a missing email', async () => {
    const dto = createLoginDto({
      password: 'SecurePassword123!',
    });

    const errors = await validate(dto);

    expect(errors.some(error => error.property === 'email'))
      .toBe(true);
  });

  // TEST 4: Reject an empty password.
  it('should reject an empty password', async () => {
    const dto = createLoginDto({
      email: 'user@example.com',
      password: '',
    });

    const errors = await validate(dto);

    expect(errors.some(error => error.property === 'password'))
      .toBe(true);
  });

  // TEST 5: Reject a request without a password.
  it('should reject a missing password', async () => {
    const dto = createLoginDto({
      email: 'user@example.com',
    });

    const errors = await validate(dto);

    expect(errors.some(error => error.property === 'password'))
      .toBe(true);
  });

  // TEST 6: Reject passwords that are not strings.
  it('should reject a non-string password', async () => {
    const dto = createLoginDto({
      email: 'user@example.com',
      password: 12345 as unknown as string,
    });

    const errors = await validate(dto);

    expect(errors.some(error => error.property === 'password'))
      .toBe(true);
  });
});
