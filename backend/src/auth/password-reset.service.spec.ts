import { createHash, createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { hash, compare } from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../prisma/prisma.service.js';
import { PasswordResetMailService } from './password-reset-mail.service.js';
import { PasswordResetService } from './password-reset.service.js';

const VALID_TOKEN = 'ab'.repeat(32);
const TOKEN_HASH = createHash('sha256').update(VALID_TOKEN).digest('hex');
const INVALID_LINK = /invalid or has expired/i;
const OTP_SECRET = Buffer.alloc(32, 7).toString('base64');

function otpHash(userId: string, code: string): string {
  return createHmac('sha256', Buffer.from(OTP_SECRET, 'base64'))
    .update(`taskflow:password-reset-otp:v1\0${userId}\0${code}`, 'utf8')
    .digest('hex');
}

function createTestSetup() {
  const db = {
    user: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    passwordResetOtp: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
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
    sendVerificationCode: vi.fn().mockResolvedValue(undefined),
  };
  const config = { getOrThrow: vi.fn(() => OTP_SECRET) };
  const service = new PasswordResetService(
    prisma as unknown as PrismaService,
    mail as unknown as PasswordResetMailService,
    config as unknown as ConfigService,
  );
  return { service, db, prisma, mail, config };
}

describe('PasswordResetService', () => {
  let setup: ReturnType<typeof createTestSetup>;

  beforeEach(() => {
    setup = createTestSetup();
    setup.db.passwordResetOtp.findUnique.mockResolvedValue(null);
    setup.db.passwordResetOtp.create.mockResolvedValue({ id: 'otp-1' });
    setup.db.passwordResetOtp.updateMany.mockResolvedValue({ count: 1 });
    setup.db.passwordResetOtp.deleteMany.mockResolvedValue({ count: 1 });
    setup.db.passwordResetToken.findFirst.mockResolvedValue(null);
    setup.db.passwordResetToken.create.mockResolvedValue({ id: 'token-1' });
    setup.db.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    setup.db.passwordResetToken.delete.mockResolvedValue({ id: 'token-1' });
    setup.db.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    setup.db.user.updateMany.mockResolvedValue({ count: 1 });
  });

  it('does not disclose whether an email address is registered', async () => {
    setup.db.user.findUnique.mockResolvedValue(null);
    const result = await setup.service.requestReset('Missing@Example.com');
    expect(result.message).toMatch(/if an account exists/i);
    expect(result.message).toMatch(/verification code/i);
    expect(setup.mail.sendVerificationCode).not.toHaveBeenCalled();
    expect(setup.db.passwordResetOtp.create).not.toHaveBeenCalled();
  });

  it('handles missing SMTP configuration without looking up the account', async () => {
    setup.mail.isConfigured.mockReturnValue(false);
    await expect(setup.service.requestReset('any@example.com'))
      .rejects.toThrow(/temporarily unavailable/i);
    expect(setup.db.user.findUnique).not.toHaveBeenCalled();
  });

  it('emails a six-digit code, storing only its keyed hash', async () => {
    setup.db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'person@example.com' });
    const result = await setup.service.requestReset(' PERSON@Example.com ');
    expect(result.message).toMatch(/if an account exists/i);
    expect(setup.db.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'person@example.com' }, select: { id: true, email: true },
    });
    const sentCode = setup.mail.sendVerificationCode.mock.calls[0]?.[1] as string;
    expect(sentCode).toMatch(/^\d{6}$/);
    expect(setup.mail.sendResetLink).not.toHaveBeenCalled();
    const created = setup.db.passwordResetOtp.create.mock.calls[0]?.[0] as {
      data: { userId: string; otpHash: string; expiresAt: Date; attempts: number },
    };
    expect(created.data.userId).toBe('user-1');
    expect(created.data.otpHash).toBe(otpHash('user-1', sentCode));
    expect(created.data.otpHash).not.toBe(sentCode);
    expect(created.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(created.data.attempts).toBe(0);
  });

  it('blocks resend attempts during the sixty-second cooldown', async () => {
    setup.db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'person@example.com' });
    setup.db.passwordResetOtp.findUnique.mockResolvedValue({ createdAt: new Date() });
    const result = await setup.service.requestReset('person@example.com');
    expect(result.message).toMatch(/if an account exists/i);
    expect(setup.mail.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('reissues after cooldown, resetting expiry, attempts and single-use status', async () => {
    setup.db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'person@example.com' });
    setup.db.passwordResetOtp.findUnique.mockResolvedValue({
      createdAt: new Date(Date.now() - 70_000),
    });
    await setup.service.requestReset('person@example.com');
    const args = setup.db.passwordResetOtp.updateMany.mock.calls[0]?.[0] as {
      data: { attempts: number; usedAt: Date | null; expiresAt: Date },
    };
    expect(args.data.attempts).toBe(0);
    expect(args.data.usedAt).toBeNull();
    expect(args.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(setup.mail.sendVerificationCode).toHaveBeenCalledOnce();
  });

  it('does not retain the OTP if its email cannot be sent', async () => {
    setup.db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'person@example.com' });
    setup.mail.sendVerificationCode.mockRejectedValue(new Error('SMTP failed'));
    const result = await setup.service.requestReset('person@example.com');
    expect(result.message).toMatch(/if an account exists/i);
    expect(setup.db.passwordResetOtp.deleteMany).toHaveBeenCalledOnce();
    expect(setup.db.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown email with the same invalid-code message', async () => {
    setup.db.user.findUnique.mockResolvedValue(null);
    await expect(setup.service.verifyOtp('missing@example.com', '123456'))
      .rejects.toThrow(/incorrect or has expired/i);
  });

  it('counts incorrect OTP attempts without sending a link', async () => {
    setup.db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'person@example.com' });
    setup.db.passwordResetOtp.findUnique.mockResolvedValue({
      otpHash: otpHash('user-1', '123456'),
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, usedAt: null,
    });
    await expect(setup.service.verifyOtp('person@example.com', '999999'))
      .rejects.toThrow(/incorrect or has expired/i);
    expect(setup.db.passwordResetOtp.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } }),
    );
    expect(setup.mail.sendResetLink).not.toHaveBeenCalled();
  });

  it('blocks codes once the attempt limit is reached', async () => {
    setup.db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'person@example.com' });
    setup.db.passwordResetOtp.findUnique.mockResolvedValue({
      otpHash: otpHash('user-1', '123456'),
      expiresAt: new Date(Date.now() + 60_000), attempts: 5, usedAt: null,
    });
    await expect(setup.service.verifyOtp('person@example.com', '123456'))
      .rejects.toThrow(/incorrect or has expired/i);
    expect(setup.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects expired or already-consumed OTPs', async () => {
    setup.db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'person@example.com' });
    for (const challenge of [
      { otpHash: otpHash('user-1', '123456'), expiresAt: new Date(Date.now() - 1000), attempts: 0, usedAt: null },
      { otpHash: otpHash('user-1', '123456'), expiresAt: new Date(Date.now() + 60_000), attempts: 0, usedAt: new Date() },
    ]) {
      setup.db.passwordResetOtp.findUnique.mockResolvedValue(challenge);
      await expect(setup.service.verifyOtp('person@example.com', '123456'))
        .rejects.toThrow(/incorrect or has expired/i);
    }
    expect(setup.mail.sendResetLink).not.toHaveBeenCalled();
  });

  it('consumes a correct OTP and emails only a hashed, one-use reset link', async () => {
    setup.db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'person@example.com' });
    setup.db.passwordResetOtp.findUnique.mockResolvedValue({
      otpHash: otpHash('user-1', '123456'),
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, usedAt: null,
    });
    const result = await setup.service.verifyOtp(' PERSON@Example.com ', '123456');
    expect(result.message).toMatch(/check your email/i);
    expect(setup.prisma.$transaction).toHaveBeenCalledOnce();
    const consumed = setup.db.passwordResetOtp.updateMany.mock.calls[0]?.[0] as {
      where: { otpHash: string }, data: { usedAt: Date },
    };
    expect(consumed.where.otpHash).toBe(otpHash('user-1', '123456'));
    expect(consumed.data.usedAt).toBeInstanceOf(Date);
    const rawToken = setup.mail.sendResetLink.mock.calls[0]?.[1] as string;
    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
    const created = setup.db.passwordResetToken.create.mock.calls[0]?.[0] as {
      data: { tokenHash: string; expiresAt: Date },
    };
    expect(created.data.tokenHash).toBe(createHash('sha256').update(rawToken).digest('hex'));
    expect(created.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects concurrent verification after the OTP has been consumed', async () => {
    setup.db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'person@example.com' });
    setup.db.passwordResetOtp.findUnique.mockResolvedValue({
      otpHash: otpHash('user-1', '123456'),
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, usedAt: null,
    });
    setup.db.passwordResetOtp.updateMany.mockResolvedValue({ count: 0 });
    await expect(setup.service.verifyOtp('person@example.com', '123456'))
      .rejects.toThrow(/incorrect or has expired/i);
    expect(setup.db.passwordResetToken.create).not.toHaveBeenCalled();
    expect(setup.mail.sendResetLink).not.toHaveBeenCalled();
  });

  it('returns a friendly error and unlocks retry if sending the link fails', async () => {
    setup.db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'person@example.com' });
    setup.db.passwordResetOtp.findUnique.mockResolvedValue({
      otpHash: otpHash('user-1', '123456'),
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, usedAt: null,
    });
    setup.mail.sendResetLink.mockRejectedValue(new Error('SMTP failed'));
    await expect(setup.service.verifyOtp('person@example.com', '123456'))
      .rejects.toThrow(/could not email your reset link/i);
    expect(setup.db.passwordResetToken.delete).toHaveBeenCalledWith({ where: { id: 'token-1' } });
    expect(setup.db.passwordResetOtp.updateMany).toHaveBeenCalledTimes(2);
    expect(setup.db.passwordResetOtp.updateMany.mock.calls[1]?.[0]).toMatchObject({
      data: { usedAt: null },
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
