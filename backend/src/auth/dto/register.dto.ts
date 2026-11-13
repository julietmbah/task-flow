
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';

// Defines the data required to register a TaskFlow user.
export class RegisterDto {

  // The user's name must be a non-empty string.
  // It must contain between 2 and 100 characters.
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  // Ensure the user submits a valid email address.
  @IsEmail()
  email!: string;

  // Require a password containing 12 to 128 characters.
  // The password will be hashed before database storage.
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
