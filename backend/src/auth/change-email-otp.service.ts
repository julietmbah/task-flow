import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChangeEmailOtpMailService } from './change-email-otp-mail.service.js';

const OTP_LIFETIME_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const INVALID_OTP = 'This code is incorrect or has expired. Please request a new one.';
const WAIT_TO_RESEND = 'Please wait 60 seconds before requesting another code.';

/** Email is updated only after successful, single-use verification of the new address. */
@Injectable()
export class ChangeEmailOtpService {
  private readonly logger = new Logger(ChangeEmailOtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: ChangeEmailOtpMailService,
    private readonly config: ConfigService,
  ) {}

  private requireMail(): void {
    if (!this.mail.isConfigured()) {
      throw new ServiceUnavailableException(
        'Email verification is temporarily unavailable. Please try again later.',
      );
    }
  }

  private hashCode(userId: string, newEmail: string, code: string): string {
    const secret = Buffer.from(this.config.getOrThrow<string>('JWT_SECRET'), 'base64');
    return createHmac('sha256', secret)
      .update(`taskflow:change-email-otp:v1\0${userId}\0${newEmail}\0${code}`, 'utf8')
      .digest('hex');
  }

  private hashesMatch(stored: string, expected: string): boolean {
    return /^[a-f0-9]{64}$/i.test(stored) &&
      timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(expected, 'hex'));
  }

  private normalizeEmail(value: string): string {
    const email = value.trim().toLowerCase();
    // DTO validation also applies at the HTTP boundary; validate again here
    // so this service cannot accidentally accept an invalid address elsewhere.
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Please enter a valid email address.');
    }
    const domain = email.split('@').at(-1) ?? '';
    if (this.config.get<string>('NODE_ENV') === 'production' &&
        (domain === 'yopmail.com' || domain.endsWith('.yopmail.com'))) {
      throw new BadRequestException('Please use a private email address.');
    }
    return email;
  }

  private logMailFailure(error: unknown): void {
    const err = error as { code?: string; responseCode?: number; command?: string };
    // Never log addresses, OTPs, hashes, or credentials.
    this.logger.warn(`Change email delivery failed | Code: ${err?.code ?? 'Unknown'} | ` +
      `Status: ${err?.responseCode ?? 'None'} | Command: ${err?.command ?? 'Unknown'}`);
  }

  /** Start a new challenge for the signed-in user. The old email stays valid. */
  async request(userId: string, proposedEmail: string): Promise<{ message: string; newEmail: string }> {
    this.requireMail();
    const newEmail = this.normalizeEmail(proposedEmail);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (!user || !user.emailVerifiedAt) throw new UnauthorizedException('Please sign in again.');
    if (newEmail === user.email) {
      throw new BadRequestException('This is already your current email address.');
    }
    const owner = await this.prisma.user.findUnique({
      where: { email: newEmail }, select: { id: true },
    });
    if (owner) throw new ConflictException('This email address is already in use.');
    await this.issueCode(userId, newEmail);
    return { message: 'We sent a six-digit code to your new email address.', newEmail };
  }

  /** Resend only to the address already pending for this signed-in user. */
  async resend(userId: string): Promise<{ message: string; newEmail: string }> {
    this.requireMail();
    const existing = await this.prisma.changeEmailOtp.findUnique({
      where: { userId },
      select: { newEmail: true, usedAt: true },
    });
    if (!existing || existing.usedAt) {
      throw new BadRequestException('Start a new email change request first.');
    }
    await this.issueCode(userId, existing.newEmail);
    return {
      message: 'We sent a new code to your pending email address.',
      newEmail: existing.newEmail,
    };
  }

  private async issueCode(userId: string, newEmail: string): Promise<void> {
    const now = new Date();
    const cooldownBoundary = new Date(now.getTime() - RESEND_COOLDOWN_MS);
    const current = await this.prisma.changeEmailOtp.findUnique({
      where: { userId },
      select: { createdAt: true, otpHash: true, newEmail: true },
    });
    if (current && current.createdAt >= cooldownBoundary) {
      throw new BadRequestException(WAIT_TO_RESEND);
    }

    let code: string;
    let otpHash: string;
    // Never deliberately reissue the previous code, even when resending.
    do {
      code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      otpHash = this.hashCode(userId, newEmail, code);
    } while (current && otpHash === current.otpHash);

    const data = {
      newEmail,
      otpHash,
      createdAt: now,
      expiresAt: new Date(now.getTime() + OTP_LIFETIME_MS),
      attempts: 0,
      usedAt: null,
    };

    if (current) {
      // Conditional update protects against parallel resends or new requests.
      const updated = await this.prisma.changeEmailOtp.updateMany({
        where: { userId, createdAt: { lt: cooldownBoundary } },
        data,
      });
      if (updated.count !== 1) throw new BadRequestException(WAIT_TO_RESEND);
    } else {
      try {
        await this.prisma.changeEmailOtp.create({ data: { ...data, userId } });
      } catch (error: unknown) {
        if ((error as { code?: string })?.code === 'P2002') {
          throw new BadRequestException(WAIT_TO_RESEND);
        }
        throw error;
      }
    }

    try {
      await this.mail.sendCode(newEmail, code);
    } catch (error: unknown) {
      // Do not leave a challenge for a code that could not be delivered.
      await this.prisma.changeEmailOtp.deleteMany({
        where: { userId, newEmail, otpHash, usedAt: null },
      }).catch(() => undefined);
      this.logMailFailure(error);
      throw new ServiceUnavailableException(
        'We could not send the code. Your current email has not changed. Please try again.',
      );
    }
  }

  /** Consume the challenge and change User.email in the same transaction. */
  async verify(userId: string, code: string): Promise<{ message: string; email: string }> {
    if (!/^[0-9]{6}$/.test(code)) throw new BadRequestException(INVALID_OTP);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (!user || !user.emailVerifiedAt) throw new UnauthorizedException('Please sign in again.');

    const challenge = await this.prisma.changeEmailOtp.findUnique({
      where: { userId },
      select: { newEmail: true, otpHash: true, expiresAt: true, attempts: true, usedAt: true },
    });
    if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date() ||
        challenge.attempts >= MAX_ATTEMPTS || challenge.newEmail === user.email) {
      throw new BadRequestException(INVALID_OTP);
    }

    const expectedHash = this.hashCode(userId, challenge.newEmail, code);
    if (!this.hashesMatch(challenge.otpHash, expectedHash)) {
      await this.prisma.changeEmailOtp.updateMany({
        where: {
          userId, newEmail: challenge.newEmail, otpHash: challenge.otpHash,
          usedAt: null, expiresAt: { gt: new Date() },
          attempts: { lt: MAX_ATTEMPTS },
        },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(INVALID_OTP);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const consumed = await tx.changeEmailOtp.updateMany({
          where: {
            userId,
            newEmail: challenge.newEmail,
            otpHash: expectedHash,
            usedAt: null,
            expiresAt: { gt: now },
            attempts: { lt: MAX_ATTEMPTS },
          },
          data: { usedAt: now },
        });
        if (consumed.count !== 1) throw new BadRequestException(INVALID_OTP);

        // Conditional update avoids changing an account that was modified elsewhere.
        // The unique email constraint handles a different user claiming the address.
        const updated = await tx.user.updateMany({
          where: { id: userId, email: user.email },
          data: { email: challenge.newEmail, emailVerifiedAt: now },
        });
        if (updated.count !== 1) {
          throw new ConflictException('Your account changed. Please start again.');
        }
      });
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2002') {
        throw new ConflictException('This email address is already in use.');
      }
      throw error;
    }

    return {
      message: 'Your email address has been updated successfully.',
      email: challenge.newEmail,
    };
  }
}
