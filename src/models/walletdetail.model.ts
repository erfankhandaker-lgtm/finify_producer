import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'walletdetail', synchronize: false })
export class WalletDetail {
  @PrimaryColumn({ type: 'bigint', name: 'Wallet_MSISDN' })
  walletMsisdn?: string;

  @Column({ type: 'varchar', name: 'Wallet_Details', nullable: true })
  walletDetails?: string;

  @Column({ type: 'decimal', name: 'Amount', nullable: true })
  amount?: number;

  @Column({ type: 'decimal', name: 'commission_balance', nullable: true })
  commissionBalance?: number;

  @Column({ type: 'integer', name: 'Wallet_Code', nullable: true })
  walletCode?: number;

  @Column({ type: 'smallint', name: 'Wallet_Type', nullable: true })
  walletType?: number;

  @Column({ type: 'varchar', name: 'Wallet_Name', nullable: true })
  walletName?: string;

  @Column({ type: 'text', name: 'Wallet_Name_Local', nullable: true })
  walletNameLocal?: string;

  @Column({ type: 'bigint', name: 'Parent', nullable: true })
  parent?: string;

  @Column({ type: 'timestamp', name: 'Created_Date', nullable: true })
  createdDate?: Date;

  @Column({ type: 'smallint', name: 'Status', nullable: true })
  status?: number;

  @Column({ type: 'bigint', name: 'hold_transfer_day', nullable: true })
  holdTransferDay?: string;

  @Column({ type: 'boolean', name: 'is_hold_transfer', nullable: true })
  isHoldTransfer?: boolean;
}
