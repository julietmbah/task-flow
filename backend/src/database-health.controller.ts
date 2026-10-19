
import { Controller, Get } from '@nestjs/common';

import { DatabaseHealthService } from './database-health.service.js';

// Handle requests to /db-health.
@Controller('db-health')
export class DatabaseHealthController {
  constructor(
    private readonly databaseHealthService: DatabaseHealthService,
  ) {}

  // GET /db-health
  // Ask the service to check the database connection.
  @Get()
  async checkHealth() {
    return this.databaseHealthService.checkConnection();
  }
}
