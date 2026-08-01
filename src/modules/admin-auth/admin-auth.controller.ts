import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminMfaService } from './admin-mfa.service';
import { AdminTokenPayload } from './admin-auth.types';
import { AdminLoginDto, AdminMfaChallengeDto, AdminMfaCodeDto, AdminMfaRecoveryDto, AdminRefreshDto, InitializeAdminDto } from './dto/admin-login.dto';

type AuthenticatedRequest = Request & { user: AdminTokenPayload };

@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly authService: AdminAuthService,
    private readonly mfa: AdminMfaService,
  ) {}

  @Get('setup/status')
  setupStatus() {
    return this.authService.setupStatus();
  }

  @Get('security/bootstrap')
  securityBootstrap() {
    return this.mfa.bootstrapSettings();
  }

  @Post('setup/initialize')
  initialize(@Body() input: InitializeAdminDto, @Req() request: Request) {
    return this.authService.initialize(input, this.requestContext(request));
  }

  @Post('login')
  login(@Body() input: AdminLoginDto, @Req() request: Request) {
    return this.authService.login(input, this.requestContext(request));
  }

  @Post('mfa/enrollment/start')
  startMfaEnrollment(@Body() input: AdminMfaChallengeDto, @Req() request: Request) {
    return this.authService.startMfaEnrollment(input.challengeId, this.requestContext(request));
  }

  @Post('mfa/enrollment/confirm')
  confirmMfaEnrollment(@Body() input: AdminMfaCodeDto, @Req() request: Request) {
    return this.authService.confirmMfaEnrollment(input.challengeId, input.code, this.requestContext(request));
  }

  @Post('mfa/verify')
  verifyMfa(@Body() input: AdminMfaCodeDto, @Req() request: Request) {
    return this.authService.verifyMfa(input.challengeId, input.code, this.requestContext(request));
  }

  @Post('mfa/recover')
  recoverMfa(@Body() input: AdminMfaRecoveryDto, @Req() request: Request) {
    return this.authService.recoverMfa(input.challengeId, input.recoveryPin, this.requestContext(request));
  }

  @Post('refresh')
  refresh(@Body() input: AdminRefreshDto, @Req() request: Request) {
    return this.authService.refresh(input.refreshToken, this.requestContext(request));
  }

  @UseGuards(AdminAuthGuard)
  @Post('logout')
  logout(@Req() request: AuthenticatedRequest) {
    return this.authService.logout(request.user.sid);
  }

  @UseGuards(AdminAuthGuard)
  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return this.authService.getProfile(request.user.sub);
  }

  private requestContext(request: Request) {
    return {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    };
  }
}
