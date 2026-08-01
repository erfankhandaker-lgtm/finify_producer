import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { Client } from 'minio';
import { DataSource } from 'typeorm';
import { AdminTokenPayload, AdminRequestContext } from './admin-auth.types';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const LOGIN_LIMIT = 10;

@Injectable()
export class AdminBiometricService implements OnModuleInit {
  private readonly client: Client;
  private readonly bucket: string;
  private readonly ocrUrl: string;
  private readonly threshold: number;
  private readonly auditSecret: string;

  constructor(private readonly db: DataSource, config: ConfigService) {
    this.bucket = config.get<string>('MINIO_ADMIN_BIOMETRIC_BUCKET') || 'finify-admin-biometric';
    this.ocrUrl = (config.get<string>('KYC_OCR_SERVICE_URL') || 'http://127.0.0.1:8000').replace(/\/+$/, '');
    this.threshold = Number(config.get<string>('ADMIN_FACE_MATCH_THRESHOLD') || 45);
    this.auditSecret = config.get<string>('ADMIN_JWT_SECRET') || config.get<string>('JWTKEY') || 'finify-biometric-audit';
    this.client = new Client({
      endPoint: config.get<string>('MINIO_ENDPOINT') || '127.0.0.1',
      port: Number(config.get<string>('MINIO_PORT') || 9000),
      useSSL: String(config.get<string>('MINIO_USE_SSL') || 'false') === 'true',
      accessKey: config.get<string>('MINIO_ACCESS_KEY') || '',
      secretKey: config.get<string>('MINIO_SECRET_KEY') || '',
    });
  }

  async onModuleInit() {
    try {
      if (!await this.client.bucketExists(this.bucket)) await this.client.makeBucket(this.bucket, 'us-east-1');
    } catch (error) {
      throw new ServiceUnavailableException(`Admin biometric storage is unavailable: ${(error as Error).message}`);
    }
  }

  async enroll(userId: string, file: Express.Multer.File | undefined, actor: AdminTokenPayload) {
    this.assertSuperAdmin(actor);
    this.validateUserId(userId);
    const image = this.validateImage(file);
    const [user] = await this.db.query('SELECT id::text FROM public.admin_users WHERE id=$1::bigint', [userId]);
    if (!user) throw new NotFoundException('Administrator was not found');
    const extension = image.mimetype === 'image/png' ? '.png' : '.jpg';
    const objectKey = `admin-biometric/${userId}/${randomUUID()}${extension}`;
    const digest = createHash('sha256').update(image.buffer).digest('hex');
    await this.client.putObject(this.bucket, objectKey, image.buffer, image.size, {
      'Content-Type': image.mimetype, 'X-Amz-Meta-Sha256': digest, 'X-Amz-Meta-Classification': 'restricted-biometric',
    });
    try {
      const url = await this.client.presignedGetObject(this.bucket, objectKey, 120);
      const match = await this.compare(url, url);
      if (Number(match.referenceFaces) !== 1 || Number(match.probeFaces) !== 1) {
        throw new BadRequestException('Enrollment image must contain exactly one clearly visible face');
      }
      const [previous] = await this.db.query('SELECT object_key AS "objectKey" FROM public.admin_biometric_profiles WHERE user_id=$1::bigint', [userId]);
      await this.db.query(
        `INSERT INTO public.admin_biometric_profiles(user_id,bucket_name,object_key,content_type,sha256,enabled,match_threshold,enrolled_by)
         VALUES($1::bigint,$2,$3,$4,$5,false,$6,$7::bigint)
         ON CONFLICT(user_id) DO UPDATE SET bucket_name=EXCLUDED.bucket_name,object_key=EXCLUDED.object_key,
           content_type=EXCLUDED.content_type,sha256=EXCLUDED.sha256,enabled=false,failed_attempts=0,
           locked_until=NULL,enrolled_by=EXCLUDED.enrolled_by,consent_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`,
        [userId, this.bucket, objectKey, image.mimetype, digest, this.threshold, actor.sub],
      );
      await this.audit(userId, null, 'ENROLL', 'SUCCESS', Number(match.score), 'Reference portrait replaced', actor.sub, null);
      if (previous?.objectKey && previous.objectKey !== objectKey) await this.client.removeObject(this.bucket, previous.objectKey).catch(() => undefined);
      return { enrolled: true, enabled: false, matchThreshold: this.threshold };
    } catch (error) {
      await this.client.removeObject(this.bucket, objectKey).catch(() => undefined);
      throw error;
    }
  }

