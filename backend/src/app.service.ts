
import { Injectable } from '@nestjs/common';

// The Injectable decorator allows NestJS to manage
// this class and inject it into other classes.
@Injectable()
export class AppService {

  // Return a simple welcome message.
  // This is used by the root endpoint (GET /).
  getHello(): string {
    return 'Hello World!';
  }

  // Provide the response for our health-check API.
  // Keeping this logic in a service makes it reusable
  // and easier to test independently.
  getHealth() {
    return {
      status: 'success',
      message: 'TaskFlow backend is running successfully',
    };
  }
}
