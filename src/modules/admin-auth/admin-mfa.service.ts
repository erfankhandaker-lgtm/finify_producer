import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, randomUUID } from 'crypto';
import * as QRCode from 'qrcode';
import { DataSource } from 'typeorm';
import { AdminRequestContext } from './admin-auth.types';

const CHALLENGE_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const TOTP_STEP_SECONDS = 30;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

type EncryptedValue = { ciphertext: string; iv: string; authTag: string };

@Injectable()
export class AdminMfaService {
  constructor(private readonly dataSource: DataSource) {}

  async verifyCaptcha(token: string | undefined, context: AdminRequestContext) {
    const [settings] = await this.dataSource.query(
      `SELECT captcha_enabled,turnstile_secret_ciphertext,turnstile_secret_iv,
              turnstile_secret_auth_tag
       FROM public.admin_security_settings WHERE id = 1`,
    );
    if (!settings?.captcha_enabled) return;

    const secret = settings?.turnstile_secret_ciphertext
      ? this.decrypt({
          ciphertext: settings.turnstile_secret_ciphertext,
          iv: settings.turnstile_secret_iv,
          authTag: settings.turnstile_secret_auth_tag,
        })
      : process.env.TURNSTILE_SECRET_KEY;
    if (!secret) throw new ServiceUnavailableException('CAPTCHA is enabled but is not configured');
    if (!token) throw new UnauthorizedException('Complete the security check and try again');

    try {
      const body = new URLSearchParams({ secret, response: token });
      if (context.ipAddress) body.set('remoteip', context.ipAddress);
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(5000),
      });
      const result = await response.json() as { success?: boolean };
      if (!response.ok || !result.success) throw new Error('CAPTCHA rejected');
    } catch {
      throw new UnauthorizedException('The security check could not be verified');
    }
  }

  async bootstrapSettings() {
    const [settings] = await this.dataSource.query(
      `SELECT captcha_enabled,turnstile_site_key,mfa_issuer
       FROM public.admin_security_settings WHERE id=1`,
    );
    return {
      captchaEnabled: settings?.captcha_enabled !== false,
      turnstileSiteKey: settings?.turnstile_site_key || process.env.TURNSTILE_SITE_KEY || '',
      mfaIssuer: settings?.mfa_issuer || process.env.ADMIN_MFA_ISSUER || 'Finify Admin',
    };
  }

  async securitySettings() {
    const [settings] = await this.dataSource.query(
      `SELECT captcha_enabled,turnstile_site_key,mfa_issuer,
              turnstile_secret_ciphertext IS NOT NULL AS database_secret_configured,
              updated_at,updated_by
       FROM public.admin_security_settings WHERE id=1`,
    );
    const databaseSecret = Boolean(settings?.database_secret_configured);
    return {
      captchaEnabled: settings?.captcha_enabled !== false,
      turnstileSiteKey: settings?.turnstile_site_key || process.env.TURNSTILE_SITE_KEY || '',
      turnstileSecretConfigured: databaseSecret || Boolean(process.env.TURNSTILE_SECRET_KEY),
      turnstileSecretSource: databaseSecret ? 'SECURE_DATABASE' : process.env.TURNSTILE_SECRET_KEY ? 'ENVIRONMENT' : 'MISSING',
      mfaIssuer: settings?.mfa_issuer || process.env.ADMIN_MFA_ISSUER || 'Finify Admin',
      encryptionKeyConfigured: Boolean(process.env.ADMIN_MFA_ENCRYPTION_KEY || process.env.ADMIN_JWT_SECRET || process.env.JWTKEY),
      encryptionKeyManagedExternally: true,
      updatedAt: settings?.updated_at || null,
      updatedBy: settings?.updated_by ? String(settings.updated_by) : null,
    };
  }

  async updateSecuritySettings(input: {
    captchaEnabled: boolean;
    turnstileSiteKey: string;
    turnstileSecret?: string;
    mfaIssuer: string;
  }, actorId: string) {
    const siteKey = input.turnstileSiteKey.trim();
    const issuer = input.mfaIssuer.trim();
    if (input.captchaEnabled && !siteKey) {
      throw new BadRequestException('A Turnstile site key is required before CAPTCHA can be enabled');
    }
    const encrypted = input.turnstileSecret?.trim() ? this.encrypt(input.turnstileSecret.trim()) : null;
    await this.dataSource.transaction(async (manager) => {
      const [current] = await manager.query(
        'SELECT turnstile_secret_ciphertext FROM public.admin_security_settings WHERE id=1 FOR UPDATE',
      );
      if (input.captchaEnabled && !encrypted && !current?.turnstile_secret_ciphertext && !process.env.TURNSTILE_SECRET_KEY) {
        throw new BadRequestException('A Turnstile secret key is required before CAPTCHA can be enabled');
      }
      await manager.query(
        `UPDATE public.admin_security_settings SET
           captcha_enabled=$1,turnstile_site_key=$2,mfa_issuer=$3,
           turnstile_secret_ciphertext=CASE WHEN $4::boolean THEN $5 ELSE turnstile_secret_ciphertext END,
           turnstile_secret_iv=CASE WHEN $4::boolean THEN $6 ELSE turnstile_secret_iv END,
           turnstile_secret_auth_tag=CASE WHEN $4::boolean THEN $7 ELSE turnstile_secret_auth_tag END,
           updated_by=$8,updated_at=CURRENT_TIMESTAMP
         WHERE id=1`,
        [input.captchaEnabled, siteKey || null, issuer, Boolean(encrypted), encrypted?.ciphertext || null,
          encrypted?.iv || null, encrypted?.authTag || null, actorId],
      );
      await this.audit(manager, actorId, null, 'SECURITY_SETTINGS_UPDATED', 'SUCCESS', null, undefined, actorId);
    });
    return this.securitySettings();
  }

  async beginLogin(userId: string, context: AdminRequestContext) {
    const id = randomUUID();
    const [profile] = await this.dataSource.query(
      'SELECT enabled FROM public.admin_mfa_profiles WHERE user_id = $1',
      [userId],
    );
    await this.dataSource.query(
      `INSERT INTO public.admin_mfa_challenges
       (id, user_id, purpose, ip_hash, expires_at)
       VALUES ($1, $2, 'LOGIN', $3, CURRENT_TIMESTAMP + ($4 * INTERVAL '1 minute'))`,
      [id, userId, this.ipHash(context), CHALLENGE_MINUTES],
    );
    return {
      requiresMfa: true,
      enrollmentRequired: !profile?.enabled,
      challengeId: id,
      expiresIn: CHALLENGE_MINUTES * 60,
    };
  }

  async startEnrollment(challengeId: string, context: AdminRequestContext) {
    return this.dataSource.transaction(async (manager) => {
      const [challenge] = await manager.query(
        `SELECT c.*, u.username, u.email
         FROM public.admin_mfa_challenges c
         JOIN public.admin_users u ON u.id = c.user_id
         WHERE c.id = $1 AND c.expires_at > CURRENT_TIMESTAMP FOR UPDATE OF c`,
        [challengeId],
      );
      this.assertChallenge(challenge, context, ['LOGIN', 'RECOVERY_ENROLLMENT']);
      if (challenge.purpose === 'LOGIN') {
        const [profile] = await manager.query(
          'SELECT enabled FROM public.admin_mfa_profiles WHERE user_id = $1', [challenge.user_id],
        );
        if (profile?.enabled) throw new UnauthorizedException('Authenticator is already active');
      }

      const secret = this.base32(randomBytes(20));
      const encrypted = this.encrypt(secret);
      await manager.query(
        `UPDATE public.admin_mfa_challenges
         SET purpose = $2, pending_secret_ciphertext = $3,
             pending_secret_iv = $4, pending_secret_auth_tag = $5
         WHERE id = $1`,
        [challengeId, challenge.purpose === 'RECOVERY_ENROLLMENT' ? 'RECOVERY_ENROLLMENT' : 'ENROLLMENT',
          encrypted.ciphertext, encrypted.iv, encrypted.authTag],
      );
      await this.audit(manager, challenge.user_id, challengeId, 'ENROLLMENT_STARTED', 'SUCCESS', null, context);
      return this.enrollmentDetails(secret, challenge.username, challenge.email);
    });
  }

  async confirmEnrollment(challengeId: string, code: string, context: AdminRequestContext) {
    const result = await this.dataSource.transaction(async (manager) => {
      const [challenge] = await manager.query(
        `SELECT * FROM public.admin_mfa_challenges WHERE id = $1 AND expires_at > CURRENT_TIMESTAMP FOR UPDATE`, [challengeId],
      );
      this.assertChallenge(challenge, context, ['ENROLLMENT', 'RECOVERY_ENROLLMENT']);
      if (!challenge.pending_secret_ciphertext) throw new UnauthorizedException('Authenticator setup has not started');
      const secret = this.decrypt({
        ciphertext: challenge.pending_secret_ciphertext,
        iv: challenge.pending_secret_iv,
        authTag: challenge.pending_secret_auth_tag,
      });
      const counter = this.matchingCounter(secret, code);
      if (counter === null) {
        return this.failedChallenge(manager, challenge, context, 'ENROLLMENT_CODE');
      }

      const activeSecret = this.encrypt(secret);
      const recoveryPin = this.generateRecoveryPin();
      const recoveryPinHash = await bcrypt.hash(this.normalizePin(recoveryPin), 12);
      await manager.query(
        `INSERT INTO public.admin_mfa_profiles
           (user_id, secret_ciphertext, secret_iv, secret_auth_tag, enabled, enrolled_at,
            last_used_counter, recovery_pin_hash, recovery_pin_used_at, failed_attempts, locked_until, updated_at)
         VALUES ($1,$2,$3,$4,true,CURRENT_TIMESTAMP,$5,$6,NULL,0,NULL,CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) DO UPDATE SET
           secret_ciphertext=EXCLUDED.secret_ciphertext, secret_iv=EXCLUDED.secret_iv,
           secret_auth_tag=EXCLUDED.secret_auth_tag, enabled=true, enrolled_at=CURRENT_TIMESTAMP,
           last_used_counter=EXCLUDED.last_used_counter, recovery_pin_hash=EXCLUDED.recovery_pin_hash,
           recovery_pin_used_at=NULL, failed_attempts=0, locked_until=NULL, updated_at=CURRENT_TIMESTAMP`,
        [challenge.user_id, activeSecret.ciphertext, activeSecret.iv, activeSecret.authTag, counter, recoveryPinHash],
      );
      await manager.query(
        'UPDATE public.admin_mfa_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = $1', [challengeId],
      );
      await this.audit(manager, challenge.user_id, challengeId, 'ENROLLMENT_CONFIRMED', 'SUCCESS', null, context);
      return { userId: String(challenge.user_id), recoveryPin };
    });
    if ('failure' in result) throw new UnauthorizedException('Verification failed');
    return result;
  }

  async verify(challengeId: string, code: string, context: AdminRequestContext) {
    const result = await this.dataSource.transaction(async (manager) => {
      const [challenge] = await manager.query(
        `SELECT c.*, p.secret_ciphertext, p.secret_iv, p.secret_auth_tag, p.enabled,
                p.last_used_counter, p.failed_attempts, p.locked_until
         FROM public.admin_mfa_challenges c
         JOIN public.admin_mfa_profiles p ON p.user_id = c.user_id
         WHERE c.id = $1 AND c.expires_at > CURRENT_TIMESTAMP FOR UPDATE OF c, p`, [challengeId],
      );
      this.assertChallenge(challenge, context, ['LOGIN']);
      if (!challenge.enabled || (challenge.locked_until && new Date(challenge.locked_until) > new Date())) {
        throw new UnauthorizedException('Authenticator verification is temporarily locked');
      }
      const secret = this.decrypt({
        ciphertext: challenge.secret_ciphertext, iv: challenge.secret_iv, authTag: challenge.secret_auth_tag,
      });
      const counter = this.matchingCounter(secret, code);
      if (counter === null || (challenge.last_used_counter !== null && counter <= Number(challenge.last_used_counter))) {
        await manager.query(
          `UPDATE public.admin_mfa_profiles SET failed_attempts = failed_attempts + 1,
             locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes' ELSE locked_until END,
             updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
          [challenge.user_id, MAX_ATTEMPTS],
        );
        return this.failedChallenge(manager, challenge, context, 'TOTP_CODE');
      }
      await manager.query(
        `UPDATE public.admin_mfa_profiles SET last_used_counter=$2, failed_attempts=0,
         locked_until=NULL, updated_at=CURRENT_TIMESTAMP WHERE user_id=$1`, [challenge.user_id, counter],
      );
      await manager.query('UPDATE public.admin_mfa_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE id=$1', [challengeId]);
      await this.audit(manager, challenge.user_id, challengeId, 'TOTP_VERIFIED', 'SUCCESS', null, context);
      return { userId: String(challenge.user_id) };
    });
    if ('failure' in result) throw new UnauthorizedException('Verification failed');
    return result;
  }

  async recover(challengeId: string, recoveryPin: string, context: AdminRequestContext) {
    const result = await this.dataSource.transaction(async (manager) => {
      const [challenge] = await manager.query(
        `SELECT c.*, p.recovery_pin_hash, p.recovery_pin_used_at, p.enabled
         FROM public.admin_mfa_challenges c JOIN public.admin_mfa_profiles p ON p.user_id=c.user_id
         WHERE c.id=$1 AND c.expires_at > CURRENT_TIMESTAMP FOR UPDATE OF c, p`, [challengeId],
      );
      this.assertChallenge(challenge, context, ['LOGIN']);
      const valid = challenge.enabled && challenge.recovery_pin_hash && !challenge.recovery_pin_used_at
        && await bcrypt.compare(this.normalizePin(recoveryPin), challenge.recovery_pin_hash);
      if (!valid) return this.failedChallenge(manager, challenge, context, 'RECOVERY_PIN');

      await manager.query(
        `UPDATE public.admin_mfa_profiles SET recovery_pin_used_at=CURRENT_TIMESTAMP,
         updated_at=CURRENT_TIMESTAMP WHERE user_id=$1`, [challenge.user_id],
      );
      await manager.query(
        `UPDATE public.admin_mfa_challenges SET purpose='RECOVERY_ENROLLMENT',
         attempt_count=0, expires_at=CURRENT_TIMESTAMP + ($2 * INTERVAL '1 minute') WHERE id=$1`,
        [challengeId, CHALLENGE_MINUTES],
      );
      await this.audit(manager, challenge.user_id, challengeId, 'RECOVERY_PIN_VERIFIED', 'SUCCESS', null, context);
      return { challengeId, enrollmentRequired: true, expiresIn: CHALLENGE_MINUTES * 60 };
    });
    if ('failure' in result) throw new UnauthorizedException('Verification failed');
    return result;
  }

  async status(userId: string) {
    const [profile] = await this.dataSource.query(
      `SELECT enabled, enrolled_at, recovery_pin_used_at, failed_attempts, locked_until
       FROM public.admin_mfa_profiles WHERE user_id=$1`, [userId],
    );
    return {
      enabled: Boolean(profile?.enabled),
      enrolledAt: profile?.enrolled_at || null,
      recoveryPinAvailable: Boolean(profile?.enabled && !profile?.recovery_pin_used_at),
      failedAttempts: Number(profile?.failed_attempts || 0),
      lockedUntil: profile?.locked_until || null,
    };
  }

  async reset(userId: string, actorId: string) {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO public.admin_mfa_profiles (user_id, enabled)
         VALUES ($1,false) ON CONFLICT (user_id) DO UPDATE SET enabled=false,
         secret_ciphertext=NULL, secret_iv=NULL, secret_auth_tag=NULL, enrolled_at=NULL,
         last_used_counter=NULL, recovery_pin_hash=NULL, recovery_pin_used_at=NULL,
         failed_attempts=0, locked_until=NULL, updated_at=CURRENT_TIMESTAMP`, [userId],
      );
      await manager.query('UPDATE public.admin_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
      await this.audit(manager, userId, null, 'MFA_RESET', 'SUCCESS', null, undefined, actorId);
    });
    return { success: true };
  }

  private async enrollmentDetails(secret: string, username: string, email: string) {
    const label = encodeURIComponent(`${username} (${email})`);
    const [settings] = await this.dataSource.query(
      'SELECT mfa_issuer FROM public.admin_security_settings WHERE id=1',
    );
    const issuer = encodeURIComponent(settings?.mfa_issuer || process.env.ADMIN_MFA_ISSUER || 'Finify Admin');
    const uri = `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    return { manualKey: secret, qrCodeDataUrl: await QRCode.toDataURL(uri, { width: 240, margin: 1 }) };
  }

  private assertChallenge(challenge: any, context: AdminRequestContext, purposes: string[]) {
    if (!challenge || challenge.consumed_at
      || challenge.attempt_count >= MAX_ATTEMPTS || !purposes.includes(challenge.purpose)
      || challenge.ip_hash !== this.ipHash(context)) {
      throw new UnauthorizedException('MFA challenge is invalid or expired');
    }
  }

  private async failedChallenge(manager: any, challenge: any, context: AdminRequestContext, reason: string) {
    await manager.query('UPDATE public.admin_mfa_challenges SET attempt_count=attempt_count+1 WHERE id=$1', [challenge.id]);
    await this.audit(manager, challenge.user_id, challenge.id, reason, 'FAILED', 'Verification failed', context);
    return { failure: true as const };
  }

  private matchingCounter(secret: string, code: string) {
    const current = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
    for (let offset = -1; offset <= 1; offset += 1) {
      const counter = current + offset;
      if (this.totp(secret, counter) === code) return counter;
    }
    return null;
  }

  private totp(secret: string, counter: number) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac('sha1', this.base32Decode(secret)).update(buffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
    return String(binary).padStart(6, '0');
  }

  private encrypt(value: string): EncryptedValue {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return { ciphertext: encrypted.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
  }

  private decrypt(value: EncryptedValue) {
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(value.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(value.authTag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }

  private encryptionKey() {
    const source = process.env.ADMIN_MFA_ENCRYPTION_KEY || process.env.ADMIN_JWT_SECRET || process.env.JWTKEY;
    if (!source) throw new ServiceUnavailableException('MFA encryption is not configured');
    return createHash('sha256').update(source).digest();
  }

  private generateRecoveryPin() {
    let digits = '';
    for (let i = 0; i < 12; i += 1) digits += randomInt(0, 10);
    return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  private normalizePin(pin: string) { return pin.replace(/[^0-9]/g, ''); }
  private ipHash(context?: AdminRequestContext) { return createHash('sha256').update(context?.ipAddress || 'unknown').digest('hex'); }

  private base32(buffer: Buffer) {
    let bits = '';
    for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
    let output = '';
    for (let i = 0; i < bits.length; i += 5) output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
    return output;
  }

  private base32Decode(value: string) {
    let bits = '';
    for (const char of value.replace(/=+$/, '').toUpperCase()) bits += BASE32_ALPHABET.indexOf(char).toString(2).padStart(5, '0');
    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    return Buffer.from(bytes);
  }

  private async audit(manager: any, userId: string, challengeId: string | null, action: string, outcome: string,
    reason: string | null, context?: AdminRequestContext, actorId?: string) {
    await manager.query(
      `INSERT INTO public.admin_mfa_audit
       (user_id,challenge_id,action,outcome,reason,actor_id,ip_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, challengeId, action, outcome, reason, actorId || null, context ? this.ipHash(context) : null],
    );
  }
}
