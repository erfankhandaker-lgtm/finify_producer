import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'SW_TBL_WALLET', synchronize: false })
export class SwTblWallet {
  @PrimaryColumn({ type: 'bigint', name: 'Wallet_MSISDN' }) walletMsisdn: string;
  @Column({ type: 'integer', name: 'Wallet_Code', nullable: true }) walletCode: number;
  @Column({ type: 'numeric', name: 'Amount', nullable: true }) amount: string;
  @Column({ type: 'smallint', name: 'Status', nullable: true }) status: number;
  @Column({ type: 'uuid', name: 'Account_code' }) accountCode: string;
}

@Entity({ name: 'SW_TBL_WALLET_TYPE', synchronize: false })
export class SwTblWalletType {
  @PrimaryColumn({ type: 'integer', name: 'Wallet_ID' }) walletId: number;
  @Column({ type: 'varchar', name: 'Wallet_Name', nullable: true }) walletName: string;
  @Column({ type: 'varchar', name: 'Wallet_Details', nullable: true }) walletDetails: string;
  @Column({ type: 'smallint', name: 'Wallet_Type', nullable: true }) walletType: number;
  @Column({ type: 'boolean', name: 'Status', nullable: true }) status: boolean | null;
}
