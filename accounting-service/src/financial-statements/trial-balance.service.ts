import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class TrialBalanceService {
  constructor(private readonly dataSource: DataSource) {}
  async get(date: string, currency: string, entity: string) {
    const rows = await this.dataSource.query(
      `SELECT * FROM public.sw_fn_trial_balance($1::date,$2::varchar,$3::varchar)`,
      [date, currency.toUpperCase(), entity],
    );
    const debit = rows.reduce((sum: number, row: any) => sum + Number(row.total_debit), 0);
    const credit = rows.reduce((sum: number, row: any) => sum + Number(row.total_credit), 0);
    return { businessDate: date, currency: currency.toUpperCase(), reportingEntity: entity,
      totalDebit: debit.toFixed(2), totalCredit: credit.toFixed(2),
      difference: (debit - credit).toFixed(2), balanced: Math.abs(debit - credit) < 0.005,
      accounts: rows };
  }
}
