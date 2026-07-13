import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { decrypt } from '@helpers/cipher';
import { AdminSession, AdminUserStatus } from './entities';
import { AdminTokenPayload } from './admin-auth.types';

const adminJwtSecret = () => {
  const value = process.env.ADMIN_JWT_SECRET || process.env.JWTKEY;
  return process.env.IS_CRD_PLAIN === 'true' ? value : decrypt(value);
};

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    @InjectRepository(AdminSession) private readonly sessions: Repository<AdminSession>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: adminJwtSecret(),
    });
  }

  async validate(payload: AdminTokenPayload) {
    if (payload.type !== 'admin_access' || !payload.sid || !payload.sub) {
      throw new UnauthorizedException();
    }
    const session = await this.sessions.findOne({
      where: { id: payload.sid },
      relations: { user: true },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== AdminUserStatus.ACTIVE
    ) {
      throw new UnauthorizedException();
    }
    return payload;
  }
}
