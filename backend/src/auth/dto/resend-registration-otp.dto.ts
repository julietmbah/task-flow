import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Request body for POST /auth/resend-registration-otp. */
export class ResendRegistrationOtpDto {
  @IsString()
  @IsNotEmpty()
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @MaxLength(254)
  email!: string;
}
