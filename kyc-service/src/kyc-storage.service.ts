import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import * as Minio from 'minio';

@Injectable()
export class KycStorageService implements OnModuleInit {
  readonly bucket = process.env.MINIO_KYC_BUCKET || 'finify-kyc-documents';
  private readonly client = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || '',
    secretKey: process.env.MINIO_SECRET_KEY || '',
  });

  async onModuleInit() {
    if (!await this.client.bucketExists(this.bucket)) {
      await this.client.makeBucket(this.bucket);
    }
    try {
      await this.client.setBucketPolicy(this.bucket, '');
    } catch {
      // A bucket without a policy is already private.
    }
  }

  validate(file: Express.Multer.File) {
    if (!file || !file.buffer?.length) throw new BadRequestException('Document file is required');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('Document exceeds 10 MB');
    const bytes = file.buffer;
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!jpeg && !png) throw new BadRequestException('Only genuine JPEG or PNG images are accepted');
    return {
      contentType: jpeg ? 'image/jpeg' : 'image/png',
      extension: jpeg ? 'jpg' : 'png',
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }

  async upload(caseId: string, role: string, file: Express.Multer.File) {
    const validated = this.validate(file);
    const key = `cases/${caseId}/${role.toLowerCase()}/${randomUUID()}.${validated.extension}`;
    try {
      await this.client.putObject(this.bucket, key, file.buffer, file.size, {
        'Content-Type': validated.contentType,
        'X-Amz-Meta-Classification': 'restricted-kyc',
      });
      return { ...validated, bucket: this.bucket, key };
    } catch {
      throw new InternalServerErrorException('KYC document storage is unavailable');
    }
  }

  presigned(key: string, seconds = 300) {
    return this.client.presignedGetObject(this.bucket, key, seconds);
  }

  async readiness() {
    return this.client.bucketExists(this.bucket);
  }
}
