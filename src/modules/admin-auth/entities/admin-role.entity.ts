import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AdminRolePermission } from './admin-role-permission.entity';
import { AdminUserRole } from './admin-user-role.entity';

@Entity({ name: 'admin_roles' })
export class AdminRole {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', name: 'is_system', default: false })
  isSystem: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => AdminUserRole, (userRole) => userRole.role)
  userRoles: AdminUserRole[];

  @OneToMany(() => AdminRolePermission, (rolePermission) => rolePermission.role)
  rolePermissions: AdminRolePermission[];
}
