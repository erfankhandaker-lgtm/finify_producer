import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'SW_TBL_KEYWORD' })
export class SwTblKeyword {
  @PrimaryColumn({ type: 'varchar', name: 'Keyword' }) keyword: string;
  @Column({ type: 'varchar', name: 'Keyword_Description', nullable: true }) keywordDescription?: string;
  @Column({ type: 'char', length: 1, name: 'Keyword_Scope', nullable: true }) keywordScope?: string;
  @Column({ type: 'varchar', name: 'Created_By', nullable: true }) createdBy?: string;
  @Column({ type: 'timestamp', name: 'Created_Date', default: () => 'CURRENT_TIMESTAMP' }) createdDate?: Date;
  @Column({ type: 'varchar', name: 'Modified_By', nullable: true }) modifiedBy?: string;
  @Column({ type: 'timestamp', name: 'Modified_Date', nullable: true }) modifiedDate?: Date;
  @Column({ type: 'varchar', name: 'Approved_By', nullable: true }) approvedBy?: string;
  @Column({ type: 'timestamp', name: 'Approved_Date', nullable: true }) approvedDate?: Date;
  @Column({ type: 'boolean', name: 'Is_Financial', nullable: true }) isFinancial?: boolean;
  @Column({ type: 'char', length: 1, name: 'Chargeable', nullable: true }) chargeable?: string;
  @Column({ type: 'char', length: 1, name: 'Kc_Id_Lookup', nullable: true }) kcIdLookup?: string;
  @Column({ type: 'char', length: 1, name: 'Commissionable', nullable: true }) commissionable?: string;
  @Column({ type: 'char', length: 1, name: 'Kcm_Id_Lookup', nullable: true }) kcmIdLookup?: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'MINIMUM_TRAN_AMOUNT', default: 1 }) minimumTranAmount?: number;
  @Column({ type: 'varchar', name: 'INVOLVED_PARTY', nullable: true }) involvedParty?: string;
  @Column({ type: 'boolean', name: 'ApplyTds', nullable: true }) applyTds?: boolean;
  @Column({ type: 'boolean', name: 'Is_Reward_Applicable', default: false }) isRewardApplicable?: boolean;
  @Column({ type: 'boolean', name: 'Is_System_Keyword', default: false }) isSystemKeyword?: boolean;
  @Column({ type: 'boolean', name: 'Service_Status', default: false }) serviceStatus?: boolean;
  @Column({ type: 'char', length: 1, name: 'vat_source', default: 'D' }) vatSource?: string;
  @Column({ type: 'smallint', name: 'VatId', default: 1 }) vatId?: number;
  @Column({ type: 'text', name: 'Keyword_Description_Local', nullable: true }) keywordDescriptionLocal?: string;
  @Column({ type: 'boolean', name: 'Is_category_service', default: false }) isCategoryService?: boolean;
  @Column({ type: 'integer', name: 'priority', nullable: true }) priority?: number;
  @Column({ type: 'varchar', name: 'RKEYWORD', nullable: true }) rkeyword?: string;
  @Column({ type: 'boolean', name: 'Is_Active', default: false }) isActive?: boolean;
}
