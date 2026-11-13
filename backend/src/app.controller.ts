
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

// The controller handles incoming HTTP requests.
@Controller()
export class AppController {

  // NestJS provides an instance of AppService
  // through dependency injection.
  constructor(private readonly appService: AppService) {}

  // Handle requests to GET /
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Handle requests to GET /health.
  // Delegate the response logic to AppService.
  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }
}
