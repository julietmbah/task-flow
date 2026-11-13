
import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// Makes PrismaService available to other NestJS modules.
@Module({
  // NestJS creates and manages the PrismaService instance.
  providers: [PrismaService],

  // Other modules can inject PrismaService when
  // they import PrismaModule.
  exports: [PrismaService],
})
export class PrismaModule {}
