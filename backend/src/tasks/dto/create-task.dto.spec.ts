
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateTaskDto } from './create-task.dto.js';

/**
 * CreateTaskDto Unit Tests
 *
 * These tests verify the validation rules
 * used when creating a new TaskFlow task.
 *
 * No database connection is required.
 */

/**
 * Convert a request body into our DTO
 * and validate its properties.
 *
 * whitelist:
 * Removes properties without validation decorators.
 *
 * forbidNonWhitelisted:
 * Rejects requests containing unexpected properties.
 *
 * We will configure the same behavior in
 * NestJS ValidationPipe later.
 */
async function validateTask(body: Record<string, unknown>) {
  // Convert plain request data into our DTO class.
  const dto = plainToInstance(CreateTaskDto, body);

  // Validate the DTO and return any validation errors.
  return validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('CreateTaskDto', () => {
  /**
   * TEST 1
   *
   * A task with a valid title should pass.
   */
  it('should accept a valid task title', async () => {
    const errors = await validateTask({
      title: 'Learn NestJS',
    });

    expect(errors).toHaveLength(0);
  });

  /**
   * TEST 2
   *
   * Optional description and deadline
   * should be accepted when valid.
   */
  it('should accept valid optional fields', async () => {
    const errors = await validateTask({
      title: 'Complete TaskFlow',
      description: 'Build the task management API',
      dueDate: '2026-11-01T12:00:00.000Z',
    });

    expect(errors).toHaveLength(0);
  });

  /**
   * TEST 3
   *
   * Every task must have a title.
   */
  it('should reject a missing title', async () => {
    const errors = await validateTask({
      description: 'A task without a title',
    });

    expect(
      errors.some((error) => error.property === 'title'),
    ).toBe(true);
  });

  /**
   * TEST 4
   *
   * An empty title must be rejected.
   */
  it('should reject an empty title', async () => {
    const errors = await validateTask({
      title: '',
    });

    expect(
      errors.some((error) => error.property === 'title'),
    ).toBe(true);
  });

  /**
   * TEST 5
   *
   * A title containing only spaces
   * must not be considered meaningful.
   */
  it('should reject whitespace-only titles', async () => {
    const errors = await validateTask({
      title: '     ',
    });

    expect(
      errors.some((error) => error.property === 'title'),
    ).toBe(true);
  });

  /**
   * TEST 6
   *
   * Task titles cannot exceed 200 characters.
   */
  it('should reject titles longer than 200 characters', async () => {
    const errors = await validateTask({
      title: 'A'.repeat(201),
    });

    expect(
      errors.some((error) => error.property === 'title'),
    ).toBe(true);
  });

  /**
   * TEST 7
   *
   * Task titles must be strings.
   */
  it('should reject non-string titles', async () => {
    const errors = await validateTask({
      title: 12345,
    });

    expect(
      errors.some((error) => error.property === 'title'),
    ).toBe(true);
  });

  /**
   * TEST 8
   *
   * Task descriptions cannot exceed
   * 5,000 characters.
   */
  it('should reject overly long descriptions', async () => {
    const errors = await validateTask({
      title: 'Write documentation',
      description: 'A'.repeat(5001),
    });

    expect(
      errors.some((error) => error.property === 'description'),
    ).toBe(true);
  });

  /**
   * TEST 9
   *
   * Deadlines must be valid ISO 8601 strings.
   */
  it('should reject invalid task deadlines', async () => {
    const errors = await validateTask({
      title: 'Finish backend',
      dueDate: 'next Friday',
    });

    expect(
      errors.some((error) => error.property === 'dueDate'),
    ).toBe(true);
  });

  /**
   * TEST 10
   *
   * The client must not supply a task owner's ID.
   *
   * Ownership will be determined using the
   * authenticated user's verified JWT.
   *
   * Rejecting unexpected properties requires
   * whitelist and forbidNonWhitelisted validation.
   */
  it('should reject userId from the request body', async () => {
    const errors = await validateTask({
      title: 'Private task',
      userId: 'another-user-id',
    });

    expect(
      errors.some((error) => error.property === 'userId'),
    ).toBe(true);
  });
});
