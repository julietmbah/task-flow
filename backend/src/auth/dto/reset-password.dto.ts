import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

/** Request body for POST /auth/reset-password. */
export class ResetPasswordDto {
  @IsString({ message: 'This reset link is invalid. Please request a new one.' })
  @IsNotEmpty({ message: 'This reset link is invalid. Please request a new one.' })
  @Matches(/^[a-f0-9]{64}$/i, {
    message: 'This reset link is invalid. Please request a new one.',
  })
  token!: string;

  @IsString({ message: 'Please enter a new password.' })
  @IsNotEmpty({ message: 'Please enter a new password.' })
  @MinLength(8, { message: 'Your new password must be at least 8 characters long.' })
  @Matches(/[A-Z]/, { message: 'Include at least one uppercase letter.' })
  @Matches(/[a-z]/, { message: 'Include at least one lowercase letter.' })
  @Matches(/[0-9]/, { message: 'Include at least one number.' })
  @Matches(/[\p{P}\p{S}]/u, { message: 'Include at least one symbol, such as _ @ # !.' })
  newPassword!: string;
}
