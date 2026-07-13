import { Column, Entity, Generated, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'SW_TBL_CHARGE' })
export class SwTblCharge {
  @Column({ type: 'integer', name: 'ROW_ID' })
  @Generated('increment')
  rowId: number;
  @PrimaryColumn({ type: 'smallint', name: 'Charge_ID' }) chargeId: number;
  @Column({ type: 'smallint', name: 'Charge_Type', nullable: true }) chargeType: number;
  @Column({ type: 'date', name: 'Expiry_On', nullable: true }) expiryOn: string | Date | null;
  @Column({ type: 'smallint', name: 'Status', nullable: true }) status: number;
  @Column({ type: 'smallint', name: 'Def_Charge_ID', nullable: true }) defaultChargeId: number | null;
  @Column({ type: 'varchar', name: 'Created_By', nullable: true }) createdBy: string;
  @Column({ type: 'timestamp', name: 'Created_Date', nullable: true }) createdDate: Date;
  @Column({ type: 'varchar', name: 'Modified_By', nullable: true }) modifiedBy: string | null;
  @Column({ type: 'timestamp', name: 'Modified_Date', nullable: true }) modifiedDate: Date | null;
  @Column({ type: 'varchar', name: 'Approved_By', nullable: true }) approvedBy: string | null;
  @Column({ type: 'timestamp', name: 'Approved_Date', nullable: true }) approvedDate: Date | null;
  @Column({ type: 'varchar', name: 'Charge_Description', nullable: true }) chargeDescription: string | null;

  @ManyToOne(() => SwTblCharge, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'Def_Charge_ID', referencedColumnName: 'chargeId' })
  defaultCharge?: SwTblCharge | null;

  @OneToMany(() => SwTblChargeDetail, detail => detail.charge)
  details?: SwTblChargeDetail[];

  @OneToMany(() => SwTblKeywordCharge, keywordCharge => keywordCharge.charge)
  keywordCharges?: SwTblKeywordCharge[];
}

@Entity({ name: 'SW_TBL_CHARGE_DETAILS' })
export class SwTblChargeDetail {
  @PrimaryGeneratedColumn({ type: 'integer', name: 'Row_ID' }) rowId: number;
  @Column({ type: 'smallint', name: 'Charge_ID', nullable: true }) chargeId: number;
  @Column({ type: 'varchar', name: 'Charge_Type', nullable: true }) chargeType: string;
  @Column({ type: 'numeric', name: 'Charge_Value', nullable: true }) chargeValue: string;
  @Column({ type: 'numeric', name: 'Start_Range', nullable: true }) startRange: string | null;
  @Column({ type: 'numeric', name: 'End_Range', nullable: true }) endRange: string | null;
  @Column({ type: 'numeric', name: 'Min_Charge', nullable: true }) minCharge: string | null;
  @Column({ type: 'numeric', name: 'Max_Charge', nullable: true }) maxCharge: string | null;

  @ManyToOne(() => SwTblCharge, charge => charge.details, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'Charge_ID', referencedColumnName: 'chargeId' })
  charge?: SwTblCharge;
}

@Entity({ name: 'SW_TBL_CHARGE_MAPPING' })
export class SwTblChargeMapping {
  @PrimaryGeneratedColumn({ type: 'integer', name: 'RowId' }) rowId: number;
  @Index('UQ_CHARGE_MAPPING_KEYWORD_CHARGE_ID', { unique: true })
  @Column({ type: 'integer', name: 'Keyword_Charge_Id', nullable: true }) keywordChargeId: number;
  @Column({ type: 'varchar', name: 'Description', nullable: true }) description: string | null;
  @Column({ type: 'smallint', name: 'Is_Default', default: 0 }) isDefault: number;
  @Column({ type: 'smallint', name: 'Status', nullable: true }) status: number;
  @Column({ type: 'varchar', name: 'Created_By', nullable: true }) createdBy: string;
  @Column({ type: 'timestamp', name: 'Created_Date', nullable: true }) createdDate: Date;
  @Column({ type: 'varchar', name: 'Modified_By', nullable: true }) modifiedBy: string | null;
  @Column({ type: 'timestamp', name: 'Modified_Date', nullable: true }) modifiedDate: Date | null;
  @Column({ type: 'varchar', name: 'Approved_By', nullable: true }) approvedBy: string | null;
  @Column({ type: 'timestamp', name: 'Approved_Date', nullable: true }) approvedDate: Date | null;
  @Column({ type: 'char', name: 'OperationType', nullable: true }) operationType: string | null;

  @OneToMany(() => SwTblKeywordCharge, keywordCharge => keywordCharge.mapping)
  keywordCharges?: SwTblKeywordCharge[];
}

@Entity({ name: 'SW_TBL_KEYWORD_CHARGE' })
export class SwTblKeywordCharge {
  @PrimaryGeneratedColumn({ type: 'integer', name: 'Row_Id' }) rowId: number;
  @Column({ type: 'integer', name: 'Keywod_Charge_Id', nullable: true }) keywordChargeId: number;
  @Column({ type: 'varchar', name: 'Keyword', nullable: true }) keyword: string;
  @Column({ type: 'smallint', name: 'Charge_Id', nullable: true }) chargeId: number;
  @Column({ type: 'char', name: 'Payer', nullable: true }) payer: string;
  @Column({ type: 'varchar', name: 'Description', nullable: true }) description: string | null;
  @Column({ type: 'varchar', name: 'Created_BY', nullable: true }) createdBy: string;
  @Column({ type: 'timestamp', name: 'Created_Date', nullable: true }) createdDate: Date;
  @Column({ type: 'varchar', name: 'Modified_BY', nullable: true }) modifiedBy: string | null;
  @Column({ type: 'timestamp', name: 'Modified_Date', nullable: true }) modifiedDate: Date | null;
  @Column({ type: 'varchar', name: 'Approved_BY', nullable: true }) approvedBy: string | null;
  @Column({ type: 'timestamp', name: 'Approved_Date', nullable: true }) approvedDate: Date | null;
  @Column({ type: 'smallint', name: 'Is_Default', default: 0 }) isDefault: number;
  @Column({ type: 'integer', name: 'Charge_Map_Id', nullable: true }) walletId: number;
  @Column({ type: 'smallint', name: 'Status', default: 1 }) status: number;

  @ManyToOne(() => SwTblCharge, charge => charge.keywordCharges, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'Charge_Id', referencedColumnName: 'chargeId' })
  charge?: SwTblCharge;

  @ManyToOne(() => SwTblChargeMapping, mapping => mapping.keywordCharges, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'Keywod_Charge_Id', referencedColumnName: 'keywordChargeId' })
  mapping?: SwTblChargeMapping;
}
