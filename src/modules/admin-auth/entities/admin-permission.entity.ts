import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AdminRolePermission } from './admin-role-permission.entity';

@Entity({ name: 'admin_permissions' })
export class AdminPermission {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  resource: string;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @OneToMany(() => AdminRolePermission, (rolePermission) => rolePermission.permission)
  rolePermissions: AdminRolePermission[];
}
