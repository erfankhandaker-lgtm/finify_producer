import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { readCredential } from '../config/credential';

export interface WalletRequest extends Request {
  walletUser?: { username: string; [key: string]: unknown };
}

@Injectable()
export class WalletAuthGuard implements CanActivate {
  private readonly jwt: JwtService;

  constructor(config: ConfigService) {
    const plain = config.get<string>('IS_CRD_PLAIN', 'true') === 'true';
    const secret = readCredential(config.get<string>('JWTKEY'), plain);
    this.jwt = new JwtService({ secret });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WalletRequest>();
    const header = request.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthorizedException('Bearer token is required');
    try {
      const payload = await this.jwt.verifyAsync<Record<string, unknown>>(token);
      if (!payload.username || !/^\d+$/.test(String(payload.username))) {
        throw new UnauthorizedException('Token has no valid wallet username');
      }
      request.walletUser = { ...payload, username: String(payload.username) };
      return true;
    } catch {
      throw new UnauthorizedException('Bearer token is invalid or expired');
    }
  }
}
