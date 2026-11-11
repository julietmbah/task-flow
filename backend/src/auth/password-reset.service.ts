import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service.js';
import { PasswordResetMailService } from './password-reset-mail.service.js';

const RESET_EXPIRY_MS = 15 * 60 * 1000;
const EMAIL_COOLDOWN_MS = 60 * 1000;
const GENERIC_RESPONSE = {
  message: 'If an account exists for that email, a password reset link will be sent.',
};
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
  ) {}

  /** POST /auth/forgot-password: do not disclose whether an account exists. */
  async requestReset(emailAddress: string): Promise<{ message: string }> {
    // If SMTP is missing, every address receives the same response and status.
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

    // A small per-account cooldown limits accidental repeated emails.
    // Production should ALSO rate-limit this public endpoint by IP at the gateway.
    const recent = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(Date.now() - EMAIL_COOLDOWN_MS) },
      },
      select: { id: true },
    });
    if (recent) return { ...GENERIC_RESPONSE };

    const rawToken = randomBytes(32).toString('hex');
    const record = await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_EXPIRY_MS),
      },
      select: { id: true },
    });

    try {
      await this.mail.sendResetLink(user.email, rawToken);
    } catch (error: unknown) {
      await this.prisma.passwordResetToken.delete({
        where: { id: record.id },
      }).catch(() => undefined);

      // Only log safe SMTP diagnostic fields (never credentials or reset tokens).
      const smtpError = error as {
        code?: string;
        responseCode?: number;
        command?: string;
      };
      this.logger.warn(
        `SMTP email failed | ` +
        `Code: ${smtpError.code ?? 'Unknown'} | ` +
        `Status: ${smtpError.responseCode ?? 'None'} | ` +
        `Command: ${smtpError.command ?? 'Unknown'}`,
      );
      return { ...GENERIC_RESPONSE };
    }

    // Invalidate earlier pending links after the newest email is sent.
    // Failure to prune must not invalidate the email we just delivered.
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, id: { not: record.id }, usedAt: null },
    }).catch(() => this.logger.warn('Unable to prune older password reset links.'));

    return { ...GENERIC_RESPONSE };
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
