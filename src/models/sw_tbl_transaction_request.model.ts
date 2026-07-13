import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'SW_TBL_TRANSACTION_REQUEST' })
export class TransactionRequest {
  @PrimaryColumn({ type: 'bigint', name: 'Transaction_ID' }) transactionId: string;
  @Column({ type: 'varchar', name: 'Keyword', nullable: true }) keyword: string;
  @Column({ type: 'bigint', name: 'Source_Wallet_ID', nullable: true }) sourceWalletId: string;
  @Column({ type: 'bigint', name: 'Dest_Wallet_ID', nullable: true }) destWalletId: string;
  @Column({ type: 'decimal', name: 'Amount', nullable: true }) amount: number;
  @CreateDateColumn({ type: 'timestamp', name: 'Created_Date' }) createdAt: Date;
  @Column({ type: 'decimal', name: 'Transaction_Fee', default: 0 }) transactionFee: string;
  @Column({ type: 'decimal', name: 'Transaction_Comm', default: 0 }) transactionComm: string;
  @Column({ type: 'bigint', name: 'Transaction_Status', default: 1 }) transactionStatus: string;
  @Column({ type: 'text', name: 'Reference_ID', default: '' }) referenceId: string;
  @Column({ type: 'bigint', name: 'Fee_Payer', default: 0 }) feePayer: string;
  @Column({ type: 'bigint', name: 'Commission_Receiver', default: 0 }) commissionReceiver: string;
  @Column({ type: 'timestamp', name: 'TransactionDate', default: () => 'CURRENT_TIMESTAMP' }) transactionDate: Date;
  @Column({ type: 'varchar', name: 'Currency', default: 'BDT' }) currency: string;
  @Column({ type: 'smallint', name: 'Transactionstatus', nullable: true, default: 0 }) transactionStatusTwo: number;
  @Column({ type: 'varchar', name: 'Pin', default: '0' }) pin: string;
  @Column({ type: 'text', name: 'Dest_Wallet_Fullname', default: '' }) destWalletFullname: string;
  @Column({ type: 'varchar', name: 'remarks', nullable: true }) remarks: string;
  @Column({ type: 'varchar', name: 'TRNID', nullable: true }) TRNID: string;
}
