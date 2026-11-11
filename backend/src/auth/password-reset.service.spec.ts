import { createHash } from 'node:crypto';
import { hash, compare } from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../prisma/prisma.service.js';
import { PasswordResetMailService } from './password-reset-mail.service.js';
import { PasswordResetService } from './password-reset.service.js';

const VALID_TOKEN = 'ab'.repeat(32);
const TOKEN_HASH = createHash('sha256').update(VALID_TOKEN).digest('hex');
const INVALID_LINK = /invalid or has expired/i;

function createTestSetup() {
  const db = {
    user: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    passwordResetToken: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const prisma = {
    ...db,
    $transaction: vi.fn(async (work: (client: typeof db) => Promise<unknown>) =>
      work(db)),
  };
  const mail = {
    isConfigured: vi.fn(() => true),
    sendResetLink: vi.fn().mockResolvedValue(undefined),
  };
  const service = new PasswordResetService(
    prisma as unknown as PrismaService,
    mail as unknown as PasswordResetMailService,
  );
  return { service, db, prisma, mail };
}

describe('PasswordResetService', () => {
  let setup: ReturnType<typeof createTestSetup>;

  beforeEach(() => {
    setup = createTestSetup();
    setup.db.passwordResetToken.findFirst.mockResolvedValue(null);
    setup.db.passwordResetToken.create.mockResolvedValue({ id: 'token-1' });
    setup.db.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    setup.db.passwordResetToken.delete.mockResolvedValue({ id: 'token-1' });
    setup.db.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    setup.db.user.updateMany.mockResolvedValue({ count: 1 });
  });

  it('returns the same generic message for unregistered emails', async () => {
    setup.db.user.findUnique.mockResolvedValue(null);
    const result = await setup.service.requestReset('Missing@Example.com');
    expect(result.message).toMatch(/if an account exists/i);
    expect(setup.mail.sendResetLink).not.toHaveBeenCalled();
    expect(setup.db.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it('rejects every address consistently when email is not configured', async () => {
    setup.mail.isConfigured.mockReturnValue(false);
    await expect(setup.service.requestReset('any@example.com'))
      .rejects.toThrow(/temporarily unavailable/i);
    expect(setup.db.user.findUnique).not.toHaveBeenCalled();
  });

  it('stores a SHA-256 token hash, not the emailed token', async () => {
    setup.db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'person@example.com' });
    const result = await setup.service.requestReset(' PERSON@Example.com ');
    expect(result.message).toMatch(/if an account exists/i);
    expect(setup.db.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'person@example.com' }, select: { id: true, email: true },
    });
    const sentToken = setup.mail.sendResetLink.mock.calls[0]?.[1] as string;
    expect(sentToken).toMatch(/^[a-f0-9]{64}$/);
    const created = setup.db.passwordResetToken.create.mock.calls[0]?.[0] as {
      data: { tokenHash: string; expiresAt: Date };
    };
    expect(created.data.tokenHash).toBe(
      createHash('sha256').update(sentToken).digest('hex'),
    );
    expect(created.data.tokenHash).not.toBe(sentToken);
    expect(created.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('does not send another email within the cooldown', async () => {
    setup.db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'person@example.com' });
    setup.db.passwordResetToken.findFirst.mockResolvedValue({ id: 'recent' });
    await setup.service.requestReset('person@example.com');
    expect(setup.mail.sendResetLink).not.toHaveBeenCalled();
  });

  it('keeps the generic response when SMTP fails and deletes the unusable token', async () => {
    setup.db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'person@example.com' });
    setup.mail.sendResetLink.mockRejectedValue(new Error('SMTP error'));
    const result = await setup.service.requestReset('person@example.com');
    expect(result.message).toMatch(/if an account exists/i);
    expect(setup.db.passwordResetToken.delete).toHaveBeenCalledWith({
      where: { id: 'token-1' },
    });
  });

  it('changes the password and marks all links consumed in one transaction', async () => {
    const oldHash = await hash('OldPassword123!', 4);
    setup.db.passwordResetToken.findUnique.mockResolvedValue({
      userId: 'user-1', expiresAt: new Date(Date.now() + 60_000),
      usedAt: null, user: { passwordHash: oldHash },
    });
    const result = await setup.service.resetPassword(VALID_TOKEN, 'NewPassword123!');
    expect(result.message).toMatch(/password has been reset/i);
    expect(setup.prisma.$transaction).toHaveBeenCalledOnce();
    expect(setup.db.passwordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tokenHash: TOKEN_HASH, usedAt: null }),
      }),
    );
    const updateArgs = setup.db.user.updateMany.mock.calls[0]?.[0] as {
      where: { id: string; passwordHash: string };
      data: { passwordHash: string };
    };
    expect(updateArgs.where).toEqual({ id: 'user-1', passwordHash: oldHash });
    expect(updateArgs.data.passwordHash).not.toBe('NewPassword123!');
    expect(await compare('NewPassword123!', updateArgs.data.passwordHash)).toBe(true);
    expect(setup.db.passwordResetToken.updateMany).toHaveBeenCalledTimes(2);
  });

  it('rejects expired links without updating a password', async () => {
    setup.db.passwordResetToken.findUnique.mockResolvedValue({
      userId: 'user-1', expiresAt: new Date(Date.now() - 1_000),
      usedAt: null, user: { passwordHash: 'old' },
    });
    await expect(setup.service.resetPassword(VALID_TOKEN, 'NewPassword123!'))
      .rejects.toThrow(INVALID_LINK);
    expect(setup.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an already-used link', async () => {
    setup.db.passwordResetToken.findUnique.mockResolvedValue({
      userId: 'user-1', expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(), user: { passwordHash: 'old' },
    });
    await expect(setup.service.resetPassword(VALID_TOKEN, 'NewPassword123!'))
      .rejects.toThrow(INVALID_LINK);
  });

  it('rejects reuse of the existing password', async () => {
    const oldHash = await hash('SamePassword123!', 4);
    setup.db.passwordResetToken.findUnique.mockResolvedValue({
      userId: 'user-1', expiresAt: new Date(Date.now() + 60_000),
      usedAt: null, user: { passwordHash: oldHash },
    });
    await expect(setup.service.resetPassword(VALID_TOKEN, 'SamePassword123!'))
      .rejects.toThrow(/different from your previous one/i);
    expect(setup.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects concurrent redemption if the token was already consumed', async () => {
    const oldHash = await hash('OldPassword123!', 4);
    setup.db.passwordResetToken.findUnique.mockResolvedValue({
      userId: 'user-1', expiresAt: new Date(Date.now() + 60_000),
      usedAt: null, user: { passwordHash: oldHash },
    });
    setup.db.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(setup.service.resetPassword(VALID_TOKEN, 'NewPassword123!'))
      .rejects.toThrow(INVALID_LINK);
    expect(setup.db.user.updateMany).not.toHaveBeenCalled();
  });

  it('rejects passwords longer than bcrypt can safely handle', async () => {
    await expect(setup.service.resetPassword(VALID_TOKEN, 'a'.repeat(73)))
      .rejects.toThrow(/too long/i);
    expect(setup.db.passwordResetToken.findUnique).not.toHaveBeenCalled();
  });
  it('requires uppercase, lowercase, a number and a symbol for a reset password', async () => {
    for (const candidate of ['lowercase123!', 'UPPERCASE123!', 'NoNumber!', 'NoSymbol123']) {
      await expect(setup.service.resetPassword(VALID_TOKEN, candidate))
        .rejects.toThrow(/uppercase letter, a lowercase letter, a number, and a symbol/i);
    }
    expect(setup.db.passwordResetToken.findUnique).not.toHaveBeenCalled();
  });

  it('accepts underscore as the required symbol', async () => {
    const oldHash = await hash('OldPassword123!', 4);
    setup.db.passwordResetToken.findUnique.mockResolvedValue({
      userId: 'user-1', expiresAt: new Date(Date.now() + 60_000),
      usedAt: null, user: { passwordHash: oldHash },
    });
    const result = await setup.service.resetPassword(VALID_TOKEN, 'Fresh_Pass9');
    expect(result.message).toMatch(/password has been reset/i);
    const updated = setup.db.user.updateMany.mock.calls[0]?.[0] as {
      data: { passwordHash: string };
    };
    expect(await compare('Fresh_Pass9', updated.data.passwordHash)).toBe(true);
  });

});
