import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { isEmailJsConfigured, sendEmailJs, useEmailJs } from './emailjs-delivery.js';

/** Send password recovery codes and links, using EmailJS on Render or SMTP locally. */
@Injectable()
export class PasswordResetMailService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const frontendUrl = this.config.get<string>('FRONTEND_URL')?.trim();
    if (!frontendUrl) return false;
    try {
      const parsed = new URL(frontendUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    } catch {
      return false;
    }

    if (useEmailJs(this.config)) {
      return isEmailJsConfigured(this.config, 'otp') &&
        isEmailJsConfigured(this.config, 'reset');
    }

    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const from = this.config.get<string>('SMTP_FROM')?.trim();
    const port = Number(this.config.get<string>('SMTP_PORT') ?? '587');
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const password = this.config.get<string>('SMTP_PASSWORD');
    if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
      return false;
    }
    return Boolean(user) === Boolean(password);
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    if (!this.isConfigured()) throw new Error('Password recovery email is not configured.');
    if (useEmailJs(this.config)) {
      await sendEmailJs(this.config, 'otp', { email: to, passcode: code });
      return;
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
    if (!this.isConfigured()) throw new Error('Password recovery email is not configured.');

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL').trim().replace(/\/+$/, '');
    // Keep the token in the URL fragment, not in the query string.
    const link = `${frontendUrl}/reset-password#token=${encodeURIComponent(rawToken)}`;

    if (useEmailJs(this.config)) {
      await sendEmailJs(this.config, 'reset', { email: to, reset_link: link });
      return;
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
