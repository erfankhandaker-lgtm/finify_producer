import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type AmlOutcome = 'COMPLETED' | 'RELEASED' | 'REVERSED';

interface AmlFinalizeResult {
  success: boolean;
  statusCode: string;
  statusMessage: string;
  reservationStatus: string | null;
}

@Injectable()
export class AmlSummaryService {
  private readonly logger = new Logger(AmlSummaryService.name);

  constructor(private readonly dataSource: DataSource) {}

  async finalize(transactionId: string, outcome: AmlOutcome): Promise<AmlFinalizeResult> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT * FROM public.sw_proc_aml_finalize($1::bigint,$2::varchar)`,
      [transactionId, outcome],
    );
    const row = rows[0];
    if (!row) throw new Error('AML finalization function returned no result');
    const result = {
      success: row.success === true,
      statusCode: String(row.status_code ?? 'UNKNOWN'),
      statusMessage: String(row.status_message ?? ''),
      reservationStatus: row.reservation_status === null || row.reservation_status === undefined
        ? null : String(row.reservation_status),
    };

    // Messages produced before migration 011 and system-keyword messages have no reservation.
    if (!result.success && result.statusCode === 'RESERVATION_NOT_FOUND') {
      this.logger.warn(`No AML reservation found for transaction ${transactionId}; summary was not changed`);
      return result;
    }
    if (!result.success) {
      throw new Error(`AML ${outcome.toLowerCase()} failed for transaction ${transactionId}: ${result.statusCode} ${result.statusMessage}`);
    }
    return result;
  }
}
