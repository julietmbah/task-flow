import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

/**
 * Sends account-recovery links through an SMTP provider.
 * Keep SMTP credentials in backend/.env (never in Git).
 */
@Injectable()
export class PasswordResetMailService {
  constructor(private readonly config: ConfigService) {}

  /** Allows the API to reject every request consistently if mail is unconfigured. */
  isConfigured(): boolean {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const from = this.config.get<string>('SMTP_FROM')?.trim();
    const frontendUrl = this.config.get<string>('FRONTEND_URL')?.trim();
    const port = Number(this.config.get<string>('SMTP_PORT') ?? '587');
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const password = this.config.get<string>('SMTP_PASSWORD');

    if (!host || !from || !frontendUrl || !Number.isInteger(port) || port < 1 || port > 65535) {
      return false;
    }
    if (Boolean(user) !== Boolean(password)) return false;

    try {
      const parsed = new URL(frontendUrl);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }

  /** Email a six-digit verification code, not the reset link. */
  async sendVerificationCode(to: string, code: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Password recovery email is not configured.');
    }

    const host = this.config.getOrThrow<string>('SMTP_HOST').trim();
    const port = Number(this.config.get<string>('SMTP_PORT') ?? '587');
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const password = this.config.get<string>('SMTP_PASSWORD');
    const from = this.config.getOrThrow<string>('SMTP_FROM').trim();

    const smtp = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port !== 465 &&
        this.config.get<string>('SMTP_REQUIRE_TLS') !== 'false',
      auth: user && password ? { user, pass: password } : undefined,
    });

    await smtp.sendMail({
      from,
      to,
      subject: 'Your TaskFlow password recovery code',
      text: [
        'Someone requested help resetting the password for this TaskFlow account.',
        '',
        `Your six-digit verification code is: ${code}`,
        '',
        'Enter this code on the TaskFlow verification page to receive a password reset link.',
        'This code expires in 10 minutes and can only be used once.',
        'If you did not request a password reset, ignore this email.',
      ].join('\n'),
    });
  }

  async sendResetLink(to: string, rawToken: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Password recovery email is not configured.');
    }

    const host = this.config.getOrThrow<string>('SMTP_HOST').trim();
    const port = Number(this.config.get<string>('SMTP_PORT') ?? '587');
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const password = this.config.get<string>('SMTP_PASSWORD');
    const from = this.config.getOrThrow<string>('SMTP_FROM').trim();
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL').trim().replace(/\/+$/, '');

    // The token lives in the fragment, not the URL query string.
    // Fragments are not sent to the web server in HTTP requests.
    const link = `${frontendUrl}/reset-password#token=${encodeURIComponent(rawToken)}`;

    const smtp = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      // Keep TLS mandatory for remote SMTP. Set SMTP_REQUIRE_TLS=false
      // only for a trusted LOCAL development mail catcher (e.g., Mailpit).
      requireTLS: port !== 465 &&
        this.config.get<string>('SMTP_REQUIRE_TLS') !== 'false',
      auth: user && password ? { user, pass: password } : undefined,
    });

    await smtp.sendMail({
      from,
      to,
      subject: 'Reset your TaskFlow password',
      text: [
        'We received a request to reset your TaskFlow password.',
        '',
        `Open this link to choose a new password: ${link}`,
        '',
        'This link expires in 15 minutes and works only once.',
        'If you did not request a password reset, ignore this email.',
      ].join('\n'),
    });
  }
}
