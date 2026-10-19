
import { describe, expect, it } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';

import { DatabaseHealthService } from './database-health.service.js';
import type { PrismaService } from './prisma/prisma.service.js';

// Group tests for our database health service.
describe('DatabaseHealthService', () => {

  // Test what happens when the database responds.
  it('should return connected when the database works', async () => {

    // Create a fake PrismaService for testing.
    // This avoids depending on a running database.
    const mockPrisma = {
      $queryRaw: async () => [{ result: 1 }],
    } as unknown as PrismaService;

    const service = new DatabaseHealthService(mockPrisma);

    // Confirm that the service returns the correct response.
    await expect(service.checkConnection()).resolves.toEqual({
      status: 'success',
      database: 'connected',
    });
  });

  // Test what happens when the database is unavailable.
  it('should throw an exception when the database fails', async () => {

    // Simulate a failed PostgreSQL query.
    const mockPrisma = {
      $queryRaw: async () => {
        throw new Error('Database unavailable');
      },
    } as unknown as PrismaService;

    const service = new DatabaseHealthService(mockPrisma);

    // Confirm that the failure is handled correctly.
    await expect(service.checkConnection()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
