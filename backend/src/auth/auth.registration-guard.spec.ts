import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

describe('Day 16 login verification gate', () => {
  it('rejects a correct password for an unverified account without issuing a JWT', async () => {
    const signed = { signAsync: vi.fn() };
    const user = {
      findUnique: vi.fn().mockResolvedValue({
        id: 'pending-user', name: 'Pending User', email: 'pending@example.com',
        passwordHash: await hash('SecurePassword123!', 4),
        emailVerifiedAt: null, createdAt: new Date(),
      }),
    };
    const service = new AuthService({ user } as unknown as PrismaService, signed as unknown as JwtService);
    await expect(service.login({ email: 'pending@example.com', password: 'SecurePassword123!' }))
      .rejects.toThrow(UnauthorizedException);
    expect(signed.signAsync).not.toHaveBeenCalled();
  });
});
