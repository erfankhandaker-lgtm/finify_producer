import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpIntegrationRow } from './credit-rule.types';

@Injectable()
export class HttpSourceService {
  private readonly allowedHosts: Set<string>;
  private readonly insecure: boolean;

  constructor(private readonly config: ConfigService) {
    this.allowedHosts = new Set(
      config.get<string>('CREDIT_RULE_HTTP_ALLOWED_HOSTS', '')
        .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean)
    );
    this.insecure = config.get<string>('CREDIT_RULE_ALLOW_INSECURE_HTTP', 'false') === 'true';
  }

  validateUrlTemplate(template: string): void {
    const sample = template.replace(/\{\{[A-Za-z0-9_]+\}\}/g, 'sample');
    let url: URL;
    try { url = new URL(sample); } catch { throw new BadRequestException('HTTP integration URL is invalid'); }
    if (url.protocol !== 'https:' && !this.insecure) {
      throw new BadRequestException('Credit-rule HTTP integrations require HTTPS');
    }
    if (this.allowedHosts.size && !this.allowedHosts.has(url.hostname.toLowerCase())) {
      throw new BadRequestException(`HTTP integration host ${url.hostname} is not allowlisted`);
    }
  }

  async call(
    integration: HttpIntegrationRow,
    context: Record<string, unknown>,
    cache: Map<string, unknown>
  ): Promise<unknown> {
    const cacheKey = `${integration.id}:${JSON.stringify(context)}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    this.validateUrlTemplate(integration.url_template);
    const url = this.replaceString(integration.url_template, context, true);
    const headers: Record<string,string> = { accept: 'application/json' };
    const secret = integration.auth_secret_env ? this.config.get<string>(integration.auth_secret_env) : undefined;
    if (integration.auth_type !== 'NONE') {
      if (!secret) throw new BadGatewayException(`Authentication secret ${integration.auth_secret_env} is unavailable`);
      const header = integration.auth_header || (integration.auth_type === 'BEARER' ? 'authorization' : 'x-api-key');
      headers[header] = integration.auth_type === 'BEARER' ? `Bearer ${secret}` : secret;
    }
    const request: RequestInit = {
      method: integration.method,
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(integration.timeout_ms)
    };
    if (integration.method !== 'GET' && integration.request_template) {
      headers['content-type'] = 'application/json';
      request.body = JSON.stringify(this.replaceTemplate(integration.request_template, context));
    }
    let response: Response;
    try {
      response = await fetch(url, request);
    } catch (error) {
      throw new BadGatewayException(`HTTP source failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) throw new BadGatewayException(`HTTP source returned ${response.status}`);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > 1_000_000) throw new BadGatewayException('HTTP source response is too large');
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new BadGatewayException('HTTP source did not return JSON'); }
    cache.set(cacheKey,payload);
    return payload;
  }

  readPath(payload: unknown, path: string): unknown {
    return path.split('.').filter(Boolean).reduce<unknown>((current, segment) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string,unknown>)[segment];
    }, payload);
  }

  private replaceTemplate(value: unknown, context: Record<string,unknown>): unknown {
    if (typeof value === 'string') return this.replaceString(value,context,false);
    if (Array.isArray(value)) return value.map((item) => this.replaceTemplate(item,context));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string,unknown>)
          .map(([key,item]) => [key,this.replaceTemplate(item,context)])
      );
    }
    return value;
  }

  private replaceString(value: string, context: Record<string,unknown>, encode: boolean): string {
    return value.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_match,key: string) => {
      if (!(key in context)) throw new BadRequestException(`Unsupported HTTP template variable ${key}`);
      const replacement = String(context[key] ?? '');
      return encode ? encodeURIComponent(replacement) : replacement;
    });
  }
}