  async setEnabled(userId: string, enabled: boolean, actor: AdminTokenPayload) {
    this.assertSuperAdmin(actor);
    this.validateUserId(userId);
    const rows = await this.db.query(
      `UPDATE public.admin_biometric_profiles SET enabled=$2,failed_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP
       WHERE user_id=$1::bigint RETURNING enabled,consent_at AS "enrolledAt",last_verified_at AS "lastVerifiedAt"`,
      [userId, enabled],
    );
    if (!rows[0]) throw new ConflictException('Enroll a reference portrait before enabling face sign-in');
    await this.audit(userId, null, enabled ? 'ENABLE' : 'DISABLE', 'SUCCESS', null, null, actor.sub, null);
    return rows[0];
  }

  async photo(userId: string) {
    this.validateUserId(userId);
    const [profile] = await this.db.query(
      `SELECT bucket_name AS bucket,object_key AS "objectKey",content_type AS "contentType" FROM public.admin_biometric_profiles WHERE user_id=$1::bigint`, [userId],
    );
    if (!profile) throw new NotFoundException('No biometric portrait is enrolled');
    return { profile, stream: await this.client.getObject(profile.bucket, profile.objectKey) };
  }

  async challenge(identity: string, context: AdminRequestContext) {
    const normalized = String(identity || '').trim().toLowerCase();
    if (!normalized || normalized.length > 255) throw new BadRequestException('Administrator identity is required');
    const ipHash = this.ipHash(context.ipAddress);
    const [rate] = await this.db.query(
      `SELECT count(*)::int AS count FROM public.admin_biometric_challenges WHERE ip_hash=$1 AND created_at>CURRENT_TIMESTAMP-INTERVAL '15 minutes'`, [ipHash],
    );
    if (Number(rate?.count || 0) >= LOGIN_LIMIT) throw new HttpException('Too many face sign-in attempts. Try again later.', 429);
    const [user] = await this.db.query(
      `SELECT admin.id::text FROM public.admin_users admin JOIN public.admin_biometric_profiles biometric ON biometric.user_id=admin.id
       WHERE (lower(admin.username)=$1 OR lower(admin.email)=$1) AND admin.status='active' AND biometric.enabled=true`, [normalized],
    );
    const id = randomUUID();
    await this.db.query(
      `INSERT INTO public.admin_biometric_challenges(id,user_id,ip_hash,expires_at) VALUES($1::uuid,$2::bigint,$3,CURRENT_TIMESTAMP+INTERVAL '2 minutes')`,
      [id, user?.id || null, ipHash],
    );
    return { challengeId: id, expiresIn: 120 };
  }

