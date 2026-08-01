import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { extname } from 'path';
import { Client } from 'minio';
import { DataSource } from 'typeorm';

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const CONTENT_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
]);

@Injectable()
export class TreasuryDocumentService implements OnModuleInit {
  private readonly bucket: string;
  private readonly client: Client;

  constructor(
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.bucket = config.get<string>('MINIO_TREASURY_BUCKET')
      || 'finify-treasury-documents';
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
      if (!await this.client.bucketExists(this.bucket)) {
        await this.client.makeBucket(this.bucket, 'us-east-1');
      }
    } catch (error) {
      throw new ServiceUnavailableException(
        `Treasury document storage is unavailable: ${(error as Error).message}`,
      );
    }
  }

  async upload(file: Express.Multer.File | undefined, actor: string) {
    this.validateFile(file);
    const safeFile = file as Express.Multer.File;
    const digest = createHash('sha256').update(safeFile.buffer).digest('hex');
    const date = new Date();
    const extension = this.extensionFor(safeFile.mimetype);
    const objectKey = [
      'treasury',
      String(date.getUTCFullYear()),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      `${randomUUID()}${extension}`,
    ].join('/');

    try {
      await this.client.putObject(
        this.bucket,
        objectKey,
        safeFile.buffer,
        safeFile.size,
        {
          'Content-Type': safeFile.mimetype,
          'X-Amz-Meta-Sha256': digest,
          'X-Amz-Meta-Uploaded-By': actor,
        },
      );
      const [document] = await this.dataSource.query(
        `INSERT INTO public.treasury_documents(
           bucket_name,object_key,original_name,content_type,size_bytes,sha256,
           uploaded_by
         ) VALUES($1,$2,$3,$4,$5,$6,$7)
         RETURNING id::text,original_name AS "originalName",
                   content_type AS "contentType",size_bytes::text AS "sizeBytes",
                   sha256,status,uploaded_at AS "uploadedAt"`,
        [
          this.bucket,
          objectKey,
          this.safeOriginalName(safeFile.originalname),
          safeFile.mimetype,
          safeFile.size,
          digest,
          actor,
        ],
      );
      return {
        ...document,
        evidenceReference: `MINIO_DOCUMENT:${document.id}`,
      };
    } catch (error) {
      await this.client.removeObject(this.bucket, objectKey).catch(() => undefined);
      throw error;
    }
  }

  async download(id: string, actor: string) {
    if (!/^\d+$/.test(id)) throw new BadRequestException('Invalid treasury document');
    const [document] = await this.dataSource.query(
      `SELECT id::text,treasury_request_id::text AS "treasuryRequestId",
              bucket_name AS bucket,object_key AS "objectKey",
              original_name AS "originalName",content_type AS "contentType",
              size_bytes::text AS "sizeBytes",status,uploaded_by AS "uploadedBy"
       FROM public.treasury_documents WHERE id=$1::bigint`,
      [id],
    );
    if (!document) throw new NotFoundException('Treasury document was not found');
    if (document.status === 'UPLOADED'
      && document.uploadedBy.trim().toLowerCase() !== actor.trim().toLowerCase()) {
      throw new NotFoundException('Treasury document was not found');
    }
    try {
      return {
        document,
        stream: await this.client.getObject(document.bucket, document.objectKey),
      };
    } catch {
      throw new ServiceUnavailableException('Treasury document could not be read');
    }
  }

  async removeUnattached(id: string, actor: string) {
    if (!/^\d+$/.test(id)) throw new BadRequestException('Invalid treasury document');
    return this.dataSource.transaction(async manager => {
      const [document] = await manager.query(
        `SELECT id::text,bucket_name AS bucket,object_key AS "objectKey",
                status,uploaded_by AS "uploadedBy"
         FROM public.treasury_documents WHERE id=$1::bigint FOR UPDATE`,
        [id],
      );
      if (!document) return { deleted: true };
      if (document.status !== 'UPLOADED') {
        throw new ConflictException('An attached treasury document cannot be deleted');
      }
      if (document.uploadedBy.trim().toLowerCase() !== actor.trim().toLowerCase()) {
        throw new NotFoundException('Treasury document was not found');
      }
      await this.client.removeObject(document.bucket, document.objectKey);
      await manager.query(
        `DELETE FROM public.treasury_documents WHERE id=$1::bigint`,
        [id],
      );
      return { deleted: true };
    });
  }

  private validateFile(file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('A bank transaction document is required');
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException('Bank transaction document must not exceed 10 MB');
    }
    if (!CONTENT_TYPES.has(file.mimetype) || !this.signatureMatches(file)) {
      throw new BadRequestException('Only genuine PDF, PNG, or JPEG documents are allowed');
    }
  }

  private signatureMatches(file: Express.Multer.File) {
    const bytes = file.buffer;
    if (file.mimetype === 'application/pdf') {
      return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
    }
    if (file.mimetype === 'image/png') {
      return bytes.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
    }
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  private extensionFor(contentType: string) {
    if (contentType === 'application/pdf') return '.pdf';
    if (contentType === 'image/png') return '.png';
    return '.jpg';
  }

  private safeOriginalName(value: string) {
    const extension = extname(value).slice(0, 10);
    const stem = value.slice(0, Math.max(0, value.length - extension.length))
      .replace(/[^a-zA-Z0-9._ -]/g, '_')
      .trim()
      .slice(0, 230) || 'bank-document';
    return `${stem}${extension.toLowerCase()}`;
  }
}
