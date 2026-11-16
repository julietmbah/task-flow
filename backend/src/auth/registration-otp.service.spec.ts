import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegistrationOtpMailService } from './registration-otp-mail.service.js';
import { RegistrationOtpService } from './registration-otp.service.js';

const account = { id: 'user-123', email: 'alice@example.com', emailVerifiedAt: null };
const secret = Buffer.from('day16-test-only-secret').toString('base64');

function setup() {
  const otp = {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'otp-1' }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const user = {
    findUnique: vi.fn().mockResolvedValue(account),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const db = {
    registrationOtp: otp,
    user,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ registrationOtp: otp, user })),
  };
  const mail = {
    isConfigured: vi.fn().mockReturnValue(true),
    sendRegistrationCode: vi.fn().mockResolvedValue(undefined),
  };
  const config = {
    getOrThrow: vi.fn().mockReturnValue(secret),
    get: vi.fn().mockReturnValue('development'),
  };
  const service = new RegistrationOtpService(
    db as unknown as PrismaService,
    mail as unknown as RegistrationOtpMailService,
    config as unknown as ConfigService,
  );
  return { service, otp, user, db, mail, config };
}

function issuedChallenge(s: ReturnType<typeof setup>) {
  const row = s.otp.create.mock.calls[0]?.[0]?.data;
  const code = s.mail.sendRegistrationCode.mock.calls[0]?.[1] as string;
  return { ...row, code };
}

