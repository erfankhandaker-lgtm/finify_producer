import { Body, Controller, Get, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminMfaService } from './admin-mfa.service';
import { AdminTokenPayload } from './admin-auth.types';
import { AdminLoginDto, AdminMfaChallengeDto, AdminMfaCodeDto, AdminMfaRecoveryDto, AdminRefreshDto, InitializeAdminDto } from './dto/admin-login.dto';
import {
  ADMIN_REFRESH_COOKIE,
  ADMIN_CSRF_COOKIE,
  assertCookieCsrf,
  browserSessionResponse,
  clearAdminSessionCookies,
  cookieToken,
  setAdminSessionCookies,
} from '../../helpers/session-cookie';

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
  async initialize(@Body() input: InitializeAdminDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.sessionResponse(await this.authService.initialize(input, this.requestContext(request)), request, response);
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
  async confirmMfaEnrollment(@Body() input: AdminMfaCodeDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.sessionResponse(await this.authService.confirmMfaEnrollment(input.challengeId, input.code, this.requestContext(request)), request, response);
  }

  @Post('mfa/verify')
  async verifyMfa(@Body() input: AdminMfaCodeDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.sessionResponse(await this.authService.verifyMfa(input.challengeId, input.code, this.requestContext(request)), request, response);
  }

  @Post('mfa/recover')
  recoverMfa(@Body() input: AdminMfaRecoveryDto, @Req() request: Request) {
    return this.authService.recoverMfa(input.challengeId, input.recoveryPin, this.requestContext(request));
  }

  @Post('refresh')
  async refresh(@Body() input: AdminRefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = input.refreshToken || cookieToken(request, ADMIN_REFRESH_COOKIE);
    if (!refreshToken) throw new UnauthorizedException('Refresh session is required');
    if (!input.refreshToken) {
      assertCookieCsrf(request, ADMIN_REFRESH_COOKIE, ADMIN_CSRF_COOKIE);
    }
    return this.sessionResponse(await this.authService.refresh(refreshToken, this.requestContext(request)), request, response);
  }

  @UseGuards(AdminAuthGuard)
  @Post('logout')
  async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    await this.authService.logout(request.user.sid);
    clearAdminSessionCookies(response);
    return { loggedOut: true };
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

  private sessionResponse(value: any, request: Request, response: Response) {
    if (!value?.accessToken || !value?.refreshToken) return value;
    if (request.get('x-finify-token-transport') === 'bearer') return value;
    setAdminSessionCookies(response, value.accessToken, value.refreshToken);
    return browserSessionResponse(value);
  }
}
