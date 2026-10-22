
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule, ObserveInstrument } from './app.module.js';

// Bootstrap and configure the TaskFlow NestJS application.
async function bootstrap() {
  // Create the NestJS application with monitoring support.
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  // Apply validation to all incoming API requests.
  // Validation rules are defined in our DTO classes.
  app.useGlobalPipes(
    new ValidationPipe({
      // Only allow properties declared in the DTO.
      whitelist: true,

      // Reject unexpected properties instead of removing them.
      forbidNonWhitelisted: true,

      // Transform incoming data into DTO class instances.
      transform: true,
    }),
  );

  // Start the application using the configured port.
  // Default to port 3000 when PORT is not provided.
  await app.listen(process.env.PORT ?? 3000);
}

// Start the TaskFlow application.
await bootstrap();
