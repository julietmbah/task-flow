
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { PrismaService } from '../prisma/prisma.service.js';

// =====================================================
// AUTHENTICATED USER TYPE
// =====================================================

// Defines the user information available to protected
// routes after JWT authentication succeeds.
export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
};

// Extend the Express request with authenticated user data.
export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

// =====================================================
// JWT AUTHENTICATION GUARD
// =====================================================

@Injectable()
export class JwtAuthGuard implements CanActivate {

  // Inject the JWT and database services.
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // Determines whether a request can access
  // a protected endpoint.
  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {

    // =================================================
    // STEP 1: ACCESS THE HTTP REQUEST
    // =================================================

    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();

    // Read the Authorization header.
    const authorization = request.headers.authorization;

    // =================================================
    // STEP 2: EXTRACT THE BEARER TOKEN
    // =================================================

    // Require the format: Bearer <access-token>.
    const match = authorization?.match(
      /^Bearer ([^\s]+)$/i,
    );

    // Reject requests without a properly formatted token.
    if (!match) {
      throw new UnauthorizedException(
        'Authentication required.',
      );
    }

    const token = match[1];

    // =================================================
    // STEP 3: VERIFY THE JWT
    // =================================================

    let payload: { sub?: unknown };

    try {
      // Verify the cryptographic signature and expiration.
      // JwtModule supplies the configured signing secret
      // and permitted verification algorithm.
      payload = await this.jwtService.verifyAsync<{
        sub?: unknown;
      }>(token);
    } catch {
      // Reject expired, malformed, or incorrectly signed JWTs.
      throw new UnauthorizedException(
        'Invalid or expired authentication token.',
      );
    }

    // =================================================
    // STEP 4: VALIDATE THE USER IDENTIFIER
    // =================================================

    // Our login service stores the user ID in "sub".
    if (
      typeof payload?.sub !== 'string' ||
      payload.sub.length === 0
    ) {
      throw new UnauthorizedException(
        'Invalid authentication token.',
      );
    }

    // =================================================
    // STEP 5: CONFIRM THE USER STILL EXISTS
    // =================================================

    // Retrieve the user using the verified token's ID.
    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
      },

      // Retrieve only non-sensitive account information.
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    // A valid token must not authenticate a deleted user.
    if (!user) {
      throw new UnauthorizedException(
        'User account not found.',
      );
    }

    // =================================================
    // STEP 6: ATTACH THE AUTHENTICATED USER
    // =================================================

    // Protected controllers can now access request.user.
    // Never attach the user's password hash.
    request.user = user;

    // =================================================
    // STEP 7: ALLOW THE REQUEST
    // =================================================

    return true;
  }
}
