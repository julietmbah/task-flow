
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegistrationOtpService } from './registration-otp.service.js';
import { VerifyRegistrationOtpDto } from './dto/verify-registration-otp.dto.js';
import { ResendRegistrationOtpDto } from './dto/resend-registration-otp.dto.js';

// Import our JWT authentication guard.
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from './jwt-auth.guard.js';

// =====================================================
// AUTHENTICATION CONTROLLER
// =====================================================

// All endpoints in this controller begin with /auth.
@Controller('auth')
export class AuthController {

  // NestJS injects our authentication service.
  constructor(
    private readonly authService: AuthService,
    private readonly registrationOtp: RegistrationOtpService,
  ) {}

  // =====================================================
  // USER REGISTRATION
  // POST /auth/register
  // PUBLIC ENDPOINT
  // =====================================================

  @Post('register')
  @Header('Cache-Control', 'no-store')
  async register(
    @Body() registrationData: RegisterDto,
  ) {
    // Global ValidationPipe validates incoming data.
    //
    // AuthService:
    // 1. Normalizes user information.
    // 2. Hashes the password using bcrypt.
    // 3. Saves the user in PostgreSQL.
    // 4. Returns safe account information.
    // Do not create accounts if email verification cannot be delivered.
    this.registrationOtp.ensureMailAvailable();
    this.registrationOtp.validateRegistrationEmail(registrationData.email);
    const account = await this.authService.register(registrationData);
    await this.registrationOtp.sendInitialCode(account.id, account.email);
    return account;
  }

  /** Public: send a replacement code to a pending registration. */
  @Post('resend-registration-otp')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async resendRegistrationOtp(@Body() request: ResendRegistrationOtpDto) {
    return this.registrationOtp.resend(request.email);
  }

  /** Public: activate a registration only after a valid, unexpired OTP. */
  @Post('verify-registration-otp')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async verifyRegistrationOtp(@Body() request: VerifyRegistrationOtpDto) {
    return this.registrationOtp.verify(request.email, request.otp);
  }

  // =====================================================
  // USER LOGIN
  // POST /auth/login
  // PUBLIC ENDPOINT
  // =====================================================

  @Post('login')

  // Return HTTP 200 for successful authentication.
  @HttpCode(HttpStatus.OK)

  // Prevent clients and intermediaries from caching
  // responses containing authentication tokens.
  @Header('Cache-Control', 'no-store')

  async login(
    @Body() loginData: LoginDto,
  ) {
    // AuthService verifies the supplied credentials.
    //
    // If valid:
    // - Generate a signed JWT.
    // - Return the token and public user information.
    //
    // If invalid:
    // - Return HTTP 401 Unauthorized.
    return this.authService.login(loginData);
  }

  // =====================================================
  // AUTHENTICATED USER PROFILE
  // GET /auth/me
  // PROTECTED ENDPOINT
  // =====================================================

  @Get('me')

  // Require successful JWT authentication before
  // executing this controller method.
  @UseGuards(JwtAuthGuard)

  // Prevent private account information from being cached.
  @Header('Cache-Control', 'no-store')

  getProfile(
    @Req() request: AuthenticatedRequest,
  ) {
    // JwtAuthGuard verifies the token and attaches
    // the authenticated user to request.user.
    //
    // This additional check prevents an undefined
    // user from accidentally being returned.
    if (!request.user) {
      throw new UnauthorizedException(
        'Authentication required.',
      );
    }

    // Return only the authenticated user's
    // non-sensitive account information.
    //
    // The guard has already selected:
    // - id
    // - name
    // - email
    // - createdAt
    //
    // Password hashes are never included.
    return request.user;
  }
}
