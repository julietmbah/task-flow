import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * Values accepted by PATCH /auth/me/password.
 *
 * Confirm-password is checked in the frontend before submission;
 * only the two values needed to update the password reach the server.
 */
export class ChangePasswordDto {
  @IsString({ message: 'Please enter your current password.' })
  @IsNotEmpty({ message: 'Please enter your current password.' })
  currentPassword!: string;

  @IsString({ message: 'Please enter a new password.' })
  @IsNotEmpty({ message: 'Please enter a new password.' })
  @MinLength(8, {
    message: 'Your new password must be at least 8 characters long.',
  })
  newPassword!: string;
}