describe('Day 16 registration email OTP', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('allows YOPmail in development but rejects new YOPmail registrations in production', () => {
    const s = setup();
    expect(() => s.service.validateRegistrationEmail('test@yopmail.com')).not.toThrow();
    s.config.get.mockReturnValue('production');
    expect(() => s.service.validateRegistrationEmail('test@yopmail.com')).toThrow(BadRequestException);
    expect(() => s.service.validateRegistrationEmail('test@gmail.com')).not.toThrow();
  });

  it('requires email delivery before registration can start', () => {
    const s = setup();
    s.mail.isConfigured.mockReturnValue(false);
    expect(() => s.service.ensureMailAvailable()).toThrow(ServiceUnavailableException);
  });

  it('emails a six-digit code, stores only a hash, and sets ten-minute expiration', async () => {
    const s = setup();
    await s.service.sendInitialCode(account.id, account.email);
    const { code, otpHash, expiresAt, createdAt, attempts, usedAt } = issuedChallenge(s);
    expect(code).toMatch(/^[0-9]{6}$/);
    expect(otpHash).toMatch(/^[a-f0-9]{64}$/);
    expect(otpHash).not.toBe(code);
    expect(expiresAt.getTime() - createdAt.getTime()).toBe(600_000);
    expect(attempts).toBe(0);
    expect(usedAt).toBeNull();
  });

  it('blocks immediate resend attempts during the 60-second cooldown', async () => {
    const s = setup();
    s.otp.findUnique.mockResolvedValue({ createdAt: new Date() });
    await s.service.resend('ALICE@example.com');
    expect(s.mail.sendRegistrationCode).not.toHaveBeenCalled();
    expect(s.otp.updateMany).not.toHaveBeenCalled();
  });

  it('blocks resend at 59 seconds while the code remains valid', async () => {
    const s = setup();
    s.otp.findUnique.mockResolvedValue({ createdAt: new Date(Date.now() - 59_000) });
    await s.service.resend(account.email);
    expect(s.mail.sendRegistrationCode).not.toHaveBeenCalled();
    expect(s.otp.updateMany).not.toHaveBeenCalled();
  });

  it('resending replaces the previous code and resets expiry and attempts', async () => {
    const s = setup();
    s.otp.findUnique.mockResolvedValue({ createdAt: new Date(Date.now() - 61_000) });
    await s.service.resend('ALICE@example.com');
    const data = s.otp.updateMany.mock.calls[0]?.[0]?.data;
    expect(data.otpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.attempts).toBe(0);
    expect(data.usedAt).toBeNull();
    expect(data.expiresAt.getTime() - data.createdAt.getTime()).toBe(600_000);
    expect(s.mail.sendRegistrationCode).toHaveBeenCalledOnce();
  });

  it('does not disclose unknown or already-verified accounts via resend', async () => {
    const s = setup();
    s.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...account, emailVerifiedAt: new Date() });
    const a = await s.service.resend('nobody@example.com');
    const b = await s.service.resend('alice@example.com');
    expect(a).toEqual(b);
    expect(s.mail.sendRegistrationCode).not.toHaveBeenCalled();
  });

  it('deletes the unusable challenge if delivery fails and offers retry', async () => {
    const s = setup();
    s.mail.sendRegistrationCode.mockRejectedValue(new Error('delivery failed'));
    await expect(s.service.sendInitialCode(account.id, account.email)).rejects.toThrow(ServiceUnavailableException);
    expect(s.otp.deleteMany).toHaveBeenCalledOnce();
  });

  it('rejects unknown accounts and malformed codes', async () => {
    const s = setup();
    await expect(s.service.verify('alice@example.com', '123')).rejects.toThrow(BadRequestException);
    s.user.findUnique.mockResolvedValue(null);
    await expect(s.service.verify('alice@example.com', '123456')).rejects.toThrow(BadRequestException);
  });

  it('rejects a code that has expired even if it was never used', async () => {
    const s = setup();
    s.otp.findUnique.mockResolvedValue({ otpHash: '0'.repeat(64), expiresAt: new Date(Date.now() - 1), attempts: 0, usedAt: null });
    await expect(s.service.verify(account.email, '123456')).rejects.toThrow(BadRequestException);
    expect(s.db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects used codes and codes with five failed attempts', async () => {
    const s = setup();
    s.otp.findUnique.mockResolvedValueOnce({ otpHash: '0'.repeat(64), expiresAt: new Date(Date.now() + 60_000), attempts: 0, usedAt: new Date() });
    await expect(s.service.verify(account.email, '123456')).rejects.toThrow(BadRequestException);
    s.otp.findUnique.mockResolvedValueOnce({ otpHash: '0'.repeat(64), expiresAt: new Date(Date.now() + 60_000), attempts: 5, usedAt: null });
    await expect(s.service.verify(account.email, '123456')).rejects.toThrow(BadRequestException);
  });

  it('counts incorrect attempts without activating an account', async () => {
    const s = setup();
    s.otp.findUnique.mockResolvedValue({ otpHash: '0'.repeat(64), expiresAt: new Date(Date.now() + 60_000), attempts: 0, usedAt: null });
    await expect(s.service.verify(account.email, '111111')).rejects.toThrow(BadRequestException);
    expect(s.otp.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { attempts: { increment: 1 } } }));
    expect(s.user.updateMany).not.toHaveBeenCalled();
  });

  it('verifies the correct code once and atomically activates the account', async () => {
    const s = setup();
    await s.service.sendInitialCode(account.id, account.email);
    const { code, otpHash } = issuedChallenge(s);
    s.otp.findUnique.mockResolvedValue({ otpHash, expiresAt: new Date(Date.now() + 60_000), attempts: 0, usedAt: null });
    await expect(s.service.verify('ALICE@example.com', code)).resolves.toEqual({ message: 'Your email is verified. You can now sign in.' });
    expect(s.db.$transaction).toHaveBeenCalledOnce();
    expect(s.otp.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ otpHash, usedAt: null }) }));
    expect(s.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: account.id, emailVerifiedAt: null } }));
  });

  it('refuses to activate if another request has consumed the code first', async () => {
    const s = setup();
    await s.service.sendInitialCode(account.id, account.email);
    const { code, otpHash } = issuedChallenge(s);
    s.otp.findUnique.mockResolvedValue({ otpHash, expiresAt: new Date(Date.now() + 60_000), attempts: 0, usedAt: null });
    s.otp.updateMany.mockResolvedValue({ count: 0 });
    await expect(s.service.verify(account.email, code)).rejects.toThrow(BadRequestException);
    expect(s.user.updateMany).not.toHaveBeenCalled();
  });

  it('rejects the previous code after a successful resend', async () => {
    const s = setup();
    await s.service.sendInitialCode(account.id, account.email);
    const oldCode = issuedChallenge(s).code;
    const oldHash = issuedChallenge(s).otpHash;
    s.otp.findUnique.mockResolvedValueOnce({ createdAt: new Date(Date.now() - 61_000), otpHash: oldHash });
    await s.service.resend(account.email);
    const newHash = s.otp.updateMany.mock.calls[0]?.[0]?.data.otpHash;
    // The challenge returned by the database is now the replaced record.
    s.otp.findUnique.mockResolvedValue({ otpHash: newHash, expiresAt: new Date(Date.now() + 60_000), attempts: 0, usedAt: null });
    expect(newHash).not.toBe(oldHash);
    await expect(s.service.verify(account.email, oldCode)).rejects.toThrow(BadRequestException);
    expect(s.user.updateMany).not.toHaveBeenCalled();
  });
});