  async verify(challengeId: string, file: Express.Multer.File | undefined, context: AdminRequestContext) {
    if (!/^[0-9a-f-]{36}$/i.test(challengeId)) throw this.invalidFace();
    const image = this.validateImage(file);
    const ipHash = this.ipHash(context.ipAddress);
    const challenge = await this.db.transaction(async (manager) => {
      const [locked] = await manager.query(
        `SELECT user_id::text AS "userId"
         FROM public.admin_biometric_challenges
         WHERE id=$1::uuid AND consumed_at IS NULL
           AND expires_at>CURRENT_TIMESTAMP AND ip_hash=$2
         FOR UPDATE`,
        [challengeId, ipHash],
      );
      if (!locked) return null;
      await manager.query(
        `UPDATE public.admin_biometric_challenges
         SET consumed_at=CURRENT_TIMESTAMP WHERE id=$1::uuid`,
        [challengeId],
      );
      return locked;
    });
    if (!challenge?.userId) throw this.invalidFace();
    const [profile] = await this.db.query(
      `SELECT bucket_name AS bucket,object_key AS "objectKey",match_threshold::numeric AS threshold,
              failed_attempts AS "failedAttempts",locked_until AS "lockedUntil",enabled
       FROM public.admin_biometric_profiles WHERE user_id=$1::bigint`, [challenge.userId],
    );
    if (!profile?.enabled || (profile.lockedUntil && new Date(profile.lockedUntil) > new Date())) throw this.invalidFace();
    const probeKey = `admin-biometric-probes/${challengeId}.jpg`;
    await this.client.putObject(this.bucket, probeKey, image.buffer, image.size, { 'Content-Type': image.mimetype });
    let result: any;
    try {
      result = await this.compare(
        await this.client.presignedGetObject(profile.bucket, profile.objectKey, 120),
        await this.client.presignedGetObject(this.bucket, probeKey, 120),
      );
    } finally {
      await this.client.removeObject(this.bucket, probeKey).catch(() => undefined);
    }
    const score = Number(result?.score || 0);
    const passed = result?.matched === true && Number(result?.referenceFaces) === 1 && Number(result?.probeFaces) === 1 && score >= Number(profile.threshold);
    await this.audit(challenge.userId, challengeId, 'LOGIN', passed ? 'SUCCESS' : 'FAILED', score, result?.error || (passed ? 'Face verified' : 'Face did not match'), null, ipHash);
    if (!passed) {
      await this.db.query(
        `UPDATE public.admin_biometric_profiles SET failed_attempts=failed_attempts+1,
         locked_until=CASE WHEN failed_attempts+1>=5 THEN CURRENT_TIMESTAMP+INTERVAL '15 minutes' ELSE locked_until END,
         updated_at=CURRENT_TIMESTAMP WHERE user_id=$1::bigint`, [challenge.userId],
      );
      throw this.invalidFace();
    }
    await this.db.query(
      `UPDATE public.admin_biometric_profiles SET failed_attempts=0,locked_until=NULL,last_verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE user_id=$1::bigint`, [challenge.userId],
    );
    return { userId: challenge.userId, score };
  }

  private async compare(referenceUrl: string, probeUrl: string) {
    const response = await fetch(`${this.ocrUrl}/face-compare`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reference_url: referenceUrl, probe_url: probeUrl }) });
    if (!response.ok) throw new ServiceUnavailableException('KYC biometric matcher is unavailable');
    return response.json();
  }

  private validateImage(file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('A face image is required');
    if (file.size > MAX_IMAGE_BYTES) throw new BadRequestException('Face image must not exceed 5 MB');
    const jpeg = file.mimetype === 'image/jpeg' && file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
    const png = file.mimetype === 'image/png' && file.buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
    if (!jpeg && !png) throw new BadRequestException('Only genuine JPEG or PNG face images are allowed');
    return file;
  }

  private validateUserId(value: string) { if (!/^[1-9]\d*$/.test(value)) throw new BadRequestException('Invalid administrator'); }
  private assertSuperAdmin(actor: AdminTokenPayload) { if (!actor.roles.includes('super_admin')) throw new ForbiddenException('Only a Super Admin can manage biometric login'); }
  private ipHash(ip?: string) { return createHash('sha256').update(`${ip || 'unknown'}:${this.auditSecret}`).digest('hex'); }
  private invalidFace() { return new UnauthorizedException('Face verification could not be completed'); }
  private audit(userId: string | null, challengeId: string | null, action: string, outcome: string, score: number | null, reason: string | null, actorId: string | null, ipHash: string | null) {
    return this.db.query(
      `INSERT INTO public.admin_biometric_audit(user_id,challenge_id,action,outcome,match_score,reason,actor_id,ip_hash)
       VALUES($1::bigint,$2::uuid,$3,$4,$5,$6,$7::bigint,$8)`, [userId, challengeId, action, outcome, score, reason, actorId, ipHash],
    );
  }
}
