import { Body, Controller, Get, Param, Patch, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { AdminAccessService } from './admin-access.service';
import { AdminBiometricService } from './admin-biometric.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminMfaService } from './admin-mfa.service';
import { AdminTokenPayload } from './admin-auth.types';
import {
  CreateAdminRoleDto,
  CreateAdminUserDto,
  UpdateAdminRoleDto,
  UpdateAdminBiometricDto,
  UpdateAdminSecuritySettingsDto,
  UpdateAdminUserDto,
} from './dto/admin-access.dto';
import { RequirePermissions } from './permissions.decorator';
import { AdminPermissionsGuard } from './permissions.guard';

type AdminRequest = Request & { user: AdminTokenPayload };

@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@Controller('admin/access')
export class AdminAccessController {
  constructor(
    private readonly service: AdminAccessService,
    private readonly biometrics: AdminBiometricService,
    private readonly mfa: AdminMfaService,
  ) {}

  @Get('permissions')
  @RequirePermissions('admin_roles.read')
  permissions() { return this.service.permissions(); }

  @Get('roles')
  @RequirePermissions('admin_roles.read')
  roles() { return this.service.roles(); }

  @Post('roles')
  @RequirePermissions('admin_roles.manage')
  createRole(@Body() body: CreateAdminRoleDto, @Req() request: AdminRequest) {
    return this.service.createRole(body, request.user);
  }

  @Patch('roles/:id')
  @RequirePermissions('admin_roles.manage')
  updateRole(
    @Param('id') id: string,
    @Body() body: UpdateAdminRoleDto,
    @Req() request: AdminRequest,
  ) {
    return this.service.updateRole(id, body, request.user);
  }

  @Get('users')
  @RequirePermissions('admin_users.read')
  users() { return this.service.users(); }

  @Get('security-settings')
  @RequirePermissions('admin_users.manage')
  securitySettings() { return this.mfa.securitySettings(); }

  @Patch('security-settings')
  @RequirePermissions('admin_users.manage')
  updateSecuritySettings(
    @Body() body: UpdateAdminSecuritySettingsDto,
    @Req() request: AdminRequest,
  ) {
    return this.mfa.updateSecuritySettings(body, request.user.sub);
  }

  @Post('users')
  @RequirePermissions('admin_users.manage')
  createUser(@Body() body: CreateAdminUserDto, @Req() request: AdminRequest) {
    return this.service.createUser(body, request.user);
  }

  @Patch('users/:id')
  @RequirePermissions('admin_users.manage')
  updateUser(
    @Param('id') id: string,
    @Body() body: UpdateAdminUserDto,
    @Req() request: AdminRequest,
  ) {
    return this.service.updateUser(id, body, request.user);
  }

  @Post('users/:id/mfa/reset')
  @RequirePermissions('admin_users.manage')
  resetMfa(@Param('id') id: string, @Req() request: AdminRequest) {
    return this.mfa.reset(id, request.user.sub);
  }

  @Post('users/:id/biometric')
  @RequirePermissions('admin_users.manage')
  @UseInterceptors(FileInterceptor('image', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  }))
  enrollBiometric(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: AdminRequest,
  ) {
    return this.biometrics.enroll(id, file, request.user);
  }

  @Patch('users/:id/biometric')
  @RequirePermissions('admin_users.manage')
  setBiometricStatus(
    @Param('id') id: string,
    @Body() body: UpdateAdminBiometricDto,
    @Req() request: AdminRequest,
  ) {
    return this.biometrics.setEnabled(id, body.enabled, request.user);
  }

  @Get('users/:id/biometric/photo')
  @RequirePermissions('admin_users.read')
  async biometricPhoto(@Param('id') id: string, @Res() response: Response) {
    const { profile, stream } = await this.biometrics.photo(id);
    response.setHeader('Content-Type', profile.contentType);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  }
}
