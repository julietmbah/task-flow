import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { isEmailJsConfigured, sendEmailJs, useEmailJs } from './emailjs-delivery.js';

/** Registration-only email delivery. Uses EmailJS on Render, SMTP locally. */
@Injectable()
export class RegistrationOtpMailService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    if (useEmailJs(this.config)) {
      return isEmailJsConfigured(this.config, 'otp');
    }
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const from = this.config.get<string>('SMTP_FROM')?.trim();
    const port = Number(this.config.get<string>('SMTP_PORT') ?? '587');
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const password = this.config.get<string>('SMTP_PASSWORD');
    return Boolean(host && from && Number.isInteger(port) && port >= 1 && port <= 65535 &&
      Boolean(user) === Boolean(password));
  }

  async sendRegistrationCode(to: string, code: string): Promise<void> {
    if (!this.isConfigured()) throw new Error('Email delivery is not configured.');
    if (useEmailJs(this.config)) {
      await sendEmailJs(this.config, 'otp', { email: to, passcode: code });
      return;
    }
    const port = Number(this.config.get<string>('SMTP_PORT') ?? '587');
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const password = this.config.get<string>('SMTP_PASSWORD');
    const smtp = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST').trim(),
      port,
      secure: port === 465,
      requireTLS: port !== 465 && this.config.get<string>('SMTP_REQUIRE_TLS') !== 'false',
      auth: user && password ? { user, pass: password } : undefined,
    });
    await smtp.sendMail({
      from: this.config.getOrThrow<string>('SMTP_FROM').trim(),
      to,
      subject: 'Verify your TaskFlow email address',
      text: [
        'Welcome to TaskFlow!',
        '',
        `Your six-digit email verification code is: ${code}`,
        '',
        'Enter this code on the TaskFlow registration verification page.',
        'The code expires in 10 minutes and can be used only once.',
        'If you did not create an account, you can ignore this message.',
      ].join('\n'),
    });
  }
}
