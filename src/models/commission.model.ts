import { Column, Entity, Generated, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'SW_TBL_COMMISSION' })
export class SwTblCommission {
  @Column({ type: 'integer', name: 'ROW_ID' }) @Generated('increment') rowId: number;
  @PrimaryColumn({ type: 'smallint', name: 'Commission_ID' }) commissionId: number;
  @Column({ type: 'varchar', name: 'Description', nullable: true }) description: string;
  @Column({ type: 'smallint', name: 'Commission_Type', nullable: true }) commissionType: number;
  @Column({ type: 'date', name: 'Expiry_On', nullable: true }) expiryOn: string | Date | null;
  @Column({ type: 'smallint', name: 'Status', nullable: true }) status: number;
  @Column({ type: 'smallint', name: 'Def_Commission_ID', nullable: true }) defaultCommissionId: number | null;
  @Column({ type: 'varchar', name: 'Created_By', nullable: true }) createdBy: string;
  @Column({ type: 'timestamp', name: 'Created_Date', nullable: true }) createdDate: Date;
  @Column({ type: 'varchar', name: 'Modified_By', nullable: true }) modifiedBy: string;
  @Column({ type: 'timestamp', name: 'Modified_Date', nullable: true }) modifiedDate: Date;
  @Column({ type: 'varchar', name: 'Approved_By', nullable: true }) approvedBy: string;
  @Column({ type: 'timestamp', name: 'Approved_Date', nullable: true }) approvedDate: Date;
  @Column({ type: 'double precision', name: 'Distributor_Commission', nullable: true }) distributorCommission: number;
}

@Entity({ name: 'SW_TBL_COMMISSION_DETAIL' })
export class SwTblCommissionDetail {
  @PrimaryGeneratedColumn({ type: 'integer', name: 'Row_ID' }) rowId: number;
  @Column({ type: 'smallint', name: 'Commission_ID', nullable: true }) commissionId: number;
  @Column({ type: 'varchar', name: 'Comission_Type', nullable: true }) commissionType: string;
  @Column({ type: 'double precision', name: 'Comission_Value', nullable: true }) commissionValue: number;
  @Column({ type: 'money', name: 'Start_Range', nullable: true }) startRange: string;
  @Column({ type: 'money', name: 'End_Range', nullable: true }) endRange: string;
  @Column({ type: 'money', name: 'Min_Comission', nullable: true }) minCommission: string;
  @Column({ type: 'money', name: 'Max_Comission', nullable: true }) maxCommission: string;
}

@Entity({ name: 'SW_TBL_COMMISSION_MAPPING' })
export class SwTblCommissionMapping {
  @PrimaryGeneratedColumn({ type: 'integer', name: 'RowId' }) rowId: number;
  @Column({ type: 'integer', name: 'Keyword_Commission_Id', nullable: true }) keywordCommissionId: number;
  @Column({ type: 'varchar', name: 'Description', nullable: true }) description: string;
  @Column({ type: 'smallint', name: 'Is_Default', default: 0 }) isDefault: number;
  @Column({ type: 'smallint', name: 'Status', nullable: true }) status: number;
  @Column({ type: 'varchar', name: 'Created_By', nullable: true }) createdBy: string;
  @Column({ type: 'timestamp', name: 'Created_Date', nullable: true }) createdDate: Date;
  @Column({ type: 'varchar', name: 'Modified_By', nullable: true }) modifiedBy: string;
  @Column({ type: 'timestamp', name: 'Modified_Date', nullable: true }) modifiedDate: Date;
  @Column({ type: 'varchar', name: 'Approved_By', nullable: true }) approvedBy: string;
  @Column({ type: 'timestamp', name: 'Approved_Date', nullable: true }) approvedDate: Date;
  @Column({ type: 'char', name: 'OperationType', nullable: true }) operationType: string;
}

@Entity({ name: 'SW_TBL_KEYWORD_COMMISSION' })
export class SwTblKeywordCommission {
  @PrimaryGeneratedColumn({ type: 'integer', name: 'Row_ID' }) rowId: number;
  @Column({ type: 'smallint', name: 'Keyword_Commission_ID', nullable: true }) keywordCommissionId: number;
  @Column({ type: 'varchar', name: 'Keyword', nullable: true }) keyword: string;
  @Column({ type: 'smallint', name: 'Commission_ID', nullable: true }) commissionId: number;
  @Column({ type: 'varchar', name: 'Description', nullable: true }) description: string;
  @Column({ type: 'char', name: 'Receiver', nullable: true }) receiver: string;
  @Column({ type: 'varchar', name: 'Created_BY', nullable: true }) createdBy: string;
  @Column({ type: 'timestamp', name: 'Created_Date', nullable: true }) createdDate: Date;
  @Column({ type: 'varchar', name: 'Modified_BY', nullable: true }) modifiedBy: string;
  @Column({ type: 'timestamp', name: 'Modified_Date', nullable: true }) modifiedDate: Date;
  @Column({ type: 'varchar', name: 'Approved_BY', nullable: true }) approvedBy: string;
  @Column({ type: 'timestamp', name: 'Approved_Date', nullable: true }) approvedDate: Date;
  @Column({ type: 'smallint', name: 'Is_Default', default: 0 }) isDefault: number;
  @Column({ type: 'integer', name: 'Commission_Map_Id', nullable: true }) walletId: number;
  @Column({ type: 'smallint', name: 'Status', default: 1 }) status: number;
}
