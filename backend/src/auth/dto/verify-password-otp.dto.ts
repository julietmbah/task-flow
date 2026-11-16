import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/** Request body for POST /auth/verify-password-otp. */
export class VerifyPasswordOtpDto {
  @IsString({ message: 'Please enter your email address.' })
  @IsNotEmpty({ message: 'Please enter your email address.' })
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @MaxLength(254, { message: 'Please enter a valid email address.' })
  email!: string;

  @IsString({ message: 'Please enter your six-digit code.' })
  @Matches(/^[0-9]{6}$/, { message: 'Enter the six-digit code from your email.' })
  otp!: string;
}
