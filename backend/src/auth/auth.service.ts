
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

import { hash } from 'bcryptjs';

import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  // NestJS injects our reusable database service.
  constructor(private readonly prisma: PrismaService) {}

  // Registers a new TaskFlow user.
  async register(registrationData: RegisterDto) {
    // Remove surrounding spaces from the name and email.
    // Email addresses are normalized to lowercase for consistency.
    const name = registrationData.name.trim();
    const email = registrationData.email.trim().toLowerCase();

    // Reject names containing only whitespace.
    if (name.length < 2) {
      throw new BadRequestException(
        'Name must contain at least 2 characters.',
      );
    }

    // bcrypt processes at most 72 bytes of a password.
    // Reject longer passwords to prevent silent truncation.
    if (Buffer.byteLength(registrationData.password, 'utf8') > 72) {
      throw new BadRequestException(
        'Password must not exceed 72 UTF-8 bytes.',
      );
    }

    // Check whether this email address is already registered.
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException(
        'An account with this email already exists.',
      );
    }

    // Hash the password before saving it.
    // 12 is the bcrypt cost factor.
    const passwordHash = await hash(registrationData.password, 12);

    try {
      // Create the user in PostgreSQL through Prisma.
      return await this.prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
        },

        // Return only safe public fields.
        // Never include passwordHash in an API response.
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      });
    } catch (error) {
      // The database enforces email uniqueness too.
      // Handle another request registering the same email
      // between our initial check and the database insert.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists.',
        );
      }

      // Let NestJS handle any unexpected database errors.
      throw error;
    }
  }
}
