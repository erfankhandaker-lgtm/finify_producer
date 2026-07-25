import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class FxTranslationService {
  constructor(private readonly dataSource: DataSource) {}

  async consolidatedBalanceSheet(date: string, entity: string, baseCurrency = 'GBP') {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT balance.currency,account.statement_section,account.account_code,
              account.account_name,account.account_type,balance.closing_balance::numeric AS amount,
              CASE WHEN balance.currency=$3 THEN 1::numeric ELSE rate.rate END AS fx_rate
       FROM public.sw_tbl_daily_gl_balance balance
       JOIN public.sw_tbl_gl_account account ON account.account_code=balance.gl_account_code
       LEFT JOIN public.sw_tbl_eod_fx_rate rate
         ON rate.business_date=balance.business_date
        AND rate.source_currency=balance.currency AND rate.target_currency=$3
        AND rate.status='APPROVED'
       WHERE balance.reporting_entity=$1 AND balance.business_date=$2::date
         AND account.account_type IN ('ASSET','LIABILITY','EQUITY')
       ORDER BY balance.currency,account.display_order`,
      [entity, date, baseCurrency.toUpperCase()],
    );
    const missingRates = [...new Set(rows.filter(row => row.fx_rate === null)
      .map(row => String(row.currency)))];
    return {
      asOfDate: date, reportingEntity: entity, baseCurrency: baseCurrency.toUpperCase(),
      complete: missingRates.length === 0, missingRates,
      accounts: rows.map(row => ({
        ...row,
        translatedAmount: row.fx_rate === null ? null
          : (Number(row.amount) * Number(row.fx_rate)).toFixed(2),
      })),
    };
  }
}
