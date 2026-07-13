import { SetMetadata } from '@nestjs/common';

export const ADMIN_PERMISSIONS = 'admin_permissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(ADMIN_PERMISSIONS, permissions);
