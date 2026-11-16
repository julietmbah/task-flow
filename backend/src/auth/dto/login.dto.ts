
import {
  IsEmail,
  IsNotEmpty,
  IsString,
} from 'class-validator';

// Defines the information required to log in.
export class LoginDto {
  // Validate the email address.
  @IsEmail()
  email!: string;

  // Ensure the password is a nonempty string.
  @IsString()
  @IsNotEmpty()
  password!: string;
}
