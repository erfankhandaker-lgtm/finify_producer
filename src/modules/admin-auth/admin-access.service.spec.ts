import { ForbiddenException } from '@nestjs/common';
import { AdminAccessService } from './admin-access.service';

describe('AdminAccessService security policy', () => {
  const dataSource = { transaction: jest.fn() };
  const service = new AdminAccessService(dataSource as any);
  const actor = {
    sub: '2',
    sid: 'session-2',
    username: 'role_admin',
    roles: ['role_admin'],
    permissions: ['admin_roles.manage', 'admin_users.manage'],
    type: 'admin_access' as const,
  };

  it('prevents non-Super-Admin privilege escalation even with manage permissions', async () => {
    await expect(
      service.createRole(
        {
          code: 'elevated',
          name: 'Elevated',
          permissionIds: ['1'],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
