import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DataSource, EntityManager } from 'typeorm';
import { AdminTokenPayload } from './admin-auth.types';
import {
  CreateAdminRoleDto,
  CreateAdminUserDto,
  UpdateAdminRoleDto,
  UpdateAdminUserDto,
} from './dto/admin-access.dto';
import { AdminUserStatus } from './entities';

@Injectable()
export class AdminAccessService {
  constructor(private readonly dataSource: DataSource) {}

  async permissions() {
    return this.dataSource.query(
      `SELECT id::text,code,resource,action,description
       FROM public.admin_permissions
       ORDER BY resource,action,code`,
    );
  }

  async roles() {
    return this.dataSource.query(
      `SELECT role.id::text,role.code,role.name,role.description,
              role.is_system AS "isSystem",role.created_at AS "createdAt",
              count(DISTINCT user_role.user_id)::int AS "userCount",
              COALESCE(
                jsonb_agg(DISTINCT jsonb_build_object(
                  'id',permission.id::text,'code',permission.code,
                  'resource',permission.resource,'action',permission.action,
                  'description',permission.description
                )) FILTER (WHERE permission.id IS NOT NULL),
                '[]'::jsonb
              ) AS permissions
       FROM public.admin_roles role
       LEFT JOIN public.admin_user_roles user_role ON user_role.role_id=role.id
       LEFT JOIN public.admin_role_permissions role_permission ON role_permission.role_id=role.id
       LEFT JOIN public.admin_permissions permission ON permission.id=role_permission.permission_id
       GROUP BY role.id
       ORDER BY role.is_system DESC,role.name`,
    );
  }

  async users() {
    return this.dataSource.query(
      `SELECT admin.id::text,admin.username,admin.email,
              admin.display_name AS "displayName",admin.status,
              admin.failed_login_attempts AS "failedLoginAttempts",
              admin.locked_until AS "lockedUntil",admin.last_login_at AS "lastLoginAt",
              admin.created_at AS "createdAt",admin.updated_at AS "updatedAt",
              EXISTS(SELECT 1 FROM public.admin_biometric_profiles biometric
                     WHERE biometric.user_id=admin.id) AS "biometricEnrolled",
              COALESCE((SELECT biometric.enabled FROM public.admin_biometric_profiles biometric
                        WHERE biometric.user_id=admin.id),false) AS "biometricEnabled",
              (SELECT biometric.consent_at FROM public.admin_biometric_profiles biometric
               WHERE biometric.user_id=admin.id) AS "biometricEnrolledAt",
              (SELECT biometric.last_verified_at FROM public.admin_biometric_profiles biometric
               WHERE biometric.user_id=admin.id) AS "biometricLastVerifiedAt",
              COALESCE((SELECT mfa.enabled FROM public.admin_mfa_profiles mfa
                        WHERE mfa.user_id=admin.id),false) AS "mfaEnabled",
              (SELECT mfa.enrolled_at FROM public.admin_mfa_profiles mfa
               WHERE mfa.user_id=admin.id) AS "mfaEnrolledAt",
              COALESCE((SELECT mfa.enabled AND mfa.recovery_pin_used_at IS NULL
                        FROM public.admin_mfa_profiles mfa WHERE mfa.user_id=admin.id),false)
                        AS "mfaRecoveryPinAvailable",
              COALESCE(
                jsonb_agg(DISTINCT jsonb_build_object(
                  'id',role.id::text,'code',role.code,'name',role.name,
                  'isSystem',role.is_system
                )) FILTER (WHERE role.id IS NOT NULL),
                '[]'::jsonb
              ) AS roles
       FROM public.admin_users admin
       LEFT JOIN public.admin_user_roles user_role ON user_role.user_id=admin.id
       LEFT JOIN public.admin_roles role ON role.id=user_role.role_id
       GROUP BY admin.id
       ORDER BY admin.created_at DESC`,
    );
  }

