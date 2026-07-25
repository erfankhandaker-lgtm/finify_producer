import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AccountingPeriodService {
  constructor(private readonly dataSource: DataSource) {}
  list(reportingEntity: string, limit: number) {
    return this.dataSource.query(
      `SELECT id::text,reporting_entity AS "reportingEntity",business_date AS "businessDate",
              currency,status,close_version AS "closeVersion",opened_at AS "openedAt",
              closing_started_at AS "closingStartedAt",closed_at AS "closedAt",closed_by AS "closedBy"
       FROM public.sw_tbl_accounting_period WHERE reporting_entity=$1
       ORDER BY business_date DESC,currency LIMIT $2`,
      [reportingEntity, Math.min(Math.max(limit, 1), 366)],
    );
  }
}
