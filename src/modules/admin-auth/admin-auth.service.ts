import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { DataSource, Repository } from 'typeorm';
import { AdminLoginDto, InitializeAdminDto } from './dto/admin-login.dto';
import { AdminSession, AdminUser, AdminUserStatus } from './entities';
import { AdminRequestContext, AdminTokenPayload } from './admin-auth.types';
import { AdminMfaService } from './admin-mfa.service';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const REFRESH_TOKEN_DAYS = 7;

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(AdminUser) private readonly users: Repository<AdminUser>,
    @InjectRepository(AdminSession) private readonly sessions: Repository<AdminSession>,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
    private readonly mfa: AdminMfaService,
  ) {}

  async setupStatus() {
    const userCount = await this.users.count();
    return {
      needsSetup: userCount === 0,
      setupTokenRequired: Boolean(process.env.ADMIN_SETUP_TOKEN),
    };
  }

  async initialize(input: InitializeAdminDto, context: AdminRequestContext) {
    if (process.env.ADMIN_SETUP_TOKEN && input.setupToken !== process.env.ADMIN_SETUP_TOKEN) {
      throw new ForbiddenException('The setup token is invalid');
    }

    const user = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(681954321)');
      if (await manager.getRepository(AdminUser).count()) {
        throw new ConflictException('Admin setup has already been completed');
      }
      const role = await manager.getRepository('admin_roles').findOne({ where: { code: 'super_admin' } });
      if (!role) throw new ConflictException('Admin database migration has not been applied');

      const created = manager.getRepository(AdminUser).create({
        username: input.username.trim(),
        email: input.email.trim().toLowerCase(),
        displayName: input.displayName.trim(),
        passwordHash: await bcrypt.hash(input.password, 12),
        passwordChangedAt: new Date(),
        status: AdminUserStatus.ACTIVE,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: null,
        createdBy: null,
      });
      const saved = await manager.getRepository(AdminUser).save(created);
      await manager.query(
        'INSERT INTO admin_user_roles (user_id, role_id) VALUES ($1, $2)',
        [saved.id, role.id],
      );
      return manager.getRepository(AdminUser).findOne({
        where: { id: saved.id },
        relations: { userRoles: { role: { rolePermissions: { permission: true } } } },
      });
    });

    if (!user) throw new ConflictException('Could not initialize the administrator');
    return this.createSession(user, context);
  }

  async login(input: AdminLoginDto, context: AdminRequestContext) {
    await this.mfa.verifyCaptcha(input.captchaToken, context);
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.userRoles', 'userRole')
      .leftJoinAndSelect('userRole.role', 'role')
      .leftJoinAndSelect('role.rolePermissions', 'rolePermission')
      .leftJoinAndSelect('rolePermission.permission', 'permission')
      .where('LOWER(user.username) = LOWER(:identity)', { identity: input.username })
      .orWhere('LOWER(user.email) = LOWER(:identity)', { identity: input.username })
      .getOne();

    if (!user) throw this.invalidCredentials();
    if (user.status === AdminUserStatus.DISABLED) throw this.invalidCredentials();
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Admin account is temporarily locked');
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
      await this.recordFailedLogin(user);
      throw this.invalidCredentials();
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.status = AdminUserStatus.ACTIVE;
    await this.users.save(user);

    return this.mfa.beginLogin(user.id, context);
  }

  startMfaEnrollment(challengeId: string, context: AdminRequestContext) {
    return this.mfa.startEnrollment(challengeId, context);
  }

  async confirmMfaEnrollment(challengeId: string, code: string, context: AdminRequestContext) {
    const result = await this.mfa.confirmEnrollment(challengeId, code, context);
    const session = await this.completeMfaLogin(result.userId, context);
    return { ...session, recoveryPin: result.recoveryPin, recoveryPinShownOnce: true };
  }

  async verifyMfa(challengeId: string, code: string, context: AdminRequestContext) {
    const result = await this.mfa.verify(challengeId, code, context);
    return this.completeMfaLogin(result.userId, context);
  }

  recoverMfa(challengeId: string, recoveryPin: string, context: AdminRequestContext) {
    return this.mfa.recover(challengeId, recoveryPin, context);
  }

  async refresh(refreshToken: string, context: AdminRequestContext) {
    const parsed = this.parseRefreshToken(refreshToken);
    const session = await this.sessions
      .createQueryBuilder('session')
      .addSelect('session.refreshTokenHash')
      .leftJoinAndSelect('session.user', 'user')
      .leftJoinAndSelect('user.userRoles', 'userRole')
      .leftJoinAndSelect('userRole.role', 'role')
      .leftJoinAndSelect('role.rolePermissions', 'rolePermission')
      .leftJoinAndSelect('rolePermission.permission', 'permission')
      .where('session.id = :id', { id: parsed.sessionId })
      .getOne();

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
    if (session.user.status !== AdminUserStatus.ACTIVE) {
      throw new UnauthorizedException('Admin account is not active');
    }
    if (!this.tokenHashesMatch(parsed.secret, session.refreshTokenHash)) {
      session.revokedAt = new Date();
      await this.sessions.save(session);
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    const nextSecret = randomBytes(48).toString('base64url');
    session.refreshTokenHash = this.hashToken(nextSecret);
    session.lastUsedAt = new Date();
    session.ipAddress = context.ipAddress || session.ipAddress;
    session.userAgent = context.userAgent || session.userAgent;
    await this.sessions.save(session);

    return this.tokenResponse(session.user, session.id, nextSecret);
  }

  async logout(sessionId: string) {
    await this.sessions.update({ id: sessionId }, { revokedAt: new Date() });
    return { success: true };
  }

  async getProfile(userId: string) {
    const user = await this.users.findOne({
      where: { id: userId },
      relations: {
        userRoles: { role: { rolePermissions: { permission: true } } },
      },
    });
    if (!user) throw new UnauthorizedException();
    const access = this.accessFor(user);
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      ...access,
    };
  }

  private async createSession(user: AdminUser, context: AdminRequestContext) {
    const id = randomUUID();
    const secret = randomBytes(48).toString('base64url');
    await this.sessions.save(
      this.sessions.create({
        id,
        userId: user.id,
        refreshTokenHash: this.hashToken(secret),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 86400000),
        revokedAt: null,
        ipAddress: context.ipAddress || null,
        userAgent: context.userAgent || null,
        lastUsedAt: null,
      }),
    );
    return this.tokenResponse(user, id, secret);
  }

  private async completeMfaLogin(userId: string, context: AdminRequestContext) {
    const user = await this.users.findOne({
      where: { id: userId, status: AdminUserStatus.ACTIVE },
      relations: { userRoles: { role: { rolePermissions: { permission: true } } } },
    });
    if (!user) throw this.invalidCredentials();
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    await this.users.save(user);
    return this.createSession(user, context);
  }

  private async tokenResponse(user: AdminUser, sessionId: string, refreshSecret: string) {
    const access = this.accessFor(user);
    const payload: AdminTokenPayload = {
      sub: user.id,
      sid: sessionId,
      username: user.username,
      roles: access.roles,
      permissions: access.permissions,
      type: 'admin_access',
    };
    const accessToken = await this.jwtService.signAsync(payload, { expiresIn: '15m' });
    return {
      tokenType: 'Bearer',
      accessToken,
      expiresIn: 900,
      refreshToken: `${sessionId}.${refreshSecret}`,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        ...access,
      },
    };
  }

  private accessFor(user: AdminUser) {
    const roles = [...new Set((user.userRoles || []).map((item) => item.role.code))];
    const permissions = [
      ...new Set(
        (user.userRoles || []).flatMap((item) =>
          (item.role.rolePermissions || []).map((rolePermission) => rolePermission.permission.code),
        ),
      ),
    ];
    return { roles, permissions };
  }

  private async recordFailedLogin(user: AdminUser) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.status = AdminUserStatus.LOCKED;
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
    }
    await this.users.save(user);
  }

  private parseRefreshToken(token: string) {
    const separator = token.indexOf('.');
    if (separator < 1) throw new UnauthorizedException('Refresh token is invalid or expired');
    return { sessionId: token.slice(0, separator), secret: token.slice(separator + 1) };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private tokenHashesMatch(token: string, expectedHash: string) {
    const actual = Buffer.from(this.hashToken(token));
    const expected = Buffer.from(expectedHash || '');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private invalidCredentials() {
    return new UnauthorizedException('Invalid admin credentials');
  }
}
