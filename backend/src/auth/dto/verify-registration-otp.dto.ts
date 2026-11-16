import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/** Request body for POST /auth/verify-registration-otp. */
export class VerifyRegistrationOtpDto {
  @IsString()
  @IsNotEmpty()
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'Enter the six-digit code from your email.' })
  otp!: string;
}
