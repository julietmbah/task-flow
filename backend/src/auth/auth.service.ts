import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';

import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  // =====================================================
  // DEPENDENCY INJECTION
  // =====================================================

  // PrismaService handles PostgreSQL database operations.
  // JwtService generates signed authentication tokens.
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // =====================================================
  // USER REGISTRATION
  // =====================================================

  // Registers a new TaskFlow user.
  async register(registrationData: RegisterDto) {
    // Remove surrounding spaces from name and email.
    // Normalize email to lowercase.
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

    // Check whether this email already exists.
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    // Prevent duplicate email registration.
    if (existingUser) {
      throw new ConflictException(
        'An account with this email already exists.',
      );
    }

    // Hash the password securely before saving.
    // Cost factor 12 makes brute-force attacks more expensive.
    const passwordHash = await hash(
      registrationData.password,
      12,
    );

    try {
      // Create the user in PostgreSQL through Prisma.
      return await this.prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
        },

        // Return only safe public information.
        // Never expose the password hash.
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      });
    } catch (error) {
      // Handle concurrent registration requests.
      // PostgreSQL enforces email uniqueness.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists.',
        );
      }

      // Allow NestJS to handle unexpected errors.
      throw error;
    }
  }

  // =====================================================
  // USER LOGIN
  // =====================================================

  // Authenticates an existing TaskFlow user.
  async login(loginData: LoginDto) {
    // Normalize email exactly as we do during registration.
    const email = loginData.email.trim().toLowerCase();

    // Reject passwords exceeding bcrypt's 72-byte limit.
    // Return a generic authentication error.
    if (Buffer.byteLength(loginData.password, 'utf8') > 72) {
      throw new UnauthorizedException(
        'Invalid email or password.',
      );
    }

    // ===================================================
    // STEP 1: FIND USER IN DATABASE
    // ===================================================

    // Search PostgreSQL for the supplied email.
    const user = await this.prisma.user.findUnique({
      where: { email },

      // Retrieve only the fields required for login.
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        createdAt: true,
      },
    });

    // Do not reveal whether an email is registered.
    if (!user) {
      throw new UnauthorizedException(
        'Invalid email or password.',
      );
    }

    // ===================================================
    // STEP 2: VERIFY PASSWORD USING BCRYPT
    // ===================================================

    // Compare the plaintext password supplied during login
    // with the bcrypt hash stored in PostgreSQL.
    const passwordMatches = await compare(
      loginData.password,
      user.passwordHash,
    );

    // Reject incorrect passwords.
    if (!passwordMatches) {
      throw new UnauthorizedException(
        'Invalid email or password.',
      );
    }

    // ===================================================
    // STEP 3: GENERATE JWT ACCESS TOKEN
    // ===================================================

    // JWT payload contains the user's unique identifier.
    // "sub" is the standard JWT subject claim.
    //
    // The JWT module configured in AuthModule controls:
    // - Secret key
    // - Signing algorithm (HS256)
    // - Token expiration (15 minutes)
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
    });

    // ===================================================
    // STEP 4: RETURN SAFE LOGIN RESPONSE
    // ===================================================

    // Return the token and public user information.
    // Never return the stored password hash.
    return {
      accessToken,
      tokenType: 'Bearer',

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
    };
  }

  // =====================================================
  // CHANGE PASSWORD (SIGNED-IN USERS)
  // =====================================================

  /**
   * Verify the current password and replace it with a bcrypt hash.
   *
   * We never return the password or its hash to the frontend.
   * A conditional update prevents an older request overwriting
   * a newer password if two requests happen at once.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    // bcrypt only considers the first 72 UTF-8 bytes.
    // Reject longer values instead of silently truncating them.
    if (Buffer.byteLength(currentPassword, 'utf8') > 72) {
      throw new BadRequestException('Your current password is incorrect.');
    }

    if (Buffer.byteLength(newPassword, 'utf8') > 72) {
      throw new BadRequestException(
        'Your new password is too long. Please choose a shorter one.',
      );
    }

    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!account) {
      throw new UnauthorizedException('Please sign in again.');
    }

    const isCurrentPasswordCorrect = await compare(
      currentPassword,
      account.passwordHash,
    );

    if (!isCurrentPasswordCorrect) {
      throw new BadRequestException('Your current password is incorrect.');
    }

    // Comparing against the hash also handles the case where a
    // different-looking input has the same underlying password.
    const isReusingPassword = await compare(newPassword, account.passwordHash);
    if (isReusingPassword) {
      throw new BadRequestException(
        'Choose a new password that is different from your current one.',
      );
    }

    const passwordHash = await hash(newPassword, 12);
    const result = await this.prisma.user.updateMany({
      where: { id: userId, passwordHash: account.passwordHash },
      data: { passwordHash },
    });

    if (result.count !== 1) {
      throw new ConflictException(
        'Your password was changed elsewhere. Please sign in and try again.',
      );
    }

    return { message: 'Your password has been changed successfully.' };
  }

}
