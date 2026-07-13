import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { AdminPermission } from './admin-permission.entity';
import { AdminRole } from './admin-role.entity';

@Entity({ name: 'admin_role_permissions' })
export class AdminRolePermission {
  @PrimaryColumn({ type: 'bigint', name: 'role_id' })
  roleId: string;

  @PrimaryColumn({ type: 'bigint', name: 'permission_id' })
  permissionId: string;

  @ManyToOne(() => AdminRole, (role) => role.rolePermissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: AdminRole;

  @ManyToOne(() => AdminPermission, (permission) => permission.rolePermissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_id' })
  permission: AdminPermission;
}
