import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AccountingConfigService } from '../accounting-config/accounting-config.service';
import { AccountingLoggerService } from '../common/accounting-logger.service';
import { EodCloseResult, EodCloseService } from './eod-close.service';
import { EodReadinessService } from './eod-readiness.service';

@Injectable()
export class EodOrchestrationService {
  constructor(
    private readonly configurations: AccountingConfigService,
    private readonly readiness: EodReadinessService,
    private readonly closeService: EodCloseService,
    private readonly dataSource: DataSource,
    private readonly log: AccountingLoggerService,
  ) {}

  async runOne(input: {
    businessDate: string; currency: string; reportingEntity: string; requestedBy: string;
    dryRun: boolean; correlationId?: string;
  }) {
    const correlationId = input.correlationId ?? randomUUID();
    const readiness = await this.readiness.check(
      input.businessDate, input.currency.toUpperCase(), input.reportingEntity,
    );
    this.log.info({
      event: 'EOD_READINESS_CHECK', correlationId, businessDate: input.businessDate,
      currency: input.currency.toUpperCase(), reportingEntity: input.reportingEntity,
      status: readiness.ready ? 'PASSED' : 'FAILED',
      counts: Object.fromEntries(readiness.checks.map(check => [check.code, check.count])),
    });
    if (!input.dryRun && !readiness.ready) {
      throw new ConflictException({ message: 'EOD readiness checks failed', correlationId, readiness });
    }
    const result = await this.closeService.execute({ ...input, correlationId });
    await this.persistReadiness(result.run_id, result.batch_id, readiness);
    if (!readiness.ready) {
      result.success = false;
      result.status_code = 'EXTERNAL_READINESS_FAILED';
      result.status_message = 'EOD database controls ran, but operational readiness checks failed';
      result.run_status = 'BLOCKED';
      result.exception_count = String(
        Number(result.exception_count) + readiness.checks.filter(check => check.status === 'FAIL').length,
      );
    }
    return {
      correlationId,
      status: readiness.ready && result.success ? (input.dryRun ? 'READY' : 'CLOSED') : 'BLOCKED',
      readyForClose: readiness.ready && result.success,
      readiness,
      result,
    };
  }

  async runAll(input: {
    businessDate: string; reportingEntity: string; requestedBy: string;
    dryRun: boolean; correlationId?: string;
  }) {
    const correlationId = input.correlationId ?? randomUUID();
    const currencies = await this.configurations.currencyUniverse(input.reportingEntity);
    const results: Array<{
      currency: string;
      configured: boolean;
      status: 'READY' | 'CLOSED' | 'BLOCKED' | 'FAILED';
      result?: unknown;
      error?: string;
    }> = [];
    for (const currency of currencies) {
      if (!currency.configured) {
        results.push({
          currency: currency.currency,
          configured: false,
          status: 'BLOCKED',
          error: 'ACCOUNTING_CONFIGURATION_MISSING',
        });
        continue;
      }
      try {
        const result = await this.runOne({
          ...input,
          currency: currency.currency,
          correlationId: `${correlationId}:${currency.currency}`,
        });
        const successful = result.readyForClose;
        results.push({
          currency: currency.currency,
          configured: true,
          status: successful ? (input.dryRun ? 'READY' : 'CLOSED') : 'BLOCKED',
          result,
        });
      } catch (error) {
        const detail = error instanceof ConflictException
          ? 'EOD_READINESS_FAILED'
          : error instanceof Error ? error.message : String(error);
        results.push({
          currency: currency.currency,
          configured: true,
          status: 'FAILED',
          error: detail,
        });
      }
    }
    const successful = results.filter(item => item.status === (input.dryRun ? 'READY' : 'CLOSED')).length;
    const status = successful === results.length && results.length > 0
      ? 'COMPLETED'
      : successful > 0 ? 'PARTIAL' : 'FAILED';
    await this.dataSource.query(
      `UPDATE public.sw_tbl_eod_batch
       SET status=$3,completed_at=CURRENT_TIMESTAMP
       WHERE reporting_entity=$1 AND business_date=$2::date`,
      [input.reportingEntity, input.businessDate, status],
    );
    return {
      correlationId,
      businessDate: input.businessDate,
      reportingEntity: input.reportingEntity,
      dryRun: input.dryRun,
      status,
      summary: {
        expected: results.length,
        successful,
        blocked: results.filter(item => item.status === 'BLOCKED').length,
        failed: results.filter(item => item.status === 'FAILED').length,
      },
      currencies: results,
    };
  }

