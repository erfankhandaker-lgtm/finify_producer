import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class IncomeStatementService {
  constructor(private readonly dataSource: DataSource) {}
  async get(from: string, to: string, currency: string, entity: string) {
    if (from > to) throw new BadRequestException('dateFrom must not be after dateTo');
    const rows = await this.dataSource.query(
      `SELECT * FROM public.sw_fn_income_statement($1::date,$2::date,$3::varchar,$4::varchar)`,
      [from, to, currency.toUpperCase(), entity],
    );
    const income = rows.filter((row: any) => row.account_type === 'INCOME')
      .reduce((sum: number, row: any) => sum + Number(row.amount), 0);
    const expenses = rows.filter((row: any) => row.account_type === 'EXPENSE')
      .reduce((sum: number, row: any) => sum + Number(row.amount), 0);
    return { dateFrom: from, dateTo: to, currency: currency.toUpperCase(), reportingEntity: entity,
      totalIncome: income.toFixed(2), totalExpenses: expenses.toFixed(2),
      profitOrLoss: (income - expenses).toFixed(2), accounts: rows };
  }
}
