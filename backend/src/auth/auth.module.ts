
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

// Groups all authentication-related components.
@Module({
  // Gives AuthService access to PrismaService.
  imports: [PrismaModule],

  // Receives incoming authentication HTTP requests.
  controllers: [AuthController],

  // Contains our registration and login business logic.
  providers: [AuthService],
})
export class AuthModule {}
