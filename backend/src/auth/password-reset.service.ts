import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcryptjs';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service.js';
import { PasswordResetMailService } from './password-reset-mail.service.js';

const RESET_EXPIRY_MS = 15 * 60 * 1000;
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const EMAIL_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const GENERIC_RESPONSE = {
  message: 'If an account exists for that email, a verification code will be sent.',
};
const INVALID_OTP_MESSAGE =
  'This code is incorrect or has expired. Please request a new one.';
const INVALID_LINK_MESSAGE =
  'This reset link is invalid or has expired. Please request a new one.';

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: PasswordResetMailService,
    private readonly config: ConfigService,
  ) {}

  /** The server's existing JWT secret also keys this separate, domain-bound HMAC. */
  private hashOtp(userId: string, code: string): string {
    const secret = Buffer.from(this.config.getOrThrow<string>('JWT_SECRET'), 'base64');
    return createHmac('sha256', secret)
      .update(`taskflow:password-reset-otp:v1\0${userId}\0${code}`, 'utf8')
      .digest('hex');
  }

  private matchesOtp(storedHash: string, expectedHash: string): boolean {
    if (!/^[a-f0-9]{64}$/i.test(storedHash)) return false;
    return timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(expectedHash, 'hex'));
  }

  private warnAboutEmail(error: unknown): void {
    const smtpError = error as {
      code?: string;
      responseCode?: number;
      command?: string;
    };
    // Never log addresses, verification codes, password-reset tokens or SMTP secrets.
    this.logger.warn(
      `SMTP email failed | Code: ${smtpError?.code ?? 'Unknown'} | ` +
      `Status: ${smtpError?.responseCode ?? 'None'} | ` +
      `Command: ${smtpError?.command ?? 'Unknown'}`,
    );
  }

  /** POST /auth/forgot-password or /auth/resend-password-otp. */
  async requestReset(emailAddress: string): Promise<{ message: string }> {
    // Consistent response, regardless of whether an account exists.
    if (!this.mail.isConfigured()) {
      throw new ServiceUnavailableException(
        'Password recovery is temporarily unavailable. Please try again later.',
      );
    }

    const email = emailAddress.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    if (!user) return { ...GENERIC_RESPONSE };

    const now = new Date();
    const cooldownBoundary = new Date(now.getTime() - EMAIL_COOLDOWN_MS);
    const current = await this.prisma.passwordResetOtp.findUnique({
      where: { userId: user.id },
      select: { createdAt: true },
    });
    if (current && current.createdAt >= cooldownBoundary) {
      return { ...GENERIC_RESPONSE };
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const otpHash = this.hashOtp(user.id, code);
    const data = {
      otpHash,
      expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
      attempts: 0,
      usedAt: null,
      createdAt: now,
    };

    // A conditional update/unique insert prevents parallel requests bypassing
    // the per-account resend cooldown. Each new code replaces the previous one.
    if (current) {
      const updated = await this.prisma.passwordResetOtp.updateMany({
        where: { userId: user.id, createdAt: { lt: cooldownBoundary } },
        data,
      });
      if (updated.count !== 1) return { ...GENERIC_RESPONSE };
    } else {
      try {
        await this.prisma.passwordResetOtp.create({
          data: { ...data, userId: user.id },
        });
      } catch (error: unknown) {
        // A concurrent request may have created this user's challenge already.
        if ((error as { code?: string })?.code === 'P2002') {
          return { ...GENERIC_RESPONSE };
        }
        throw error;
      }
    }

    try {
      await this.mail.sendVerificationCode(user.email, code);
    } catch (error: unknown) {
      // Do not leave an unusable code in the database after SMTP failure.
      await this.prisma.passwordResetOtp.deleteMany({
        where: { userId: user.id, otpHash, usedAt: null },
      }).catch(() => undefined);
      this.warnAboutEmail(error);
      return { ...GENERIC_RESPONSE };
    }

    // Revoke any outstanding links from the older recovery process.
    // Ordinary requests now create links ONLY after code verification.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    return { ...GENERIC_RESPONSE };
  }

  /** POST /auth/verify-password-otp: email a reset link once the OTP is verified. */
  async verifyOtp(emailAddress: string, code: string): Promise<{ message: string }> {
    if (!/^[0-9]{6}$/.test(code)) {
      throw new BadRequestException(INVALID_OTP_MESSAGE);
    }
    if (!this.mail.isConfigured()) {
      throw new ServiceUnavailableException(
        'Password recovery is temporarily unavailable. Please try again later.',
      );
    }

    const email = emailAddress.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    if (!user) throw new BadRequestException(INVALID_OTP_MESSAGE);

    const challenge = await this.prisma.passwordResetOtp.findUnique({
      where: { userId: user.id },
      select: { otpHash: true, expiresAt: true, attempts: true, usedAt: true },
    });
    const now = new Date();
    if (!challenge || challenge.usedAt || challenge.expiresAt <= now ||
        challenge.attempts >= MAX_OTP_ATTEMPTS) {
      throw new BadRequestException(INVALID_OTP_MESSAGE);
    }

    const expectedHash = this.hashOtp(user.id, code);
    if (!this.matchesOtp(challenge.otpHash, expectedHash)) {
      await this.prisma.passwordResetOtp.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
          expiresAt: { gt: now },
          attempts: { lt: MAX_OTP_ATTEMPTS },
        },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(INVALID_OTP_MESSAGE);
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    // Consume the OTP and create its reset link atomically. A second request
    // cannot redeem the same OTP even if both requests started together.
    const created = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetOtp.updateMany({
        where: {
          userId: user.id,
          otpHash: expectedHash,
          usedAt: null,
          expiresAt: { gt: now },
          attempts: { lt: MAX_OTP_ATTEMPTS },
        },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException(INVALID_OTP_MESSAGE);
      }

      return tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + RESET_EXPIRY_MS),
        },
        select: { id: true },
      });
    });

    try {
      await this.mail.sendResetLink(user.email, rawToken);
    } catch (error: unknown) {
      // Do not keep a link that was never successfully handed to SMTP.
      await this.prisma.passwordResetToken.delete({
        where: { id: created.id },
      }).catch(() => undefined);
      // Allow the user to retry the verified code if SMTP delivery failed.
      await this.prisma.passwordResetOtp.updateMany({
        where: { userId: user.id, otpHash: expectedHash, usedAt: now },
        data: { usedAt: null },
      }).catch(() => undefined);
      this.warnAboutEmail(error);
      throw new ServiceUnavailableException(
        'We could not email your reset link. Please try again.',
      );
    }

    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, id: { not: created.id }, usedAt: null },
    }).catch(() => this.logger.warn('Unable to prune older password reset links.'));

    return { message: 'Your code is verified. Check your email for your password reset link.' };
  }

  /** POST /auth/reset-password: redeem an expiring single-use token. */
  async resetPassword(rawToken: string, newPassword: string): Promise<{ message: string }> {
    // bcrypt silently truncates inputs over 72 bytes: reject them explicitly.
    if (Buffer.byteLength(newPassword, 'utf8') > 72) {
      throw new BadRequestException(
        'Your new password is too long. Please choose a shorter one.',
      );
    }
    if (newPassword.length < 8) {
      throw new BadRequestException('Your new password must be at least 8 characters long.');
    }
    // Match the live checklist on the Create New Password page.
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) ||
        !/[0-9]/.test(newPassword) || !/[\p{P}\p{S}]/u.test(newPassword)) {
      throw new BadRequestException(
        'Use an uppercase letter, a lowercase letter, a number, and a symbol such as _.',
      );
    }
    if (!/^[a-f0-9]{64}$/i.test(rawToken)) {
      throw new BadRequestException(INVALID_LINK_MESSAGE);
    }

    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        userId: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { passwordHash: true } },
      },
    });

    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new BadRequestException(INVALID_LINK_MESSAGE);
    }

    if (await compare(newPassword, record.user.passwordHash)) {
      throw new BadRequestException(
        'Choose a new password that is different from your previous one.',
      );
    }

    const passwordHash = await hash(newPassword, 12);
    const now = new Date();

    // Both steps are atomic. Concurrent uses of the same token (or older
    // concurrent password changes) cannot overwrite the newly saved password.
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException(INVALID_LINK_MESSAGE);
      }

      const changed = await tx.user.updateMany({
        where: { id: record.userId, passwordHash: record.user.passwordHash },
        data: { passwordHash },
      });
      if (changed.count !== 1) {
        throw new BadRequestException(INVALID_LINK_MESSAGE);
      }

      // Redeeming one link revokes any other unused links for this account.
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: now },
      });
    });

    return { message: 'Your password has been reset. You can now sign in.' };
  }
}
