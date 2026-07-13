import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'SW_VIEW_ALLUSER', synchronize: false })
export class SwViewAllUser {
  @PrimaryColumn({ type: 'bigint', name: 'MSISDN' }) MSISDN: string;
  @Column({ type: 'decimal', name: 'Amount', nullable: true }) Amount: number;
  @Column({ type: 'text', name: 'Full_Name', nullable: true }) Full_Name: string;
  @Column({ type: 'text', name: 'Acc_Code', nullable: true }) Acc_Code: string;
  @Column({ type: 'text', name: 'Email', nullable: true }) Email: string;
  @Column({ type: 'text', name: 'ID_Type', nullable: true }) ID_Type: string;
  @Column({ type: 'text', name: 'ID_Number', nullable: true }) ID_Number: string;
  @Column({ type: 'timestamp', name: 'Created_Date', nullable: true }) Created_Date: Date;
  @Column({ type: 'text', name: 'PIN', nullable: true }) PIN: string;
  @Column({ type: 'timestamp', name: 'Modified_Date', nullable: true }) Modified_Date: Date;
  @Column({ type: 'timestamp', name: 'Approved_Date', nullable: true }) Approved_Date: Date;
  @Column({ type: 'smallint', name: 'Wallet_Type', nullable: true }) Wallet_Type: number;
  @Column({ type: 'smallint', name: 'Status', nullable: true }) Status: number;
  @Column({ type: 'smallint', name: 'Fail_Attempt', nullable: true }) Fail_Attempt: number;
  @Column({ type: 'text', name: 'User_Scope', nullable: true }) User_Scope: string;
  @Column({ type: 'bigint', name: 'PARENT_MSISDN', nullable: true }) PARENT_MSISDN: string;
  @Column({ type: 'boolean', name: 'SMSNotification', nullable: true }) SMSNotification: boolean;
  @Column({ type: 'text', name: 'Approved_By', nullable: true }) Approved_By: string;
  @Column({ type: 'text', name: 'Modified_By', nullable: true }) Modified_By: string;
  @Column({ type: 'text', name: 'Created_By', nullable: true }) Created_By: string;
  @Column({ type: 'smallint', name: 'Reset_Pin_Attempt', nullable: true }) Reset_Pin_Attempt: number;
  @Column({ type: 'text', name: 'Image', nullable: true }) Image: string;
  @Column({ type: 'smallint', name: 'CHARGERULE', nullable: true }) CHARGERULE: number;
  @Column({ type: 'smallint', name: 'COMMISSIONRULE', nullable: true }) COMMISSIONRULE: number;
  @Column({ type: 'smallint', name: 'Wallet_Code', nullable: true }) Wallet_Code: number;
  @Column({ type: 'boolean', name: 'is_default', nullable: true }) is_default: boolean;
  @Column({ type: 'bigint', name: 'Mobile_Number', nullable: true }) Mobile_Number: string;
}
