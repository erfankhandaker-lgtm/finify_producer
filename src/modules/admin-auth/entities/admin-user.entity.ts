import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AdminSession } from './admin-session.entity';
import { AdminUserRole } from './admin-user-role.entity';

export enum AdminUserStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
  LOCKED = 'locked',
}

@Entity({ name: 'admin_users' })
export class AdminUser {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  username: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 150, name: 'display_name' })
  displayName: string;

  @Column({ type: 'text', name: 'password_hash', select: false })
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: AdminUserStatus,
    enumName: 'admin_user_status',
    default: AdminUserStatus.ACTIVE,
  })
  status: AdminUserStatus;

  @Column({ type: 'integer', name: 'failed_login_attempts', default: 0 })
  failedLoginAttempts: number;

  @Column({ type: 'timestamp', name: 'locked_until', nullable: true })
  lockedUntil: Date | null;

  @Column({ type: 'timestamp', name: 'last_login_at', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'timestamp', name: 'password_changed_at', nullable: true })
  passwordChangedAt: Date | null;

  @Column({ type: 'bigint', name: 'created_by', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => AdminUserRole, (userRole) => userRole.user)
  userRoles: AdminUserRole[];

  @OneToMany(() => AdminSession, (session) => session.user)
  sessions: AdminSession[];
}
