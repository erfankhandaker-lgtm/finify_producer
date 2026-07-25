import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AccountStatementService {
  constructor(private readonly dataSource: DataSource) {}

  async get(wallet: string, from: string, to: string, currency: string) {
    if (from > to) throw new BadRequestException('dateFrom must not be after dateTo');
    const walletRows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT "Wallet_MSISDN"::text AS wallet,"Wallet_Code" AS "walletCode",
              currency,"Amount"::numeric AS "currentBalance","Status" AS status
       FROM public."SW_TBL_WALLET" WHERE "Wallet_MSISDN"=$1::bigint`,
      [wallet],
    );
    if (!walletRows[0]) throw new NotFoundException('Wallet was not found');
    const entries = await this.dataSource.query(
      `SELECT * FROM public.sw_fn_account_statement($1::bigint,$2::date,$3::date,$4::varchar)`,
      [wallet, from, to, currency.toUpperCase()],
    );
    const snapshots = await this.dataSource.query(
      `SELECT business_date AS "businessDate",opening_balance::numeric AS "openingBalance",
              total_debit::numeric AS "totalDebit",total_credit::numeric AS "totalCredit",
              closing_balance::numeric AS "closingBalance",transaction_count::int AS "transactionCount"
       FROM public.sw_tbl_daily_wallet_balance
       WHERE wallet_msisdn=$1::bigint AND business_date BETWEEN $2::date AND $3::date
         AND currency=$4 ORDER BY business_date`,
      [wallet, from, to, currency.toUpperCase()],
    );
    return { wallet: walletRows[0], dateFrom: from, dateTo: to,
      currency: currency.toUpperCase(), dailyBalances: snapshots, entries };
  }
}
