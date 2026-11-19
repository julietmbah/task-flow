import { IsString, Matches } from 'class-validator';

/** Body for POST /auth/me/email/verify. The signed-in user identifies the challenge. */
export class VerifyChangeEmailOtpDto {
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'Enter the six-digit code from your new email.' })
  otp!: string;
}
