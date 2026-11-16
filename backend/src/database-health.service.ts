
import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { PrismaService } from './prisma/prisma.service.js';

// This service checks whether PostgreSQL
// can respond to a real database query.
@Injectable()
export class DatabaseHealthService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async checkConnection() {
    try {
      // Execute a simple SQL query using Prisma.
      // SELECT 1 verifies that PostgreSQL responds.
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'success',
        database: 'connected',
      };
    } catch {
      // Return HTTP 503 if the database is unavailable.
      // Do not expose internal database error details.
      throw new ServiceUnavailableException(
        'Database connection failed',
      );
    }
  }
}
