import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

@Injectable()
export class IntegrationSecretService {
  private readonly configuredSecret: string | undefined;

  constructor(config: ConfigService) {
    this.configuredSecret = config.get<string>('INTEGRATION_SECRET_KEY');
  }

  encryptObject(value: Record<string, unknown>): string {
    const key = this.key();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
  }

  decryptObject(value: string | null): Record<string, unknown> {
    if (!value) {
      return {};
    }
    const [ivValue, tagValue, encryptedValue] = value.split('.');
    if (!ivValue || !tagValue || !encryptedValue) {
      throw new Error('Stored integration secret is malformed');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(decrypted) as Record<string, unknown>;
  }

  encryptString(value: string): string {
    return this.encryptObject({ value });
  }

  decryptString(value: string | null): string | null {
    const decrypted = this.decryptObject(value).value;
    return typeof decrypted === 'string' ? decrypted : null;
  }

  verifyApiKey(provided: string | undefined, encryptedExpected: string | null): boolean {
    const expected = this.decryptString(encryptedExpected);
    if (!provided || !expected) {
      return false;
    }
    return this.safeEqual(provided, expected);
  }

  verifyHmac(rawBody: string, signature: string | undefined, encryptedSecret: string | null): boolean {
    const secret = this.decryptString(encryptedSecret);
    if (!signature || !secret) {
      return false;
    }
    const provided = signature.replace(/^sha256=/i, '');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    return this.safeEqual(provided, expected);
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private key(): Buffer {
    if (!this.configuredSecret || this.configuredSecret.length < 32) {
      throw new BadRequestException('INTEGRATION_SECRET_KEY must be configured with at least 32 characters before storing or using secrets');
    }
    return createHash('sha256').update(this.configuredSecret).digest();
  }
}
