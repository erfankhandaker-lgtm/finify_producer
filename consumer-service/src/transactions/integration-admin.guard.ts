import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class IntegrationAdminGuard implements CanActivate {
  private readonly expected?: string;
  private readonly production: boolean;

  constructor(config: ConfigService) {
    this.expected = config.get<string>('INTEGRATION_ADMIN_API_KEY');
    this.production = ['prod', 'production'].includes(String(
      config.get<string>('NODE_MODE') || config.get<string>('NODE_ENV') || 'development',
    ).toLowerCase());
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.expected && !this.production) return true;
    const provided = context.switchToHttp().getRequest<Request>().header('x-admin-api-key');
    if (!this.expected || provided !== this.expected) throw new UnauthorizedException('A valid x-admin-api-key header is required');
    return true;
  }
}
