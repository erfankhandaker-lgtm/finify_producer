import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

abstract class ApiKeyGuard implements CanActivate {
  protected abstract readonly configKey: string;
  constructor(protected readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>(this.configKey);
    const production = ['prod', 'production'].includes(String(
      this.config.get<string>('NODE_MODE') || this.config.get<string>('NODE_ENV') || 'development',
    ).toLowerCase());
    if (!expected && !production) return true;
    const supplied = context.switchToHttp().getRequest<Request>().header('x-api-key');
    if (!expected || supplied !== expected) {
      throw new UnauthorizedException('A valid x-api-key header is required');
    }
    return true;
  }
}

@Injectable()
export class AdminApiKeyGuard extends ApiKeyGuard {
  protected readonly configKey = 'CREDIT_RULE_ADMIN_API_KEY';

  constructor(config: ConfigService) {
    super(config);
  }
}

@Injectable()
export class EvaluationApiKeyGuard extends ApiKeyGuard {
  protected readonly configKey = 'CREDIT_RULE_EVALUATION_API_KEY';

  constructor(config: ConfigService) {
    super(config);
  }
}
