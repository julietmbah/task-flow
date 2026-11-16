import { BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

/**
 * Change-password tests use a mocked Prisma client.
 * No real users or database records are changed.
 */
function setup(passwordHash: string) {
  const findUnique = vi.fn().mockResolvedValue({ passwordHash });
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    user: { findUnique, updateMany },
  } as unknown as PrismaService;

  const service = new AuthService(prisma, {} as JwtService);
  return { service, findUnique, updateMany };
}

describe('AuthService.changePassword', () => {
  it('verifies the current password and stores only a new hash', async () => {
    const previousHash = await hash('OldSecret123!', 4);
    const { service, updateMany } = setup(previousHash);

    await expect(
      service.changePassword('user-1', 'OldSecret123!', 'NewSecret456!'),
    ).resolves.toEqual({ message: 'Your password has been changed successfully.' });

    expect(updateMany).toHaveBeenCalledOnce();
    const args = updateMany.mock.calls[0]?.[0];
    expect(args.where).toEqual({ id: 'user-1', passwordHash: previousHash });
    expect(args.data.passwordHash).not.toBe('NewSecret456!');
    expect(await compare('NewSecret456!', args.data.passwordHash)).toBe(true);
  });

  it('rejects an incorrect current password without updating the account', async () => {
    const { service, updateMany } = setup(await hash('OldSecret123!', 4));
    await expect(
      service.changePassword('user-1', 'WrongPassword!', 'NewSecret456!'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects reusing the current password', async () => {
    const { service, updateMany } = setup(await hash('OldSecret123!', 4));
    await expect(
      service.changePassword('user-1', 'OldSecret123!', 'OldSecret123!'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects new passwords over the bcrypt byte limit', async () => {
    const { service, updateMany } = setup(await hash('OldSecret123!', 4));
    await expect(
      service.changePassword('user-1', 'OldSecret123!', '🙂'.repeat(19)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects a conflicting update instead of overwriting a newer password', async () => {
    const { service, updateMany } = setup(await hash('OldSecret123!', 4));
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.changePassword('user-1', 'OldSecret123!', 'NewSecret456!'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
