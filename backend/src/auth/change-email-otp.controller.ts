import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ChangeEmailOtpService } from './change-email-otp.service.js';
import { RequestChangeEmailDto } from './dto/request-change-email.dto.js';
import { VerifyChangeEmailOtpDto } from './dto/verify-change-email-otp.dto.js';
import { JwtAuthGuard, type AuthenticatedRequest } from './jwt-auth.guard.js';

function userIdFrom(request: AuthenticatedRequest): string {
  if (!request.user?.id) throw new UnauthorizedException('Please sign in again.');
  return request.user.id;
}

/** Authenticated, account-bound email verification endpoints. */
@Controller('auth/me/email')
@UseGuards(JwtAuthGuard)
export class ChangeEmailOtpController {
  constructor(private readonly service: ChangeEmailOtpService) {}

  @Post('request')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  request(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RequestChangeEmailDto,
  ) {
    return this.service.request(userIdFrom(request), dto.newEmail);
  }

  @Post('resend')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  resend(@Req() request: AuthenticatedRequest) {
    return this.service.resend(userIdFrom(request));
  }

  @Post('verify')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  verify(
    @Req() request: AuthenticatedRequest,
    @Body() dto: VerifyChangeEmailOtpDto,
  ) {
    return this.service.verify(userIdFrom(request), dto.otp);
  }
}
