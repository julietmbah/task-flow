
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

// Group all tests related to AppController.
describe('AppController', () => {
  let appController: AppController;

  // Run before each test to create a fresh
  // NestJS testing module.
  beforeEach(async () => {
    const app: TestingModule =
      await Test.createTestingModule({
        controllers: [AppController],
        providers: [AppService],
      }).compile();

    // Get the controller instance we want to test.
    appController = app.get<AppController>(AppController);
  });

  // Test the welcome message functionality.
  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  // Test our new health-check functionality.
  describe('health', () => {
    it('should return the correct health response', () => {
      const result = appController.getHealth();

      // Confirm that the response matches
      // the expected status and message.
      expect(result).toEqual({
        status: 'success',
        message: 'TaskFlow backend is running successfully',
      });
    });
  });
});
