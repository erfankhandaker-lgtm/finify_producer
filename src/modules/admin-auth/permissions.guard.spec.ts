import { ForbiddenException } from '@nestjs/common';
import { AdminPermissionsGuard } from './permissions.guard';

const context = (user: any) => ({
  getHandler: () => ({}),
  getClass: () => ({}),
  switchToHttp: () => ({ getRequest: () => ({ user }) }),
}) as any;

describe('AdminPermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(['admin_users.manage']),
  };
  const guard = new AdminPermissionsGuard(reflector as any);

  it('allows Super Admin independently of token permission enumeration', () => {
    expect(guard.canActivate(context({ roles: ['super_admin'], permissions: [] }))).toBe(true);
  });

  it('requires every privilege for non-Super-Admin users', () => {
    expect(() =>
      guard.canActivate(context({ roles: ['maker'], permissions: ['admin_users.read'] })),
    ).toThrow(ForbiddenException);
  });
});
