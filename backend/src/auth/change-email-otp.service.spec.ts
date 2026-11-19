import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChangeEmailOtpMailService } from './change-email-otp-mail.service.js';
import { ChangeEmailOtpService } from './change-email-otp.service.js';

const USER_ID = 'user-123';
const CURRENT_EMAIL = 'alice@example.com';
const NEW_EMAIL = 'alice.new@example.com';
const secret = Buffer.from('change-email-otp-test-secret').toString('base64');
const verifiedAccount = {
  id: USER_ID,
  email: CURRENT_EMAIL,
  emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function setup() {
  const otp = {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'otp-123' }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const user = {
    findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id?: string; email?: string } }) =>
      where.id ? verifiedAccount : null),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const db = {
    changeEmailOtp: otp,
    user,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ changeEmailOtp: otp, user })),
  };
  const mail = {
    isConfigured: vi.fn().mockReturnValue(true),
    sendCode: vi.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: vi.fn().mockReturnValue('development'),
    getOrThrow: vi.fn().mockReturnValue(secret),
  };
  const service = new ChangeEmailOtpService(
    db as unknown as PrismaService,
    mail as unknown as ChangeEmailOtpMailService,
    config as unknown as ConfigService,
  );
  return { service, otp, user, db, mail, config };
}

type Setup = ReturnType<typeof setup>;

function initialChallenge(s: Setup) {
  const saved = s.otp.create.mock.calls[0]?.[0]?.data;
  const code = s.mail.sendCode.mock.calls[0]?.[1] as string;
  return { saved, code };
}

function activeChallenge(s: Setup) {
  const { saved } = initialChallenge(s);
  return {
    newEmail: NEW_EMAIL,
    otpHash: saved.otpHash,
    expiresAt: new Date(Date.now() + 120_000),
    attempts: 0,
    usedAt: null,
  };
}

