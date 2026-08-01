import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const expected = process.env.KYC_ADMIN_API_KEY || '';
    const supplied = String(
      context.switchToHttp().getRequest().headers['x-admin-api-key'] || '',
    );
    if (!expected || supplied.length !== expected.length) {
      throw new UnauthorizedException('Valid KYC service credentials are required');
    }
    if (!timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      throw new UnauthorizedException('Valid KYC service credentials are required');
    }
    return true;
  }
}
