import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ReconciliationService {
  constructor(private readonly dataSource: DataSource) {}
  get(date: string, currency: string, entity: string) {
    return this.dataSource.query(
      `SELECT run.id::text AS "runId",run.business_date AS "businessDate",run.currency,
              run.master_balance::numeric AS "masterBalance",
              run.safeguarded_liability::numeric AS "safeguardedLiability",
              run.safeguarding_variance::numeric AS "safeguardingVariance",run.status,
              (SELECT jsonb_agg(jsonb_build_object(
                'code',exception.exception_code,'severity',exception.severity,
                'message',exception.message,'context',exception.context) ORDER BY exception.id)
               FROM public.sw_tbl_eod_exception exception WHERE exception.run_id=run.id) AS exceptions
       FROM public.sw_tbl_eod_run run
       WHERE run.reporting_entity=$1 AND run.business_date=$2::date AND run.currency=$3
       ORDER BY run.run_version DESC LIMIT 1`,
      [entity, date, currency.toUpperCase()],
    ).then(rows => rows[0] ?? null);
  }
}
