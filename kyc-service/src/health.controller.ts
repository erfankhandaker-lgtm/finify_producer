import { Controller, Get, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE } from './database';
import { KycStorageService } from './kyc-storage.service';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: Pool,
    private readonly storage: KycStorageService,
  ) {}

  @Get()
  async health() {
    await this.db.query('SELECT 1 FROM kyc.cases LIMIT 1');
    const storage = await this.storage.readiness();
    let ocr = false;
    try {
      const response = await fetch(
        `${(process.env.KYC_OCR_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')}/health`,
        { signal: AbortSignal.timeout(2000) },
      );
      ocr = response.ok;
    } catch {}
    return {
      status: storage && ocr ? 'ok' : 'degraded',
      service: 'finify-kyc-service',
      database: 'connected',
      storage: storage ? 'connected' : 'unavailable',
      ocr: ocr ? 'connected' : 'unavailable',
    };
  }
}
