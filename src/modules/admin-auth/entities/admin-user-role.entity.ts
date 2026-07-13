import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { AdminRole } from './admin-role.entity';
import { AdminUser } from './admin-user.entity';

@Entity({ name: 'admin_user_roles' })
export class AdminUserRole {
  @PrimaryColumn({ type: 'bigint', name: 'user_id' })
  userId: string;

  @PrimaryColumn({ type: 'bigint', name: 'role_id' })
  roleId: string;

  @ManyToOne(() => AdminUser, (user) => user.userRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: AdminUser;

  @ManyToOne(() => AdminRole, (role) => role.userRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: AdminRole;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;
}