  listRuns(limit: number) {
    return this.dataSource.query(
      `SELECT run.id::text,run.batch_id::text AS "batchId",run.reporting_entity AS "reportingEntity",
              to_char(run.business_date,'YYYY-MM-DD') AS "businessDate",run.currency,run.run_version AS "runVersion",
              run.dry_run AS "dryRun",run.status,run.total_debit::numeric AS "totalDebit",
              run.total_credit::numeric AS "totalCredit",run.journal_count::int AS "journalCount",
              run.entry_count::int AS "entryCount",run.wallet_count::int AS "walletCount",
              run.safeguarding_variance::numeric AS "safeguardingVariance",
              run.error_code AS "errorCode",run.started_at AS "startedAt",run.completed_at AS "completedAt"
       FROM public.sw_tbl_eod_run run ORDER BY run.started_at DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 500)],
    );
  }

  async getRun(runId: string) {
    const runs = await this.dataSource.query(
      `SELECT * FROM public.sw_tbl_eod_run WHERE id=$1::bigint`, [runId],
    );
    const steps = await this.dataSource.query(
      `SELECT id::text,step_name AS "stepName",status,sequence_no AS "sequence",
              detail,started_at AS "startedAt",completed_at AS "completedAt",duration_ms AS "durationMs"
       FROM public.sw_tbl_eod_run_step WHERE run_id=$1::bigint ORDER BY sequence_no`, [runId],
    );
    const exceptions = await this.dataSource.query(
      `SELECT id::text,exception_code AS "exceptionCode",severity,message,context,
              created_at AS "createdAt"
       FROM public.sw_tbl_eod_exception WHERE run_id=$1::bigint ORDER BY id`, [runId],
    );
    return { run: runs[0] ?? null, steps, exceptions };
  }

  private async persistReadiness(
    runId: string | null,
    batchId: string | null,
    readiness: Awaited<ReturnType<EodReadinessService['check']>>,
  ) {
    if (!runId) return;
    await this.dataSource.transaction(async manager => {
      await manager.query(
        `INSERT INTO public.sw_tbl_eod_run_step(
           run_id,step_name,status,sequence_no,detail,completed_at,duration_ms)
         VALUES($1::bigint,'EXTERNAL_READINESS',
           $2,0,$3::jsonb,CURRENT_TIMESTAMP,0)
         ON CONFLICT(run_id,sequence_no) DO UPDATE
         SET status=EXCLUDED.status,detail=EXCLUDED.detail,completed_at=CURRENT_TIMESTAMP`,
        [runId, readiness.ready ? 'PASSED' : 'FAILED', JSON.stringify(readiness)],
      );
      for (const check of readiness.checks.filter(item => item.status !== 'PASS')) {
        await manager.query(
          `INSERT INTO public.sw_tbl_eod_exception(
             run_id,exception_code,severity,message,context)
           VALUES($1::bigint,$2,$3,$4,$5::jsonb)`,
          [runId, check.code, check.status === 'FAIL' ? 'ERROR' : 'WARNING',
            check.message, JSON.stringify({ count: check.count })],
        );
      }
      if (!readiness.ready) {
        await manager.query(
          `UPDATE public.sw_tbl_eod_run
           SET status='BLOCKED',error_code='EXTERNAL_READINESS_FAILED',
               error_message='Operational readiness checks failed'
           WHERE id=$1::bigint`,
          [runId],
        );
        if (batchId) {
          await manager.query(
            `UPDATE public.sw_tbl_eod_batch SET status='FAILED' WHERE id=$1::bigint`,
            [batchId],
          );
        }
      }
    });
  }
}