describe('Change Email OTP (signed-in users)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('creates an email-bound hashed six-digit code valid for 10 minutes without changing the current email', async () => {
    const s = setup();
    const response = await s.service.request(USER_ID, ' ALICE.NEW@EXAMPLE.COM ');
    const { saved, code } = initialChallenge(s);
    expect(response.newEmail).toBe(NEW_EMAIL);
    expect(code).toMatch(/^[0-9]{6}$/);
    expect(saved.otpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(saved.otpHash).not.toBe(code);
    expect(saved.newEmail).toBe(NEW_EMAIL);
    expect(saved.expiresAt.getTime() - saved.createdAt.getTime()).toBe(600_000);
    expect(saved.attempts).toBe(0);
    expect(saved.usedAt).toBeNull();
    expect(s.mail.sendCode).toHaveBeenCalledWith(NEW_EMAIL, code);
    expect(s.user.updateMany).not.toHaveBeenCalled();
  });

  it('requires the user to be signed in and verified', async () => {
    const s = setup();
    s.user.findUnique.mockResolvedValue(null);
    await expect(s.service.request(USER_ID, NEW_EMAIL)).rejects.toThrow(UnauthorizedException);
    s.user.findUnique.mockResolvedValue({ ...verifiedAccount, emailVerifiedAt: null });
    await expect(s.service.request(USER_ID, NEW_EMAIL)).rejects.toThrow(UnauthorizedException);
    expect(s.mail.sendCode).not.toHaveBeenCalled();
  });

  it('rejects an unchanged email address and an email already in use', async () => {
    const s = setup();
    await expect(s.service.request(USER_ID, CURRENT_EMAIL)).rejects.toThrow(BadRequestException);
    s.user.findUnique.mockImplementation(async ({ where }: { where: { id?: string; email?: string } }) =>
      where.id ? verifiedAccount : { id: 'another-user' });
    await expect(s.service.request(USER_ID, NEW_EMAIL)).rejects.toThrow(ConflictException);
    expect(s.mail.sendCode).not.toHaveBeenCalled();
  });

  it('blocks YOPmail addresses only in production', async () => {
    const s = setup();
    await expect(s.service.request(USER_ID, 'test@yopmail.com')).resolves.toHaveProperty('newEmail');
    s.config.get.mockReturnValue('production');
    await expect(s.service.request(USER_ID, 'test@yopmail.com')).rejects.toThrow(BadRequestException);
  });

  it('rejects requests when SMTP is unavailable', async () => {
    const s = setup();
    s.mail.isConfigured.mockReturnValue(false);
    await expect(s.service.request(USER_ID, NEW_EMAIL)).rejects.toThrow(ServiceUnavailableException);
    expect(s.user.findUnique).not.toHaveBeenCalled();
  });

  it('enforces a 60-second cooldown even if the email address changes', async () => {
    const s = setup();
    s.otp.findUnique.mockResolvedValue({ createdAt: new Date(Date.now() - 59_000) });
    await expect(s.service.request(USER_ID, NEW_EMAIL)).rejects.toThrow(BadRequestException);
    expect(s.otp.updateMany).not.toHaveBeenCalled();
    expect(s.mail.sendCode).not.toHaveBeenCalled();
  });

  it('resends only to the pending new email, replacing the previous code after cooldown', async () => {
    const s = setup();
    const previousHash = 'a'.repeat(64);
    s.otp.findUnique
      .mockResolvedValueOnce({ newEmail: NEW_EMAIL, usedAt: null })
      .mockResolvedValueOnce({ newEmail: NEW_EMAIL, otpHash: previousHash, createdAt: new Date(Date.now() - 61_000) });
    const response = await s.service.resend(USER_ID);
    const replacement = s.otp.updateMany.mock.calls[0]?.[0]?.data;
    expect(response.newEmail).toBe(NEW_EMAIL);
    expect(replacement.otpHash).not.toBe(previousHash);
    expect(replacement.expiresAt.getTime() - replacement.createdAt.getTime()).toBe(600_000);
    expect(replacement.attempts).toBe(0);
    expect(replacement.usedAt).toBeNull();
    expect(s.mail.sendCode).toHaveBeenCalledWith(NEW_EMAIL, expect.stringMatching(/^[0-9]{6}$/));
  });

  it('does not resend when no pending unconsumed challenge exists', async () => {
    const s = setup();
    await expect(s.service.resend(USER_ID)).rejects.toThrow(BadRequestException);
    s.otp.findUnique.mockResolvedValue({ newEmail: NEW_EMAIL, usedAt: new Date() });
    await expect(s.service.resend(USER_ID)).rejects.toThrow(BadRequestException);
    expect(s.mail.sendCode).not.toHaveBeenCalled();
  });

  it('removes an unusable challenge when sending the email fails', async () => {
    const s = setup();
    s.mail.sendCode.mockRejectedValue(new Error('connection unavailable'));
    await expect(s.service.request(USER_ID, NEW_EMAIL)).rejects.toThrow(ServiceUnavailableException);
    expect(s.otp.deleteMany).toHaveBeenCalledOnce();
    expect(s.user.updateMany).not.toHaveBeenCalled();
  });

  it('rejects expired codes even if unused and never changes the account email', async () => {
    const s = setup();
    s.otp.findUnique.mockResolvedValue({
      newEmail: NEW_EMAIL,
      otpHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() - 1000),
      attempts: 0,
      usedAt: null,
    });
    await expect(s.service.verify(USER_ID, '123456')).rejects.toThrow(BadRequestException);
    expect(s.db.$transaction).not.toHaveBeenCalled();
    expect(s.user.updateMany).not.toHaveBeenCalled();
  });

  it('rejects already-used codes and five failed attempts', async () => {
    const s = setup();
    const sample = { newEmail: NEW_EMAIL, otpHash: '0'.repeat(64), expiresAt: new Date(Date.now() + 120_000) };
    s.otp.findUnique.mockResolvedValueOnce({ ...sample, attempts: 0, usedAt: new Date() });
    await expect(s.service.verify(USER_ID, '123456')).rejects.toThrow(BadRequestException);
    s.otp.findUnique.mockResolvedValueOnce({ ...sample, attempts: 5, usedAt: null });
    await expect(s.service.verify(USER_ID, '123456')).rejects.toThrow(BadRequestException);
    expect(s.db.$transaction).not.toHaveBeenCalled();
  });

  it('counts incorrect code attempts without updating the registered email', async () => {
    const s = setup();
    s.otp.findUnique.mockResolvedValue({
      newEmail: NEW_EMAIL,
      otpHash: '0'.repeat(64),
      expiresAt: new Date(Date.now() + 120_000),
      attempts: 0,
      usedAt: null,
    });
    await expect(s.service.verify(USER_ID, '123456')).rejects.toThrow(BadRequestException);
    expect(s.otp.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { attempts: { increment: 1 } },
    }));
    expect(s.user.updateMany).not.toHaveBeenCalled();
  });

  it('atomically consumes a correct code and updates the email once', async () => {
    const s = setup();
    await s.service.request(USER_ID, NEW_EMAIL);
    const { code } = initialChallenge(s);
    s.otp.findUnique.mockResolvedValue(activeChallenge(s));
    await expect(s.service.verify(USER_ID, code)).resolves.toEqual({
      message: 'Your email address has been updated successfully.', email: NEW_EMAIL,
    });
    expect(s.db.$transaction).toHaveBeenCalledOnce();
    expect(s.otp.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ usedAt: null, newEmail: NEW_EMAIL, expiresAt: expect.anything() }),
      data: { usedAt: expect.any(Date) },
    }));
    expect(s.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: USER_ID, email: CURRENT_EMAIL },
      data: { email: NEW_EMAIL, emailVerifiedAt: expect.any(Date) },
    }));
  });

  it('refuses simultaneous redemption if the OTP was consumed elsewhere', async () => {
    const s = setup();
    await s.service.request(USER_ID, NEW_EMAIL);
    const { code } = initialChallenge(s);
    s.otp.findUnique.mockResolvedValue(activeChallenge(s));
    s.otp.updateMany.mockResolvedValue({ count: 0 });
    await expect(s.service.verify(USER_ID, code)).rejects.toThrow(BadRequestException);
    expect(s.user.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a code sent before a successful resend', async () => {
    const s = setup();
    await s.service.request(USER_ID, NEW_EMAIL);
    const oldCode = initialChallenge(s).code;
    s.otp.findUnique.mockResolvedValueOnce({
      newEmail: NEW_EMAIL, usedAt: null,
    }).mockResolvedValueOnce({
      newEmail: NEW_EMAIL,
      otpHash: initialChallenge(s).saved.otpHash,
      createdAt: new Date(Date.now() - 61_000),
    });
    await s.service.resend(USER_ID);
    const latestHash = s.otp.updateMany.mock.calls[0]?.[0]?.data.otpHash;
    s.otp.findUnique.mockResolvedValue({
      newEmail: NEW_EMAIL,
      otpHash: latestHash,
      expiresAt: new Date(Date.now() + 120_000),
      attempts: 0,
      usedAt: null,
    });
    await expect(s.service.verify(USER_ID, oldCode)).rejects.toThrow(BadRequestException);
    expect(s.user.updateMany).not.toHaveBeenCalled();
  });

  it('reports unique-address conflicts at verification time without changing the current email', async () => {
    const s = setup();
    await s.service.request(USER_ID, NEW_EMAIL);
    const { code } = initialChallenge(s);
    s.otp.findUnique.mockResolvedValue(activeChallenge(s));
    s.user.updateMany.mockRejectedValue({ code: 'P2002' });
    await expect(s.service.verify(USER_ID, code)).rejects.toThrow(ConflictException);
  });
});
