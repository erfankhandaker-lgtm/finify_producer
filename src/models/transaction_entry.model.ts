import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'view_tbl_transaction_entry', synchronize: false })
export class SwTblTransactionEntry {
  @PrimaryColumn({ type: 'integer', name: 'id' })
  id: number;

  @Column({ type: 'bigint', name: 'transactionid', nullable: true }) transactionid: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'Debit', default: 0 }) debit: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'Credit', default: 0 }) credit: number;
  @Column({ type: 'timestamp', name: 'entrydate', nullable: true }) entrydate: Date;
  @Column({ type: 'bigint', name: 'accounttype', default: 0 }) accounttype: string;
  @Column({ type: 'bigint', name: 'accountnumber', nullable: true }) accountnumber: string;
  @Column({ type: 'bigint', name: 'wallet_code', nullable: true }) walletCode: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'balance', nullable: true }) balance: number;
  @Column({ type: 'text', name: 'TRNID', nullable: true }) trnId: string;
  @Column({ type: 'text', name: 'Keyword', nullable: true }) keyword: string;
  @Column({ type: 'bigint', name: 'Transaction_Status', nullable: true }) transactionStatus: string;
}
