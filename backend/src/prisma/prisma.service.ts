
import 'dotenv/config';

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

// Injectable allows NestJS to provide this service
// to other services that need database access.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // Read the database URL from backend/.env.
    // Never hardcode database passwords in source code.
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not configured');
    }

    // Prisma 7 uses a PostgreSQL driver adapter.
    // The adapter manages connections to PostgreSQL.
    const adapter = new PrismaPg({
      connectionString: databaseUrl,
    });

    // Pass the adapter to Prisma Client.
    super({ adapter });
  }

  // Connect when NestJS initializes this service.
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  // Close the connection during application shutdown.
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