  async createRole(input: CreateAdminRoleDto, actor: AdminTokenPayload) {
    this.assertSuperAdmin(actor);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const code = input.code.trim().toLowerCase();
        const [role] = await manager.query(
          `INSERT INTO public.admin_roles(code,name,description,is_system)
           VALUES($1,$2,$3,false)
           RETURNING id::text,code,name,description,is_system AS "isSystem",
                     created_at AS "createdAt"`,
          [code, input.name.trim(), input.description?.trim() || null],
        );
        await this.replacePermissions(manager, role.id, input.permissionIds);
        return this.role(manager, role.id);
      });
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('Role code already exists');
      throw error;
    }
  }

  async updateRole(id: string, input: UpdateAdminRoleDto, actor: AdminTokenPayload) {
    this.assertSuperAdmin(actor);
    return this.dataSource.transaction(async (manager) => {
      const current = await this.lockedRole(manager, id);
      if (current.is_system) {
        throw new ForbiddenException('System roles cannot be modified');
      }
      await manager.query(
        `UPDATE public.admin_roles
         SET name=COALESCE($2,name),description=CASE WHEN $3::boolean THEN $4 ELSE description END
         WHERE id=$1::bigint`,
        [
          id,
          input.name?.trim() || null,
          input.description !== undefined,
          input.description?.trim() || null,
        ],
      );
      if (input.permissionIds) {
        await this.replacePermissions(manager, id, input.permissionIds);
        await this.revokeRoleSessions(manager, id);
      }
      return this.role(manager, id);
    });
  }

  async createUser(input: CreateAdminUserDto, actor: AdminTokenPayload) {
    this.assertSuperAdmin(actor);
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.validateRoles(manager, input.roleIds, actor);
        const [user] = await manager.query(
          `INSERT INTO public.admin_users(
             username,email,display_name,password_hash,password_changed_at,
             status,failed_login_attempts,created_by
           ) VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP,'active',0,$5::bigint)
           RETURNING id::text`,
          [
            input.username.trim(),
            input.email.trim().toLowerCase(),
            input.displayName.trim(),
            await bcrypt.hash(input.password, 12),
            actor.sub,
          ],
        );
        await this.replaceRoles(manager, user.id, input.roleIds);
        return this.user(manager, user.id);
      });
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new ConflictException('Username or email already exists');
      }
      throw error;
    }
  }

  async updateUser(id: string, input: UpdateAdminUserDto, actor: AdminTokenPayload) {
    this.assertSuperAdmin(actor);
    if (id === actor.sub && input.status && input.status !== AdminUserStatus.ACTIVE) {
      throw new ForbiddenException('You cannot disable or lock your own account');
    }
    try {
      return await this.dataSource.transaction(async (manager) => {
        const current = await this.lockedUser(manager, id);
        const currentIsSuper = current.role_codes.includes('super_admin');
        let nextIsSuper = currentIsSuper;
        if (input.roleIds) {
          const roles = await this.validateRoles(manager, input.roleIds, actor);
          nextIsSuper = roles.some((role: any) => role.code === 'super_admin');
        }
        const nextActive = (input.status || current.status) === AdminUserStatus.ACTIVE;
        if (currentIsSuper && (!nextIsSuper || !nextActive)) {
          await this.assertAnotherActiveSuperAdmin(manager, id);
        }

        const passwordHash = input.password
          ? await bcrypt.hash(input.password, 12)
          : null;
        await manager.query(
          `UPDATE public.admin_users
           SET email=COALESCE($2,email),
               display_name=COALESCE($3,display_name),
               status=COALESCE($4::admin_user_status,status),
               password_hash=COALESCE($5,password_hash),
               password_changed_at=CASE WHEN $5 IS NULL THEN password_changed_at ELSE CURRENT_TIMESTAMP END,
               failed_login_attempts=CASE WHEN $4='active' THEN 0 ELSE failed_login_attempts END,
               locked_until=CASE WHEN $4='active' THEN NULL ELSE locked_until END,
               updated_at=CURRENT_TIMESTAMP
           WHERE id=$1::bigint`,
          [
            id,
            input.email?.trim().toLowerCase() || null,
            input.displayName?.trim() || null,
            input.status || null,
            passwordHash,
          ],
        );
        if (input.roleIds) await this.replaceRoles(manager, id, input.roleIds);
        await manager.query(
          `UPDATE public.admin_sessions SET revoked_at=CURRENT_TIMESTAMP
           WHERE user_id=$1::bigint AND revoked_at IS NULL`,
          [id],
        );
        return this.user(manager, id);
      });
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('Email already exists');
      throw error;
    }
  }

  private async replacePermissions(
    manager: EntityManager,
    roleId: string,
    permissionIds: string[],
  ) {
    const ids = this.ids(permissionIds, 'permission');
    const rows = await manager.query(
      `SELECT id::text FROM public.admin_permissions WHERE id=ANY($1::bigint[])`,
      [ids],
    );
    if (rows.length !== ids.length) throw new BadRequestException('One or more permissions are invalid');
    await manager.query('DELETE FROM public.admin_role_permissions WHERE role_id=$1::bigint', [roleId]);
    await manager.query(
      `INSERT INTO public.admin_role_permissions(role_id,permission_id)
       SELECT $1::bigint,unnest($2::bigint[])`,
      [roleId, ids],
    );
  }

  private async validateRoles(
    manager: EntityManager,
    roleIds: string[],
    actor: AdminTokenPayload,
  ) {
    const ids = this.ids(roleIds, 'role');
    const roles = await manager.query(
      `SELECT id::text,code FROM public.admin_roles WHERE id=ANY($1::bigint[])`,
      [ids],
    );
    if (roles.length !== ids.length) throw new BadRequestException('One or more roles are invalid');
    if (
      roles.some((role: any) => role.code === 'super_admin') &&
      !actor.roles.includes('super_admin')
    ) {
      throw new ForbiddenException('Only a Super Admin can assign the Super Admin role');
    }
    return roles;
  }

  private async replaceRoles(manager: EntityManager, userId: string, roleIds: string[]) {
    const ids = this.ids(roleIds, 'role');
    await manager.query('DELETE FROM public.admin_user_roles WHERE user_id=$1::bigint', [userId]);
    await manager.query(
      `INSERT INTO public.admin_user_roles(user_id,role_id)
       SELECT $1::bigint,unnest($2::bigint[])`,
      [userId, ids],
    );
  }

  private ids(values: string[], label: string) {
    const ids = [...new Set(values.map(String))];
    if (!ids.length || ids.some((id) => !/^[1-9]\d*$/.test(id))) {
      throw new BadRequestException(`At least one valid ${label} is required`);
    }
    return ids;
  }

  private assertSuperAdmin(actor: AdminTokenPayload) {
    if (!actor.roles.includes('super_admin')) {
      throw new ForbiddenException('Only a Super Admin can change users and roles');
    }
  }

  private async lockedRole(manager: EntityManager, id: string) {
    const [role] = await manager.query(
      `SELECT id::text,code,is_system FROM public.admin_roles
       WHERE id=$1::bigint FOR UPDATE`,
      [id],
    );
    if (!role) throw new NotFoundException('Role was not found');
    return role;
  }

  private async lockedUser(manager: EntityManager, id: string) {
    const [user] = await manager.query(
      `SELECT admin.id::text,admin.status
       FROM public.admin_users admin
       WHERE admin.id=$1::bigint
       FOR UPDATE`,
      [id],
    );
    if (!user) throw new NotFoundException('Administrator was not found');
    const roles = await manager.query(
      `SELECT role.code
       FROM public.admin_user_roles user_role
       JOIN public.admin_roles role ON role.id=user_role.role_id
       WHERE user_role.user_id=$1::bigint`,
      [id],
    );
    return { ...user, role_codes: roles.map((role: any) => role.code) };
  }

  private async assertAnotherActiveSuperAdmin(manager: EntityManager, excludedId: string) {
    const [row] = await manager.query(
      `SELECT count(DISTINCT admin.id)::int AS count
       FROM public.admin_users admin
       JOIN public.admin_user_roles user_role ON user_role.user_id=admin.id
       JOIN public.admin_roles role ON role.id=user_role.role_id
       WHERE role.code='super_admin' AND admin.status='active' AND admin.id<>$1::bigint`,
      [excludedId],
    );
    if (!Number(row?.count)) {
      throw new ConflictException('At least one active Super Admin must remain');
    }
  }

  private async revokeRoleSessions(manager: EntityManager, roleId: string) {
    await manager.query(
      `UPDATE public.admin_sessions session SET revoked_at=CURRENT_TIMESTAMP
       FROM public.admin_user_roles user_role
       WHERE user_role.role_id=$1::bigint AND session.user_id=user_role.user_id
         AND session.revoked_at IS NULL`,
      [roleId],
    );
  }

  private async role(manager: EntityManager, id: string) {
    const roles = await manager.query(
      `SELECT role.id::text,role.code,role.name,role.description,
              role.is_system AS "isSystem",
              COALESCE(jsonb_agg(jsonb_build_object(
                'id',permission.id::text,'code',permission.code,
                'resource',permission.resource,'action',permission.action,
                'description',permission.description
              )) FILTER (WHERE permission.id IS NOT NULL),'[]'::jsonb) AS permissions
       FROM public.admin_roles role
       LEFT JOIN public.admin_role_permissions role_permission ON role_permission.role_id=role.id
       LEFT JOIN public.admin_permissions permission ON permission.id=role_permission.permission_id
       WHERE role.id=$1::bigint GROUP BY role.id`,
      [id],
    );
    return roles[0];
  }

  private async user(manager: EntityManager, id: string) {
    const users = await manager.query(
      `SELECT admin.id::text,admin.username,admin.email,
              admin.display_name AS "displayName",admin.status,
              EXISTS(SELECT 1 FROM public.admin_biometric_profiles biometric
                     WHERE biometric.user_id=admin.id) AS "biometricEnrolled",
              COALESCE((SELECT biometric.enabled FROM public.admin_biometric_profiles biometric
                        WHERE biometric.user_id=admin.id),false) AS "biometricEnabled",
              COALESCE(jsonb_agg(jsonb_build_object(
                'id',role.id::text,'code',role.code,'name',role.name,
                'isSystem',role.is_system
              )) FILTER (WHERE role.id IS NOT NULL),'[]'::jsonb) AS roles
       FROM public.admin_users admin
       LEFT JOIN public.admin_user_roles user_role ON user_role.user_id=admin.id
       LEFT JOIN public.admin_roles role ON role.id=user_role.role_id
       WHERE admin.id=$1::bigint GROUP BY admin.id`,
      [id],
    );
    return users[0];
  }
}
