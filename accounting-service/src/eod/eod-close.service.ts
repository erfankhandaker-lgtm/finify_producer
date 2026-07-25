import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountingLoggerService } from '../common/accounting-logger.service';

export interface EodCloseResult {
  success: boolean;
  status_code: string;
  status_message: string;
  batch_id: string | null;
  run_id: string | null;
  run_status: string;
  total_debit: string;
  total_credit: string;
  journal_count: string;
  entry_count: string;
  wallet_count: string;
  master_balance: string;
  safeguarded_liability: string;
  safeguarding_variance: string;
  exception_count: string;
}

@Injectable()
export class EodCloseService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly log: AccountingLoggerService,
  ) {}

  async execute(input: {
    businessDate: string;
    currency: string;
    reportingEntity: string;
    requestedBy: string;
    dryRun: boolean;
    correlationId?: string;
  }): Promise<EodCloseResult> {
    const started = Date.now();
    const currency = input.currency.toUpperCase();
    this.log.info({
      event: 'EOD_CLOSE_STARTED', correlationId: input.correlationId,
      businessDate: input.businessDate, currency, reportingEntity: input.reportingEntity,
      status: input.dryRun ? 'DRY_RUN' : 'CLOSE',
    });
    try {
      const rows = await this.dataSource.query<EodCloseResult[]>(
        `SELECT * FROM public.sw_proc_accounting_close_eod(
           $1::date,$2::varchar,$3::varchar,$4::text,$5::boolean,$6::varchar)`,
        [input.businessDate, currency, input.reportingEntity, input.requestedBy,
          input.dryRun, input.correlationId ?? null],
      );
      if (!rows[0]) throw new Error('EOD close procedure returned no result');
      const result = rows[0];
      this.log.info({
        event: 'EOD_CLOSE_FINISHED', correlationId: input.correlationId,
        eodBatchId: result.batch_id ?? undefined, eodRunId: result.run_id ?? undefined,
        businessDate: input.businessDate, currency, reportingEntity: input.reportingEntity,
        status: result.run_status, durationMs: Date.now() - started,
        counts: {
          journals: Number(result.journal_count), entries: Number(result.entry_count),
          wallets: Number(result.wallet_count), exceptions: Number(result.exception_count),
        },
        totals: {
          debit: result.total_debit, credit: result.total_credit,
          masterBalance: result.master_balance,
          safeguardedLiability: result.safeguarded_liability,
          safeguardingVariance: result.safeguarding_variance,
        },
        errorCode: result.success ? undefined : result.status_code,
      });
      return result;
    } catch (error) {
      this.log.error({
        event: 'EOD_CLOSE_ERROR', correlationId: input.correlationId,
        businessDate: input.businessDate, currency, reportingEntity: input.reportingEntity,
        durationMs: Date.now() - started, status: 'FAILED',
      }, error);
      throw error;
    }
  }
}
