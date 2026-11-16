import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegistrationOtpMailService } from './registration-otp-mail.service.js';

const OTP_LIFETIME_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const INVALID_CODE = 'This code is incorrect or has expired. Please request a new one.';
const RESEND_MESSAGE = 'If this email is awaiting verification, a code will be sent when eligible.';

@Injectable()
export class RegistrationOtpService {
  private readonly logger = new Logger(RegistrationOtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: RegistrationOtpMailService,
    private readonly config: ConfigService,
  ) {}

  /** YOPmail is allowed for local testing, never for new production accounts. */
  validateRegistrationEmail(emailAddress: string): void {
    const email = emailAddress.trim().toLowerCase();
    const domain = email.split('@').at(-1) ?? '';
    if (this.config.get<string>('NODE_ENV') === 'production' &&
        (domain === 'yopmail.com' || domain.endsWith('.yopmail.com'))) {
      throw new BadRequestException('Please use a private email address to register.');
    }
  }

  ensureMailAvailable(): void {
    if (!this.mail.isConfigured()) {
      throw new ServiceUnavailableException('Email verification is temporarily unavailable. Please try again later.');
    }
  }

  private codeHash(userId: string, code: string): string {
    const secret = Buffer.from(this.config.getOrThrow<string>('JWT_SECRET'), 'base64');
    return createHmac('sha256', secret)
      .update(`taskflow:registration-otp:v1\0${userId}\0${code}`, 'utf8')
      .digest('hex');
  }

  private sameHash(actual: string, expected: string): boolean {
    return /^[a-f0-9]{64}$/i.test(actual) &&
      timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  }

  private logMailFailure(error: unknown): void {
    const err = error as { code?: string; responseCode?: number; command?: string };
    // Never log recipient addresses, codes, hashes or secrets.
    this.logger.warn(`Registration email delivery failed | Code: ${err?.code ?? 'Unknown'} | ` +
      `Status: ${err?.responseCode ?? 'None'} | Command: ${err?.command ?? 'Unknown'}`);
  }

  /** Called immediately after /auth/register creates a pending account. */
  async sendInitialCode(userId: string, email: string): Promise<void> {
    this.ensureMailAvailable();
    await this.issueCode(userId, email);
  }

  /** Public endpoint. Unknown and already-verified emails receive the same response. */
  async resend(emailAddress: string): Promise<{ message: string }> {
    this.ensureMailAvailable();
    const email = emailAddress.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (user && !user.emailVerifiedAt) await this.issueCode(user.id, user.email);
    return { message: RESEND_MESSAGE };
  }

  private async issueCode(userId: string, email: string): Promise<void> {
    const now = new Date();
    const cooldownBoundary = new Date(now.getTime() - RESEND_COOLDOWN_MS);
    const current = await this.prisma.registrationOtp.findUnique({
      where: { userId }, select: { createdAt: true, otpHash: true },
    });
    if (current && current.createdAt >= cooldownBoundary) return;

    let code: string;
    let otpHash: string;
    // Avoid the rare (one-in-a-million) case of a resend producing the same code.
    do {
      code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      otpHash = this.codeHash(userId, code);
    } while (current && otpHash === current.otpHash);
    const data = {
      otpHash,
      expiresAt: new Date(now.getTime() + OTP_LIFETIME_MS),
      attempts: 0,
      usedAt: null,
      createdAt: now,
    };

    if (current) {
      // Only replace an older challenge. Concurrent resend attempts cannot
      // issue multiple codes within one cooldown window.
      const updated = await this.prisma.registrationOtp.updateMany({
        where: { userId, createdAt: { lt: cooldownBoundary } },
        data,
      });
      if (updated.count !== 1) return;
    } else {
      try {
        await this.prisma.registrationOtp.create({ data: { ...data, userId } });
      } catch (error: unknown) {
        if ((error as { code?: string })?.code === 'P2002') return;
        throw error;
      }
    }

    try {
      await this.mail.sendRegistrationCode(email, code);
    } catch (error: unknown) {
      // A failed email must not leave a code that the user cannot receive.
      await this.prisma.registrationOtp.deleteMany({
        where: { userId, otpHash, usedAt: null },
      }).catch(() => undefined);
      this.logMailFailure(error);
      throw new ServiceUnavailableException(
        'We could not send your verification code. Your account is saved; please try Resend code.',
      );
    }
  }

  /** Verify registration ownership; activation and OTP consumption are atomic. */
  async verify(emailAddress: string, code: string): Promise<{ message: string }> {
    if (!/^[0-9]{6}$/.test(code)) throw new BadRequestException(INVALID_CODE);
    const email = emailAddress.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true },
    });
    if (!user || user.emailVerifiedAt) throw new BadRequestException(INVALID_CODE);

    const challenge = await this.prisma.registrationOtp.findUnique({
      where: { userId: user.id },
      select: { otpHash: true, expiresAt: true, attempts: true, usedAt: true },
    });
    if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date() ||
        challenge.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException(INVALID_CODE);
    }

    const expectedHash = this.codeHash(user.id, code);
    if (!this.sameHash(challenge.otpHash, expectedHash)) {
      await this.prisma.registrationOtp.updateMany({
        where: {
          userId: user.id,
          otpHash: challenge.otpHash,
          usedAt: null,
          expiresAt: { gt: new Date() },
          attempts: { lt: MAX_ATTEMPTS },
        },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(INVALID_CODE);
    }

    await this.prisma.$transaction(async (tx) => {
      const verifiedAt = new Date();
      const consumed = await tx.registrationOtp.updateMany({
        where: {
          userId: user.id, otpHash: expectedHash, usedAt: null,
          expiresAt: { gt: verifiedAt }, attempts: { lt: MAX_ATTEMPTS },
        },
        data: { usedAt: verifiedAt },
      });
      if (consumed.count !== 1) throw new BadRequestException(INVALID_CODE);
      const activated = await tx.user.updateMany({
        where: { id: user.id, emailVerifiedAt: null },
        data: { emailVerifiedAt: verifiedAt },
      });
      if (activated.count !== 1) throw new BadRequestException(INVALID_CODE);
    });

    return { message: 'Your email is verified. You can now sign in.' };
  }
}
