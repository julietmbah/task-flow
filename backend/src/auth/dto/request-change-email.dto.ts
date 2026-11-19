import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Body for POST /auth/me/email/request. */
export class RequestChangeEmailDto {
  @IsString()
  @IsNotEmpty({ message: 'Please enter your new email address.' })
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @MaxLength(254)
  newEmail!: string;
}
