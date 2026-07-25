import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FieldMappingService } from './field-mapping.service';
import { IntegrationKafkaPublisherService } from './integration-kafka-publisher.service';
import { IntegrationSecretService } from './integration-secret.service';
import { MappingContext, MerchantIntegrationConfig } from './integration.types';
import { interpretMerchantConfirmation, MerchantConfirmationDecision } from './merchant-confirmation';

export interface MerchantDispatchResult {
  channel: 'API' | 'KAFKA';
  decision: MerchantConfirmationDecision | 'PENDING';
  httpStatus?: number;
  body?: unknown;
  code?: string;
  message?: string;
  externalReference?: string;
  topic?: string;
}

interface CachedToken { value: string; expiresAt: number }

@Injectable()
export class MerchantDispatchService {
  private readonly tokens = new Map<string, CachedToken>();
  private readonly callbackUrl: string;

  constructor(
    private readonly mapper: FieldMappingService,
    private readonly secrets: IntegrationSecretService,
    private readonly publisher: IntegrationKafkaPublisherService,
    config: ConfigService,
  ) {
    this.callbackUrl = config.get<string>('MERCHANT_CONFIRMATION_PUBLIC_URL', 'http://localhost:5003/v1/merchant-confirmations');
  }

  async dispatch(
    config: MerchantIntegrationConfig,
    message: Record<string, unknown>,
    transaction: Record<string, unknown>,
    correlationId: string,
    idempotencyKey: string,
  ): Promise<MerchantDispatchResult> {
    const context: MappingContext = {
      message,
      transaction,
      system: { correlationId, idempotencyKey, callbackUrl: this.callbackUrl, configurationVersion: config.version },
      secret: this.secrets.decryptObject(config.auth.secretsCiphertext),
    };
    const mapped = this.mapper.map(config.requestMapping, context);
    const envelope = {
      ...mapped.body,
      _finify: {
        correlationId,
        transactionId: String(transaction.transactionId ?? message.TransactionId ?? ''),
        idempotencyKey,
        callbackUrl: this.callbackUrl,
        configurationVersion: config.version,
        merchantMsisdn: config.merchantMsisdn,
      },
    };

    if (config.channel === 'KAFKA') {
      if (!config.kafkaTopic) throw new Error('Active KAFKA integration has no topic');
      const key = this.mapper.resolve(config.kafkaMessageKeySource, context)
        ?? String(transaction.transactionId ?? message.TransactionId ?? correlationId);
      await this.publisher.publish(config.kafkaTopic, key, envelope);
      return { channel: 'KAFKA', decision: 'PENDING', topic: config.kafkaTopic };
    }

    if (!config.apiUrl) throw new Error('Active API integration has no API URL');
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json', ...mapped.headers };
    headers['idempotency-key'] = idempotencyKey;
    headers['x-finify-correlation-id'] = correlationId;
    headers['x-finify-transaction-id'] = String(transaction.transactionId ?? message.TransactionId ?? '');
    if (config.auth.type === 'LOGIN_BEARER') {
      headers[config.auth.finalHeader] = await this.bearerHeader(config, context);
    }
    const url = this.buildUrl(config.apiUrl, mapped.path, mapped.query);
    const response = await this.fetchWithRetries(url, {
      method: config.apiMethod,
      headers,
      body: JSON.stringify(envelope),
    }, config.timeoutMs, config.maxRetries);
    const body = await this.readBody(response);
    const interpreted = this.interpretResponse(config, response.status, body);
    return { channel: 'API', httpStatus: response.status, body, ...interpreted };
  }

