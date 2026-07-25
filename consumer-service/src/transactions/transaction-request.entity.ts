import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'SW_TBL_TRANSACTION_REQUEST', synchronize: false })
export class TransactionRequest {
  @PrimaryColumn({ type: 'bigint', name: 'Transaction_ID' })
  transactionId: string;

  @Column({ type: 'varchar', name: 'Keyword', nullable: true })
  keyword: string | null;

  @Column({ type: 'bigint', name: 'Source_Wallet_ID', nullable: true })
  sourceWalletId: string | null;

  @Column({ type: 'bigint', name: 'Dest_Wallet_ID', nullable: true })
  destinationWalletId: string | null;

  @Column({ type: 'decimal', name: 'Amount', nullable: true })
  amount: string | null;

  @Column({ type: 'bigint', name: 'Transaction_Status', nullable: true })
  transactionStatus: string | null;

  @Column({ type: 'text', name: 'Reference_ID', nullable: true })
  referenceId: string | null;

  @Column({ type: 'varchar', name: 'Currency', nullable: true })
  currency: string | null;

  @Column({ type: 'text', name: 'TRNID', nullable: true })
  trnId: string | null;

  @Column({ type: 'timestamp', name: 'TransactionDate', nullable: true })
  transactionDate: Date | null;
}
