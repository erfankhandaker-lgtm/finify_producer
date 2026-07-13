import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminTokenPayload } from './admin-auth.types';
import { AdminLoginDto, AdminRefreshDto, InitializeAdminDto } from './dto/admin-login.dto';

type AuthenticatedRequest = Request & { user: AdminTokenPayload };

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly authService: AdminAuthService) {}

  @Get('setup/status')
  setupStatus() {
    return this.authService.setupStatus();
  }

  @Post('setup/initialize')
  initialize(@Body() input: InitializeAdminDto, @Req() request: Request) {
    return this.authService.initialize(input, this.requestContext(request));
  }

  @Post('login')
  login(@Body() input: AdminLoginDto, @Req() request: Request) {
    return this.authService.login(input, this.requestContext(request));
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
