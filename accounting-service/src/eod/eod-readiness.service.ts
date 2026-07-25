import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface ReadinessResult {
  ready: boolean;
  checks: Array<{ code: string; status: 'PASS' | 'FAIL' | 'WARNING'; count: number; message: string }>;
}

@Injectable()
export class EodReadinessService {
  constructor(private readonly dataSource: DataSource) {}

  async check(businessDate: string, currency: string, reportingEntity: string): Promise<ReadinessResult> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT
        (SELECT count(*) FROM public.sw_tbl_accounting_journal
         WHERE reporting_entity=$1 AND business_date=$2::date AND currency=$3 AND status='PROCESSING')::int AS processing_journals,
        (SELECT count(*) FROM public."SW_TBL_TRANSACTION_REQUEST"
         WHERE "Transaction_Status"=2
           AND upper("Currency")=$3
           AND COALESCE("TransactionDate"::date,$2::date)<=$2::date)::int AS pending_transactions,
        (SELECT count(*) FROM public."SW_TBL_TRANSACTION_REQUEST"
         WHERE "Transaction_Status"=2
           AND NULLIF(trim("Currency"),'') IS NULL
           AND COALESCE("TransactionDate"::date,$2::date)<=$2::date)::int AS uncategorized_transactions,
        (SELECT count(*) FROM public.sw_tbl_merchant_integration_attempt attempt
         JOIN public."SW_TBL_TRANSACTION_REQUEST" request_row
           ON request_row."Transaction_ID"=attempt.transactionid
         WHERE attempt.confirmation_status IN ('PENDING','UNKNOWN')
           AND COALESCE(NULLIF(upper(request_row."Currency"),''),$3)=$3
           AND COALESCE(request_row."TransactionDate"::date,$2::date)<=$2::date)::int AS pending_merchants`,
      [reportingEntity, businessDate, currency.toUpperCase()],
    );
    const row = rows[0] ?? {};
    const checks: ReadinessResult['checks'] = [
      {
        code: 'PROCESSING_JOURNALS',
        status: Number(row.processing_journals) === 0 ? 'PASS' : 'FAIL',
        count: Number(row.processing_journals ?? 0),
        message: 'Accounting journals must leave PROCESSING before close',
      },
      {
        code: 'PENDING_TRANSACTIONS',
        status: Number(row.pending_transactions) === 0 ? 'PASS' : 'FAIL',
        count: Number(row.pending_transactions ?? 0),
        message: 'Producer transactions accepted before cutoff must be consumed or failed',
      },
      {
        code: 'UNCATEGORIZED_PENDING_TRANSACTIONS',
        status: Number(row.uncategorized_transactions) === 0 ? 'PASS' : 'FAIL',
        count: Number(row.uncategorized_transactions ?? 0),
        message: 'Legacy pending transactions without a currency require operational resolution',
      },
      {
        code: 'PENDING_MERCHANT_CONFIRMATIONS',
        status: Number(row.pending_merchants) === 0 ? 'PASS' : 'WARNING',
        count: Number(row.pending_merchants ?? 0),
        message: 'Pending two-leg merchant transactions remain in temporary reserve',
      },
    ];
    return { ready: checks.every(check => check.status !== 'FAIL'), checks };
  }
}
