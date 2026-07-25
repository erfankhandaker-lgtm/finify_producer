import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface AmlReservationResult {
  success: boolean;
  statusCode: string;
  statusMessage: string;
  transactionId: string;
  reservationStatus: string | null;
  walletCode: number | null;
  dailyAmountUsed: string;
  dailyTransactionUsed: number;
  monthlyAmountUsed: string;
  monthlyTransactionUsed: number;
}

@Injectable()
export class AmlTransactionService {
  constructor(private readonly dataSource: DataSource) {}

  async reserve(input: {
    transactionId: string;
    sourceWallet: string;
    keyword: string;
    amount: number;
  }): Promise<AmlReservationResult> {
    const rows = await this.dataSource.query(
      `SELECT * FROM public.sw_proc_aml_reserve($1::bigint,$2::bigint,$3::varchar,$4::numeric)`,
      [input.transactionId, input.sourceWallet, input.keyword, input.amount],
    );
    if (!rows[0]) throw new Error('AML reservation function returned no result');
    const row = rows[0];
    return {
      success: row.success === true,
      statusCode: String(row.status_code),
      statusMessage: String(row.status_message),
      transactionId: String(row.transaction_id ?? input.transactionId),
      reservationStatus: row.reservation_status === null ? null : String(row.reservation_status),
      walletCode: row.wallet_code === null ? null : Number(row.wallet_code),
      dailyAmountUsed: String(row.daily_amount_used ?? 0),
      dailyTransactionUsed: Number(row.daily_transaction_used ?? 0),
      monthlyAmountUsed: String(row.monthly_amount_used ?? 0),
      monthlyTransactionUsed: Number(row.monthly_transaction_used ?? 0),
    };
  }

  async release(transactionId: string): Promise<void> {
    const rows = await this.dataSource.query(
      `SELECT * FROM public.sw_proc_aml_finalize($1::bigint,'RELEASED'::varchar)`,
      [transactionId],
    );
    const row = rows[0];
    if (row && row.success !== true && row.status_code !== 'RESERVATION_NOT_FOUND') {
      throw new Error(`AML release failed: ${row.status_code} ${row.status_message}`);
    }
  }
}
