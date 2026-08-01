import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { decrypt } from '@helpers/cipher';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAccessController } from './admin-access.controller';
import { AdminAccessService } from './admin-access.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminBiometricService } from './admin-biometric.service';
import { AdminMfaService } from './admin-mfa.service';
import { AdminJwtStrategy } from './admin-jwt.strategy';
import { AdminPermissionsGuard } from './permissions.guard';
import {
  AdminPermission,
  AdminRole,
  AdminRolePermission,
  AdminSession,
  AdminUser,
  AdminUserRole,
} from './entities';

const adminJwtSecret = () => {
  const value = process.env.ADMIN_JWT_SECRET || process.env.JWTKEY;
  return process.env.IS_CRD_PLAIN === 'true' ? value : decrypt(value);
};

@Module({
  imports: [
    PassportModule,
    JwtModule.register({ secret: adminJwtSecret() }),
    TypeOrmModule.forFeature([
      AdminUser,
      AdminRole,
      AdminPermission,
      AdminUserRole,
      AdminRolePermission,
      AdminSession,
    ]),
  ],
  controllers: [AdminAuthController, AdminAccessController],
  providers: [
    AdminAuthService,
    AdminBiometricService,
    AdminMfaService,
    AdminAccessService,
    AdminJwtStrategy,
    AdminAuthGuard,
    AdminPermissionsGuard,
  ],
  exports: [AdminAuthGuard, AdminPermissionsGuard],
})
export class AdminAuthModule {}
