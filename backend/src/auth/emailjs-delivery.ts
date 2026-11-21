import { ConfigService } from '@nestjs/config';

type EmailTemplateKind = 'otp' | 'reset';

type EmailTemplateParams = {
  email: string;
  passcode?: string;
  reset_link?: string;
};

/** Keep local development on SMTP unless explicitly enabled in Render. */
export function useEmailJs(config: ConfigService): boolean {
  return config.get<string>('EMAIL_DELIVERY')?.trim().toLowerCase() === 'emailjs';
}

export function isEmailJsConfigured(
  config: ConfigService,
  kind: EmailTemplateKind,
): boolean {
  const templateKey = kind === 'otp'
    ? 'EMAILJS_OTP_TEMPLATE_ID'
    : 'EMAILJS_RESET_TEMPLATE_ID';
  return Boolean(
    config.get<string>('EMAILJS_PUBLIC_KEY')?.trim() &&
    config.get<string>('EMAILJS_PRIVATE_KEY')?.trim() &&
    config.get<string>(templateKey)?.trim(),
  );
}

/** Send from NestJS only, never from the browser. Keep the private key secret. */
export async function sendEmailJs(
  config: ConfigService,
  kind: EmailTemplateKind,
  params: EmailTemplateParams,
): Promise<void> {
  if (!isEmailJsConfigured(config, kind)) {
    throw new Error('EmailJS delivery is not configured.');
  }

  const templateKey = kind === 'otp'
    ? 'EMAILJS_OTP_TEMPLATE_ID'
    : 'EMAILJS_RESET_TEMPLATE_ID';

  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: 'primary_service',
      template_id: config.getOrThrow<string>(templateKey).trim(),
      user_id: config.getOrThrow<string>('EMAILJS_PUBLIC_KEY').trim(),
      accessToken: config.getOrThrow<string>('EMAILJS_PRIVATE_KEY').trim(),
      template_params: params,
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    // Do not log a request body: it contains OTPs or password-reset links.
    throw new Error(`Email delivery failed (HTTP ${response.status}).`);
  }
}
