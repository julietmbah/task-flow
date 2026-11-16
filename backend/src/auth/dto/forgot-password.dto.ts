import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Request body for POST /auth/forgot-password. */
export class ForgotPasswordDto {
  @IsString({ message: 'Please enter your email address.' })
  @IsNotEmpty({ message: 'Please enter your email address.' })
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @MaxLength(254, { message: 'Please enter a valid email address.' })
  email!: string;
}
