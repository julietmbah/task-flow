import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';

import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { VerifyPasswordOtpDto } from './dto/verify-password-otp.dto.js';
import { PasswordResetService } from './password-reset.service.js';

/** Public recovery endpoints. No JWT is needed when a user forgets a password. */
@Controller('auth')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.passwordResetService.requestReset(body.email);
  }

  @Post('resend-password-otp')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  resendPasswordOtp(@Body() body: ForgotPasswordDto) {
    return this.passwordResetService.requestReset(body.email);
  }

  @Post('verify-password-otp')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  verifyPasswordOtp(@Body() body: VerifyPasswordOtpDto) {
    return this.passwordResetService.verifyOtp(body.email, body.otp);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.passwordResetService.resetPassword(body.token, body.newPassword);
  }
}
