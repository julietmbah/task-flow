
import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';

import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';

// Every endpoint in this controller begins with /auth.
@Controller('auth')
export class AuthController {

  // NestJS automatically injects AuthService.
  // The controller does not handle database logic itself.
  constructor(private readonly authService: AuthService) {}

  // Handles POST /auth/register requests.
  @Post('register')
  async register(@Body() registrationData: RegisterDto) {

    // The global ValidationPipe validates incoming data
    // against the rules defined in RegisterDto.

    // Pass the validated data to our authentication service.
    // AuthService hashes the password and saves the user.
    return this.authService.register(registrationData);
  }
}
