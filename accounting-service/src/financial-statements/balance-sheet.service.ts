import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class BalanceSheetService {
  constructor(private readonly dataSource: DataSource) {}
  async get(date: string, currency: string, entity: string) {
    const rows = await this.dataSource.query(
      `SELECT * FROM public.sw_fn_balance_sheet($1::date,$2::varchar,$3::varchar)`,
      [date, currency.toUpperCase(), entity],
    );
    const startOfYear = `${date.slice(0, 4)}-01-01`;
    const profitRows = await this.dataSource.query<Array<{ account_type: string; amount: string }>>(
      `SELECT account_type,amount FROM public.sw_fn_income_statement(
         $1::date,$2::date,$3::varchar,$4::varchar)`,
      [startOfYear, date, currency.toUpperCase(), entity],
    );
    const assets = this.total(rows, 'ASSET');
    const liabilities = this.total(rows, 'LIABILITY');
    const equity = this.total(rows, 'EQUITY');
    const income = this.total(profitRows, 'INCOME');
    const expenses = this.total(profitRows, 'EXPENSE');
    const currentProfit = income - expenses;
    return {
      asOfDate: date, currency: currency.toUpperCase(), reportingEntity: entity,
      totalAssets: assets.toFixed(2), totalLiabilities: liabilities.toFixed(2),
      totalEquity: equity.toFixed(2), currentPeriodProfit: currentProfit.toFixed(2),
      difference: (assets - liabilities - equity - currentProfit).toFixed(2),
      balanced: Math.abs(assets - liabilities - equity - currentProfit) < 0.005,
      accounts: rows,
    };
  }

  private total(rows: Array<any>, type: string) {
    return rows.filter(row => row.account_type === type)
      .reduce((sum, row) => sum + Number(row.amount), 0);
  }
}