  private async bearerHeader(config: MerchantIntegrationConfig, context: MappingContext): Promise<string> {
    const cached = this.tokens.get(config.id);
    if (cached && cached.expiresAt > Date.now() + 30000) return `${config.auth.tokenPrefix} ${cached.value}`.trim();
    if (!config.auth.loginUrl || !config.auth.tokenPath) throw new Error('LOGIN_BEARER configuration is incomplete');
    const mapped = this.mapper.map(config.auth.loginMapping, context);
    const url = this.buildUrl(config.auth.loginUrl, mapped.path, mapped.query);
    const response = await this.fetchWithRetries(url, {
      method: config.auth.loginMethod,
      headers: { 'content-type': 'application/json', accept: 'application/json', ...config.auth.loginHeaders, ...mapped.headers },
      body: JSON.stringify(mapped.body),
    }, config.timeoutMs, config.maxRetries);
    const body = await this.readBody(response);
    if (!response.ok || typeof body !== 'object' || body === null) throw new Error(`Merchant login failed with HTTP ${response.status}`);
    const token = this.mapper.readPath(body as Record<string, unknown>, config.auth.tokenPath);
    if (typeof token !== 'string' || !token) throw new Error(`Merchant login token was not found at ${config.auth.tokenPath}`);
    const expiryValue = config.auth.expiresInPath
      ? Number(this.mapper.readPath(body as Record<string, unknown>, config.auth.expiresInPath)) : 300;
    const expirySeconds = Number.isFinite(expiryValue) && expiryValue > 0 ? expiryValue : 300;
    this.tokens.set(config.id, { value: token, expiresAt: Date.now() + expirySeconds * 1000 });
    return `${config.auth.tokenPrefix} ${token}`.trim();
  }

  private interpretResponse(config: MerchantIntegrationConfig, httpStatus: number, body: unknown): Omit<MerchantDispatchResult, 'channel'> {
    const mapping = config.responseMapping;
    if (mapping.decisionPath && typeof body === 'object' && body !== null) {
      const raw = this.mapper.readPath(body as Record<string, unknown>, mapping.decisionPath);
      const value = raw === undefined || raw === null ? undefined : String(raw).toUpperCase();
      const approved = new Set((mapping.approvedValues ?? []).map((item) => item.toUpperCase()));
      const rejected = new Set((mapping.rejectedValues ?? []).map((item) => item.toUpperCase()));
      const decision = value && approved.has(value) ? 'APPROVED'
        : value && rejected.has(value) ? 'REJECTED' : 'UNKNOWN';
      return {
        decision,
        code: mapping.codePath ? this.stringPath(body, mapping.codePath) : undefined,
        message: mapping.messagePath ? this.stringPath(body, mapping.messagePath) : undefined,
        externalReference: mapping.externalReferencePath ? this.stringPath(body, mapping.externalReferencePath) : undefined,
      };
    }
    const fallback = interpretMerchantConfirmation(httpStatus, body);
    return { decision: fallback.decision, code: fallback.code, message: fallback.message };
  }

  private stringPath(body: unknown, path: string): string | undefined {
    if (typeof body !== 'object' || body === null) return undefined;
    const value = this.mapper.readPath(body as Record<string, unknown>, path);
    return value === undefined || value === null ? undefined : String(value);
  }

  private buildUrl(base: string, pathValues: Record<string, string>, queryValues: Record<string, string>): string {
    let rendered = base;
    for (const [key, value] of Object.entries(pathValues)) {
      rendered = rendered.replaceAll(`{${key}}`, encodeURIComponent(value));
    }
    const url = new URL(rendered);
    for (const [key, value] of Object.entries(queryValues)) url.searchParams.set(key, value);
    return url.toString();
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetch(url, { ...init, signal: controller.signal }); }
    finally { clearTimeout(timer); }
  }

  private async fetchWithRetries(url: string, init: RequestInit, timeoutMs: number, maxRetries: number): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(url, init, timeoutMs);
        if (response.status < 500 || attempt === maxRetries) return response;
        await response.text();
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) throw error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Merchant request failed');
  }

  private async readBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text) as unknown; }
    catch { return { raw: text.slice(0, 4000) }; }
  }
}
