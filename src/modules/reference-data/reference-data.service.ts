import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { REDIS_CONNECTION } from '@config/constants';
import { DataSource, EntityManager } from 'typeorm';
import { AdminTokenPayload } from '../admin-auth/admin-auth.types';
import {
  AmlConfigurationListQueryDto,
  ChangeRequestListQueryDto,
  CreateAmlConfigurationDto,
  CreateKeywordDto,
  CreateWalletTypeDto,
  ReferenceListQueryDto,
  SimulateAmlConfigurationDto,
  UpdateAmlConfigurationDto,
  UpdateKeywordDto,
  UpdateWalletTypeDto,
} from './dto/reference-data.dto';

type ResourceType = 'KEYWORD' | 'WALLET_TYPE' | 'AML';
type ChangeAction = 'CREATE' | 'UPDATE' | 'DELETE';
type Snapshot = Record<string, unknown>;

@Injectable()
export class ReferenceDataService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(REDIS_CONNECTION) private readonly cache: any,
  ) {}

  async listKeywords(query: ReferenceListQueryDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 25, 200);
    const values: unknown[] = [];
    const where: string[] = [];
    if (query.search) {
      values.push(`%${query.search}%`);
      where.push(`(keyword."Keyword" ILIKE $${values.length} OR keyword."Keyword_Description" ILIKE $${values.length})`);
    }
    if (query.active !== undefined) {
      values.push(query.active === 'true');
      where.push(`COALESCE(keyword."Is_Active", false) = $${values.length}`);
    }
    values.push(limit, (page - 1) * limit);
    const rows = await this.dataSource.query(
      `SELECT keyword."Keyword" AS "keyword",keyword."Keyword_Description" AS "keywordDescription",
              keyword."Keyword_Scope" AS "keywordScope",keyword."Is_Financial" AS "isFinancial",
              keyword."Chargeable" AS "chargeable",keyword."Commissionable" AS "commissionable",
              keyword."MINIMUM_TRAN_AMOUNT"::numeric AS "minimumTranAmount",
              keyword."Service_Status" AS "serviceStatus",keyword."Is_Active" AS "isActive",
              keyword."Approved_By" AS "approvedBy",keyword."Approved_Date" AS "approvedDate",
              pending.id::text AS "pendingRequestId",pending.action AS "pendingAction",
              count(*) OVER()::int AS "totalCount"
       FROM public."SW_TBL_KEYWORD" keyword
       LEFT JOIN public.reference_data_change_requests pending
         ON pending.resource_type='KEYWORD' AND pending.resource_key=keyword."Keyword" AND pending.status='PENDING'
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY keyword."Keyword"
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return this.page(rows, page, limit);
  }

  async getKeyword(keyword: string) {
    const snapshot = await this.keywordSnapshot(this.dataSource.manager, this.keywordKey(keyword));
    if (!snapshot) throw new NotFoundException('Keyword not found');
    return { ...snapshot, pendingChange: await this.pending('KEYWORD', String(snapshot.keyword)) };
  }

  async createKeyword(dto: CreateKeywordDto, actor: AdminTokenPayload) {
    const { makerComment, ...input } = dto;
    const key = this.keywordKey(input.keyword);
    const proposed = { ...this.keywordDefaults(key), ...this.keywordPayload(input), keyword: key };
    return this.queue('KEYWORD', key, 'CREATE', null, proposed, makerComment, actor);
  }

  async updateKeyword(keyword: string, dto: UpdateKeywordDto, actor: AdminTokenPayload) {
    const key = this.keywordKey(keyword);
    const current = await this.keywordSnapshot(this.dataSource.manager, key);
    if (!current) throw new NotFoundException('Keyword not found');
    const { makerComment } = dto;
    const proposed = { ...current, ...this.keywordPayload(dto), keyword: key };
    return this.queue('KEYWORD', key, 'UPDATE', current, proposed, makerComment, actor);
  }

  async deleteKeyword(keyword: string, comment: string | undefined, actor: AdminTokenPayload) {
    const key = this.keywordKey(keyword);
    const current = await this.keywordSnapshot(this.dataSource.manager, key);
    if (!current) throw new NotFoundException('Keyword not found');
    const proposed = { ...current, isActive: false, serviceStatus: false };
    return this.queue('KEYWORD', key, 'DELETE', current, proposed, comment, actor);
  }

  async listWalletTypes(query: ReferenceListQueryDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 25, 200);
    const values: unknown[] = [];
    const where: string[] = [];
    if (query.search) {
      values.push(`%${query.search}%`);
      where.push(`(wallet."Wallet_ID"::text ILIKE $${values.length} OR wallet."Wallet_Name" ILIKE $${values.length})`);
    }
    if (query.active !== undefined) {
      values.push(query.active === 'true');
      where.push(`COALESCE(wallet."Status", false) = $${values.length}`);
    }
    values.push(limit, (page - 1) * limit);
    const rows = await this.dataSource.query(
      `SELECT wallet."Wallet_ID" AS "walletId",wallet."Wallet_Name" AS "walletName",
              wallet."Wallet_Details" AS "walletDetails",wallet."Wallet_Type" AS "walletType",
              wallet."Is_Kyc_Needed" AS "isKycNeeded",wallet."Default_Comission_Id" AS "defaultCommissionId",
              wallet."Default_Charge_Id" AS "defaultChargeId",wallet."Is_Charge" AS "isCharge",
              wallet."Fee"::numeric AS "fee",wallet."Hierarchy" AS "hierarchy",wallet."Status" AS "status",
              wallet."Approved_By" AS "approvedBy",wallet."Approved_Date" AS "approvedDate",
              pending.id::text AS "pendingRequestId",pending.action AS "pendingAction",
              count(*) OVER()::int AS "totalCount"
       FROM public."SW_TBL_WALLET_TYPE" wallet
       LEFT JOIN public.reference_data_change_requests pending
         ON pending.resource_type='WALLET_TYPE' AND pending.resource_key=wallet."Wallet_ID"::text AND pending.status='PENDING'
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY wallet."Wallet_ID"
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return this.page(rows, page, limit);
  }

  async getWalletType(walletId: number) {
    const snapshot = await this.walletTypeSnapshot(this.dataSource.manager, String(walletId));
    if (!snapshot) throw new NotFoundException('Wallet type not found');
    return { ...snapshot, pendingChange: await this.pending('WALLET_TYPE', String(walletId)) };
  }

  async createWalletType(dto: CreateWalletTypeDto, actor: AdminTokenPayload) {
    const { makerComment, ...input } = dto;
    const key = String(input.walletId);
    const proposed = { ...this.walletTypeDefaults(input.walletId), ...this.walletTypePayload(input), walletId: input.walletId };
    return this.queue('WALLET_TYPE', key, 'CREATE', null, proposed, makerComment, actor);
  }

  async updateWalletType(walletId: number, dto: UpdateWalletTypeDto, actor: AdminTokenPayload) {
    const key = String(walletId);
    const current = await this.walletTypeSnapshot(this.dataSource.manager, key);
    if (!current) throw new NotFoundException('Wallet type not found');
    const { makerComment } = dto;
    const proposed = { ...current, ...this.walletTypePayload(dto), walletId };
    return this.queue('WALLET_TYPE', key, 'UPDATE', current, proposed, makerComment, actor);
  }

  async deleteWalletType(walletId: number, comment: string | undefined, actor: AdminTokenPayload) {
    const key = String(walletId);
    const current = await this.walletTypeSnapshot(this.dataSource.manager, key);
    if (!current) throw new NotFoundException('Wallet type not found');
    return this.queue('WALLET_TYPE', key, 'DELETE', current, { ...current, status: false }, comment, actor);
  }

  async listAmlConfigurations(query: AmlConfigurationListQueryDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 25, 200);
    const values: unknown[] = [];
    const where: string[] = [];
    if (query.search) {
      values.push(`%${query.search}%`);
      where.push(`(aml."Wallet_Type"::text ILIKE $${values.length} OR aml."Keyword" ILIKE $${values.length}
        OR wallet."Wallet_Name" ILIKE $${values.length} OR keyword."Keyword_Description" ILIKE $${values.length})`);
    }
    if (query.active !== undefined) {
      values.push(query.active === 'true');
      where.push(`aml."Is_Active" = $${values.length}`);
    }
    if (query.walletCode !== undefined) {
      values.push(query.walletCode);
      where.push(`aml."Wallet_Type" = $${values.length}`);
    }
    if (query.keyword) {
      values.push(this.keywordKey(query.keyword));
      where.push(`aml."Keyword" = $${values.length}`);
    }
    values.push(limit, (page - 1) * limit);
    const rows = await this.dataSource.query(
      `SELECT aml."Row_Id" AS "rowId",aml."Wallet_Type" AS "walletCode",
              wallet."Wallet_Name" AS "walletName",wallet."Wallet_Type" AS "walletClass",
              aml."Keyword" AS "keyword",keyword."Keyword_Description" AS "keywordDescription",
              aml."Max_Txn_Amount"::numeric AS "maxTransactionAmount",
              aml."Daily_Max_Amount"::numeric AS "dailyMaxAmount",
              aml."Daily_Transaction_Count"::int AS "dailyTransactionCount",
              aml."Monthly_Max_Amount"::numeric AS "monthlyMaxAmount",
              aml."Monthly_Transaction_Count"::int AS "monthlyTransactionCount",
              aml."Is_Active" AS "isActive",aml."Approved_By" AS "approvedBy",
              aml."Approved_Date" AS "approvedDate",pending.id::text AS "pendingRequestId",
              pending.action AS "pendingAction",count(*) OVER()::int AS "totalCount"
       FROM public."SW_TBL_AML" aml
       JOIN public."SW_TBL_WALLET_TYPE" wallet ON wallet."Wallet_ID"=aml."Wallet_Type"
       JOIN public."SW_TBL_KEYWORD" keyword ON keyword."Keyword"=aml."Keyword"
       LEFT JOIN public.reference_data_change_requests pending
         ON pending.resource_type='AML'
        AND pending.resource_key=aml."Wallet_Type"::text || ':' || aml."Keyword"
        AND pending.status='PENDING'
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY aml."Wallet_Type",aml."Keyword"
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return this.page(rows, page, limit);
  }

  async getAmlConfiguration(walletCode: number, keyword: string) {
    const key = this.amlKey(walletCode, keyword);
    const snapshot = await this.amlSnapshot(this.dataSource.manager, key);
    if (!snapshot) throw new NotFoundException('AML configuration not found');
    return { ...snapshot, pendingChange: await this.pending('AML', key) };
  }

  async createAmlConfiguration(dto: CreateAmlConfigurationDto, actor: AdminTokenPayload) {
    const keyword = this.keywordKey(dto.keyword);
    await this.validateAmlReferences(this.dataSource.manager, dto.walletCode, keyword);
    const { makerComment, ...input } = dto;
    const proposed = { ...this.amlPayload(input), walletCode: dto.walletCode, keyword, isActive: dto.isActive ?? true };
    this.assertAmlLimits(proposed);
    return this.queue('AML', this.amlKey(dto.walletCode, keyword), 'CREATE', null, proposed, makerComment, actor);
  }

  async simulateAmlConfiguration(dto: SimulateAmlConfigurationDto) {
    const keyword = this.keywordKey(dto.keyword);
    await this.validateAmlReferences(this.dataSource.manager, dto.walletCode, keyword);
    const limits = this.amlPayload(dto);
    this.assertAmlLimits(limits);

    const transactionAmount = Number(dto.transactionAmount);
    const dailyAmountUsed = Number(dto.dailyAmountUsed ?? 0);
    const dailyTransactionUsed = Number(dto.dailyTransactionUsed ?? 0);
    const monthlyAmountUsed = Number(dto.monthlyAmountUsed ?? 0);
    const monthlyTransactionUsed = Number(dto.monthlyTransactionUsed ?? 0);
    const projected = {
      dailyAmount: Number((dailyAmountUsed + transactionAmount).toFixed(2)),
      dailyTransactionCount: dailyTransactionUsed + 1,
      monthlyAmount: Number((monthlyAmountUsed + transactionAmount).toFixed(2)),
      monthlyTransactionCount: monthlyTransactionUsed + 1,
    };
    const checks = [
      {
        code: 'MAX_TRANSACTION',
        label: 'Maximum transaction amount',
        used: transactionAmount,
        limit: Number(dto.maxTransactionAmount),
        statusCode: 'AML_MAX_TRANSACTION_EXCEEDED',
        statusMessage: 'Maximum transaction amount exceeded',
      },
      {
        code: 'DAILY_AMOUNT',
        label: 'Daily AML amount limit',
        used: projected.dailyAmount,
        limit: Number(dto.dailyMaxAmount),
        statusCode: 'AML_DAILY_AMOUNT_EXCEEDED',
        statusMessage: 'Daily AML amount limit exceeded',
      },
      {
        code: 'DAILY_COUNT',
        label: 'Daily AML transaction count',
        used: projected.dailyTransactionCount,
        limit: Number(dto.dailyTransactionCount),
        statusCode: 'AML_DAILY_COUNT_EXCEEDED',
        statusMessage: 'Daily AML transaction count exceeded',
      },
      {
        code: 'MONTHLY_AMOUNT',
        label: 'Monthly AML amount limit',
        used: projected.monthlyAmount,
        limit: Number(dto.monthlyMaxAmount),
        statusCode: 'AML_MONTHLY_AMOUNT_EXCEEDED',
        statusMessage: 'Monthly AML amount limit exceeded',
      },
      {
        code: 'MONTHLY_COUNT',
        label: 'Monthly AML transaction count',
        used: projected.monthlyTransactionCount,
        limit: Number(dto.monthlyTransactionCount),
        statusCode: 'AML_MONTHLY_COUNT_EXCEEDED',
        statusMessage: 'Monthly AML transaction count exceeded',
      },
    ].map((check) => ({
      ...check,
      passed: check.used <= check.limit,
      remaining: Number(Math.max(0, check.limit - check.used).toFixed(2)),
    }));
    const failed = checks.find((check) => !check.passed);
    return {
      success: !failed,
      decision: failed ? 'BLOCK' : 'PASS',
      statusCode: failed?.statusCode ?? 'AML_LIMITS_PASSED',
      statusMessage: failed?.statusMessage ?? 'AML limits passed; simulation did not reserve capacity',
      walletCode: dto.walletCode,
      keyword,
      transactionAmount,
      currentUsage: {
        dailyAmount: dailyAmountUsed,
        dailyTransactionCount: dailyTransactionUsed,
        monthlyAmount: monthlyAmountUsed,
        monthlyTransactionCount: monthlyTransactionUsed,
      },
      projectedUsage: projected,
      checks,
      readOnly: true,
    };
  }

  async updateAmlConfiguration(walletCode: number, keyword: string, dto: UpdateAmlConfigurationDto, actor: AdminTokenPayload) {
    const key = this.amlKey(walletCode, keyword);
    const current = await this.amlSnapshot(this.dataSource.manager, key);
    if (!current) throw new NotFoundException('AML configuration not found');
    const { makerComment } = dto;
    const proposed = { ...current, ...this.amlPayload(dto), walletCode, keyword: this.keywordKey(keyword) };
    this.assertAmlLimits(proposed);
    return this.queue('AML', key, 'UPDATE', current, proposed, makerComment, actor);
  }

  async deleteAmlConfiguration(walletCode: number, keyword: string, comment: string | undefined, actor: AdminTokenPayload) {
    const key = this.amlKey(walletCode, keyword);
    const current = await this.amlSnapshot(this.dataSource.manager, key);
    if (!current) throw new NotFoundException('AML configuration not found');
    return this.queue('AML', key, 'DELETE', current, { ...current, isActive: false }, comment, actor);
  }

  async listChangeRequests(query: ChangeRequestListQueryDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 25, 200);
    const values: unknown[] = [];
    const where: string[] = [];
    if (query.resourceType) { values.push(query.resourceType); where.push(`resource_type=$${values.length}`); }
    if (query.status) { values.push(query.status); where.push(`status=$${values.length}`); }
    if (query.search) { values.push(`%${query.search}%`); where.push(`resource_key ILIKE $${values.length}`); }
    values.push(limit, (page - 1) * limit);
    const rows = await this.dataSource.query(
      `SELECT *,count(*) OVER()::int AS "totalCount"
       FROM public.reference_data_change_requests
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY CASE WHEN status='PENDING' THEN 0 ELSE 1 END,created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return this.page(rows.map((row: any) => this.publicRequest(row)), page, limit);
  }

  async getChangeRequest(id: string) {
    const rows = await this.dataSource.query(
      `SELECT * FROM public.reference_data_change_requests WHERE id=$1::bigint`, [id],
    );
    if (!rows[0]) throw new NotFoundException('Change request not found');
    return this.publicRequest(rows[0]);
  }

  async approve(id: string, comment: string | undefined, actor: AdminTokenPayload) {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    let resource: ResourceType | undefined;
    try {
      const rows = await runner.query(
        `SELECT * FROM public.reference_data_change_requests WHERE id=$1::bigint FOR UPDATE`, [id],
      ) as any[];
      const request = rows[0];
      if (!request) throw new NotFoundException('Change request not found');
      this.assertPending(request);
      this.assertDifferentUser(request, actor);
      resource = request.resource_type as ResourceType;
      const current = await this.snapshot(runner.manager, resource, request.resource_key);
      if (request.action === 'CREATE' && current) throw new ConflictException('The live record was created after this request was submitted');
      if (request.action !== 'CREATE' && !current) throw new ConflictException('The live record no longer exists');
      if (request.action !== 'CREATE' && !await this.sameJson(current, request.base_snapshot)) {
        throw new ConflictException('The live record changed after this request was submitted; reject it and create a new request');
      }
      await this.apply(runner.manager, resource, request.proposed_snapshot, request.action, request.maker_username, actor.username);
      const decided = await runner.query(
        `UPDATE public.reference_data_change_requests
         SET status='APPROVED',checker_user_id=$2::bigint,checker_username=$3,
             checker_comment=$4,decided_at=CURRENT_TIMESTAMP
         WHERE id=$1::bigint RETURNING *`,
        [id, actor.sub, actor.username, comment ?? null],
      ) as any[];
      await runner.commitTransaction();
      await this.invalidateReferenceCaches();
      return this.publicRequest(decided[0]);
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  async reject(id: string, reason: string, actor: AdminTokenPayload) {
    const superAdmin = actor.roles?.includes('super_admin');
    const rows = await this.dataSource.query(
      `UPDATE public.reference_data_change_requests
       SET status='REJECTED',checker_user_id=$2::bigint,checker_username=$3,
           checker_comment=$4,decided_at=CURRENT_TIMESTAMP
       WHERE id=$1::bigint AND status='PENDING'
         AND ($5::boolean OR maker_user_id<>$2::bigint)
       RETURNING *`,
      [id, actor.sub, actor.username, reason, superAdmin],
    );
    if (rows[0]) return this.publicRequest(rows[0]);
    const request = await this.requestRow(id);
    this.assertPending(request);
    this.assertDifferentUser(request, actor);
    throw new ConflictException('Change request could not be rejected');
  }

  async cancel(id: string, actor: AdminTokenPayload) {
    const rows = await this.dataSource.query(
      `UPDATE public.reference_data_change_requests
       SET status='CANCELLED',checker_comment='Cancelled by maker',decided_at=CURRENT_TIMESTAMP
       WHERE id=$1::bigint AND status='PENDING' AND maker_user_id=$2::bigint
       RETURNING *`,
      [id, actor.sub],
    );
    if (!rows[0]) throw new ForbiddenException('Only the maker can cancel their pending request');
    return this.publicRequest(rows[0]);
  }

  private async queue(
    resource: ResourceType,
    key: string,
    action: ChangeAction,
    base: Snapshot | null,
    proposed: Snapshot,
    comment: string | undefined,
    actor: AdminTokenPayload,
  ) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`${resource}:${key}`]);
        const current = await this.snapshot(manager, resource, key);
        if (action === 'CREATE' && current) throw new ConflictException('Record already exists');
        if (action !== 'CREATE' && !current) throw new NotFoundException('Record not found');
        if (action !== 'CREATE') {
          const unchanged = await manager.query(
            `SELECT $1::jsonb = $2::jsonb AS same`,
            [JSON.stringify(current), JSON.stringify(proposed)],
          );
          if (unchanged[0]?.same === true) {
            throw new ConflictException('No changes detected; an identical rule already exists');
          }
        }
        const pending = await manager.query(
          `SELECT id FROM public.reference_data_change_requests
           WHERE resource_type=$1 AND resource_key=$2 AND status='PENDING'`, [resource, key],
        );
        if (pending[0]) throw new ConflictException(`Pending change request ${pending[0].id} already exists for this record`);
        const rows = await manager.query(
          `INSERT INTO public.reference_data_change_requests
           (resource_type,resource_key,action,base_snapshot,proposed_snapshot,
            maker_user_id,maker_username,maker_comment)
           VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::bigint,$7,$8) RETURNING *`,
          [resource, key, action, base ? JSON.stringify(base) : null, JSON.stringify(proposed),
            actor.sub, actor.username, comment ?? null],
        );
        return this.publicRequest(rows[0]);
      });
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('A pending change request already exists for this record');
      throw error;
    }
  }

  private async keywordSnapshot(manager: EntityManager, key: string): Promise<Snapshot | null> {
    const rows = await manager.query(
      `SELECT jsonb_build_object(
         'keyword',"Keyword",'keywordDescription',"Keyword_Description",'keywordScope',trim("Keyword_Scope"),
         'isFinancial',COALESCE("Is_Financial",false),'chargeable',trim("Chargeable"),
         'kcIdLookup',trim("Kc_Id_Lookup"),'commissionable',trim("Commissionable"),
         'kcmIdLookup',trim("Kcm_Id_Lookup"),'minimumTranAmount',"MINIMUM_TRAN_AMOUNT"::numeric,
         'involvedParty',"INVOLVED_PARTY",'applyTds',COALESCE("ApplyTds",false),
         'isRewardApplicable',COALESCE("Is_Reward_Applicable",false),
         'isSystemKeyword',COALESCE("Is_System_Keyword",false),'serviceStatus',COALESCE("Service_Status",false),
         'vatSource',trim("vat_source"),'vatId',"VatId",'keywordDescriptionLocal',"Keyword_Description_Local",
         'isCategoryService',COALESCE("Is_category_service",false),'priority',priority,
         'reverseKeyword',"RKEYWORD",'isActive',COALESCE("Is_Active",false)
       ) AS snapshot FROM public."SW_TBL_KEYWORD" WHERE "Keyword"=$1`, [key],
    );
    return rows[0]?.snapshot ?? null;
  }

  private async walletTypeSnapshot(manager: EntityManager, key: string): Promise<Snapshot | null> {
    const rows = await manager.query(
      `SELECT jsonb_build_object(
         'walletId',"Wallet_ID",'walletName',"Wallet_Name",'walletDetails',"Wallet_Details",
         'isKycNeeded',COALESCE("Is_Kyc_Needed",false),'defaultCommissionId',"Default_Comission_Id",
         'defaultChargeId',"Default_Charge_Id",'walletType',"Wallet_Type",'isCharge',COALESCE("Is_Charge",false),
         'fee',"Fee"::numeric,'hierarchy',"Hierarchy",'status',COALESCE("Status",false),
         'walletNameLocal',"Wallet_Name_Local"
       ) AS snapshot FROM public."SW_TBL_WALLET_TYPE" WHERE "Wallet_ID"=$1::integer`, [key],
    );
    return rows[0]?.snapshot ?? null;
  }

  private async amlSnapshot(manager: EntityManager, key: string): Promise<Snapshot | null> {
    const { walletCode, keyword } = this.parseAmlKey(key);
    const rows = await manager.query(
      `SELECT jsonb_build_object(
         'rowId',"Row_Id",'walletCode',"Wallet_Type",'keyword',"Keyword",
         'maxTransactionAmount',"Max_Txn_Amount"::numeric,
         'dailyMaxAmount',"Daily_Max_Amount"::numeric,
         'dailyTransactionCount',"Daily_Transaction_Count"::int,
         'monthlyMaxAmount',"Monthly_Max_Amount"::numeric,
         'monthlyTransactionCount',"Monthly_Transaction_Count"::int,
         'isActive',"Is_Active"
       ) AS snapshot
       FROM public."SW_TBL_AML" WHERE "Wallet_Type"=$1::integer AND "Keyword"=$2`,
      [walletCode, keyword],
    );
    return rows[0]?.snapshot ?? null;
  }

  private snapshot(manager: EntityManager, resource: ResourceType, key: string) {
    if (resource === 'KEYWORD') return this.keywordSnapshot(manager, key);
    if (resource === 'WALLET_TYPE') return this.walletTypeSnapshot(manager, key);
    return this.amlSnapshot(manager, key);
  }

  private async apply(
    manager: EntityManager,
    resource: ResourceType,
    snapshot: Snapshot,
    action: ChangeAction,
    maker: string,
    checker: string,
  ) {
    if (resource === 'KEYWORD') return this.applyKeyword(manager, snapshot, action, maker, checker);
    if (resource === 'WALLET_TYPE') return this.applyWalletType(manager, snapshot, action, maker, checker);
    return this.applyAmlConfiguration(manager, snapshot, action, maker, checker);
  }

  private async applyKeyword(manager: EntityManager, value: Snapshot, action: ChangeAction, maker: string, checker: string) {
    const args = [value.keyword,value.keywordDescription,value.keywordScope,value.isFinancial,value.chargeable,
      value.kcIdLookup,value.commissionable,value.kcmIdLookup,value.minimumTranAmount,value.involvedParty,
      value.applyTds,value.isRewardApplicable,value.isSystemKeyword,value.serviceStatus,value.vatSource,value.vatId,
      value.keywordDescriptionLocal,value.isCategoryService,value.priority,value.reverseKeyword,value.isActive,
      this.auditName(maker),this.auditName(checker)];
    if (action === 'CREATE') {
      await manager.query(
        `INSERT INTO public."SW_TBL_KEYWORD" (
           "Keyword","Keyword_Description","Keyword_Scope","Is_Financial","Chargeable","Kc_Id_Lookup",
           "Commissionable","Kcm_Id_Lookup","MINIMUM_TRAN_AMOUNT","INVOLVED_PARTY","ApplyTds",
           "Is_Reward_Applicable","Is_System_Keyword","Service_Status","vat_source","VatId",
           "Keyword_Description_Local","Is_category_service",priority,"RKEYWORD","Is_Active",
           "Created_By","Created_Date","Approved_By","Approved_Date")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,CURRENT_TIMESTAMP,$23,CURRENT_TIMESTAMP)`,
        args,
      );
    } else {
      await manager.query(
        `UPDATE public."SW_TBL_KEYWORD" SET
           "Keyword_Description"=$2,"Keyword_Scope"=$3,"Is_Financial"=$4,"Chargeable"=$5,"Kc_Id_Lookup"=$6,
           "Commissionable"=$7,"Kcm_Id_Lookup"=$8,"MINIMUM_TRAN_AMOUNT"=$9,"INVOLVED_PARTY"=$10,
           "ApplyTds"=$11,"Is_Reward_Applicable"=$12,"Is_System_Keyword"=$13,"Service_Status"=$14,
           "vat_source"=$15,"VatId"=$16,"Keyword_Description_Local"=$17,"Is_category_service"=$18,
           priority=$19,"RKEYWORD"=$20,"Is_Active"=$21,"Modified_By"=$22,"Modified_Date"=CURRENT_TIMESTAMP,
           "Approved_By"=$23,"Approved_Date"=CURRENT_TIMESTAMP WHERE "Keyword"=$1`,
        args,
      );
    }
  }

  private async applyWalletType(manager: EntityManager, value: Snapshot, action: ChangeAction, maker: string, checker: string) {
    const args = [value.walletId,value.walletName,value.walletDetails,value.isKycNeeded,value.defaultCommissionId,
      value.defaultChargeId,value.walletType,value.isCharge,value.fee,value.hierarchy,value.status,
      value.walletNameLocal,this.auditName(maker),this.auditName(checker)];
    if (action === 'CREATE') {
      await manager.query(
        `INSERT INTO public."SW_TBL_WALLET_TYPE" (
           "Wallet_ID","Wallet_Name","Wallet_Details","Is_Kyc_Needed","Default_Comission_Id",
           "Default_Charge_Id","Wallet_Type","Is_Charge","Fee","Hierarchy","Status","Wallet_Name_Local",
           "Created_By","Created_Date","Approved_By","Approved_Date")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,CURRENT_TIMESTAMP,$14,CURRENT_TIMESTAMP)`,
        args,
      );
    } else {
      await manager.query(
        `UPDATE public."SW_TBL_WALLET_TYPE" SET
           "Wallet_Name"=$2,"Wallet_Details"=$3,"Is_Kyc_Needed"=$4,"Default_Comission_Id"=$5,
           "Default_Charge_Id"=$6,"Wallet_Type"=$7,"Is_Charge"=$8,"Fee"=$9,"Hierarchy"=$10,
           "Status"=$11,"Wallet_Name_Local"=$12,"Modified_By"=$13,"Modified_Date"=CURRENT_TIMESTAMP,
           "Approved_By"=$14,"Approved_Date"=CURRENT_TIMESTAMP WHERE "Wallet_ID"=$1`,
        args,
      );
    }
  }

  private async applyAmlConfiguration(manager: EntityManager, value: Snapshot, action: ChangeAction, maker: string, checker: string) {
    const args = [value.walletCode,value.keyword,value.maxTransactionAmount,value.monthlyMaxAmount,
      value.monthlyTransactionCount,value.dailyMaxAmount,value.dailyTransactionCount,value.isActive,
      this.auditName(maker),this.auditName(checker)];
    if (action === 'CREATE') {
      await manager.query(
        `INSERT INTO public."SW_TBL_AML" (
           "Wallet_Type","Keyword","Max_Txn_Amount","Monthly_Max_Amount","Monthly_Transaction_Count",
           "Daily_Max_Amount","Daily_Transaction_Count","Is_Active","Created_By","Created_Date",
           "Approved_By","Approved_Date")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP,$10,CURRENT_TIMESTAMP)`,
        args,
      );
    } else {
      await manager.query(
        `UPDATE public."SW_TBL_AML" SET
           "Max_Txn_Amount"=$3,"Monthly_Max_Amount"=$4,"Monthly_Transaction_Count"=$5,
           "Daily_Max_Amount"=$6,"Daily_Transaction_Count"=$7,"Is_Active"=$8,
           "Modified_By"=$9,"Modified_Date"=CURRENT_TIMESTAMP,
           "Approved_By"=$10,"Approved_Date"=CURRENT_TIMESTAMP
         WHERE "Wallet_Type"=$1 AND "Keyword"=$2`,
        args,
      );
    }
  }

  private keywordPayload(input: object): Snapshot {
    return this.pickDefined(input as Record<string, unknown>, ['keywordDescription','keywordScope','isFinancial','chargeable','kcIdLookup',
      'commissionable','kcmIdLookup','minimumTranAmount','involvedParty','applyTds','isRewardApplicable',
      'isSystemKeyword','serviceStatus','vatSource','vatId','keywordDescriptionLocal','isCategoryService',
      'priority','reverseKeyword','isActive']);
  }

  private walletTypePayload(input: object): Snapshot {
    return this.pickDefined(input as Record<string, unknown>, ['walletName','walletDetails','isKycNeeded','defaultCommissionId','defaultChargeId',
      'walletType','isCharge','fee','hierarchy','status','walletNameLocal']);
  }

  private amlPayload(input: object): Snapshot {
    return this.pickDefined(input as Record<string, unknown>, ['maxTransactionAmount','dailyMaxAmount',
      'dailyTransactionCount','monthlyMaxAmount','monthlyTransactionCount','isActive']);
  }

  private assertAmlLimits(value: Snapshot) {
    const maxTransaction = Number(value.maxTransactionAmount);
    const dailyAmount = Number(value.dailyMaxAmount);
    const monthlyAmount = Number(value.monthlyMaxAmount);
    const dailyCount = Number(value.dailyTransactionCount);
    const monthlyCount = Number(value.monthlyTransactionCount);
    if (![maxTransaction, dailyAmount, monthlyAmount, dailyCount, monthlyCount].every(Number.isFinite)) {
      throw new BadRequestException('All AML limits are required and must be valid numbers');
    }
    if (maxTransaction > dailyAmount) {
      throw new BadRequestException('Maximum transaction amount cannot exceed the daily maximum amount');
    }
    if (dailyAmount > monthlyAmount) {
      throw new BadRequestException('Daily maximum amount cannot exceed the monthly maximum amount');
    }
    if (dailyCount > monthlyCount) {
      throw new BadRequestException('Daily transaction count cannot exceed the monthly transaction count');
    }
  }

  private async validateAmlReferences(manager: EntityManager, walletCode: number, keyword: string) {
    const rows = await manager.query(
      `SELECT EXISTS(SELECT 1 FROM public."SW_TBL_WALLET_TYPE" WHERE "Wallet_ID"=$1) AS wallet_exists,
              EXISTS(SELECT 1 FROM public."SW_TBL_KEYWORD" WHERE "Keyword"=$2) AS keyword_exists`,
      [walletCode, keyword],
    );
    if (!rows[0]?.wallet_exists) throw new NotFoundException('Wallet code not found');
    if (!rows[0]?.keyword_exists) throw new NotFoundException('Keyword not found');
  }

  private keywordDefaults(keyword: string): Snapshot {
    return { keyword,keywordDescription:null,keywordScope:null,isFinancial:true,chargeable:'N',kcIdLookup:null,
      commissionable:'N',kcmIdLookup:null,minimumTranAmount:1,involvedParty:null,applyTds:false,
      isRewardApplicable:false,isSystemKeyword:false,serviceStatus:true,vatSource:'D',vatId:1,
      keywordDescriptionLocal:null,isCategoryService:false,priority:null,reverseKeyword:null,isActive:false };
  }

  private walletTypeDefaults(walletId: number): Snapshot {
    return { walletId,walletName:null,walletDetails:null,isKycNeeded:false,defaultCommissionId:1,defaultChargeId:1,
      walletType:100,isCharge:true,fee:null,hierarchy:null,status:false,walletNameLocal:null };
  }

  private pickDefined(input: Record<string, unknown>, keys: string[]): Snapshot {
    return Object.fromEntries(keys.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
  }

  private async pending(resource: ResourceType, key: string) {
    const rows = await this.dataSource.query(
      `SELECT * FROM public.reference_data_change_requests
       WHERE resource_type=$1 AND resource_key=$2 AND status='PENDING'`, [resource, key],
    );
    return rows[0] ? this.publicRequest(rows[0]) : null;
  }

  private async requestRow(id: string) {
    const rows = await this.dataSource.query(
      `SELECT * FROM public.reference_data_change_requests WHERE id=$1::bigint`, [id],
    );
    if (!rows[0]) throw new NotFoundException('Change request not found');
    return rows[0];
  }

  private assertPending(request: any) {
    if (request.status !== 'PENDING') throw new ConflictException(`Change request is already ${request.status}`);
  }

  private assertDifferentUser(request: any, actor: AdminTokenPayload) {
    if (
      String(request.maker_user_id) === String(actor.sub) &&
      !actor.roles?.includes('super_admin')
    ) {
      throw new ForbiddenException('Maker cannot approve or reject their own change request');
    }
  }

  private async sameJson(left: unknown, right: unknown) {
    const rows = await this.dataSource.query(`SELECT $1::jsonb = $2::jsonb AS same`, [JSON.stringify(left), JSON.stringify(right)]);
    return rows[0]?.same === true;
  }

  private publicRequest(row: any) {
    return {
      id: String(row.id), resourceType: row.resource_type, resourceKey: row.resource_key,
      action: row.action, status: row.status, baseSnapshot: row.base_snapshot,
      proposedSnapshot: row.proposed_snapshot, makerUserId: String(row.maker_user_id),
      makerUsername: row.maker_username, makerComment: row.maker_comment,
      checkerUserId: row.checker_user_id === null ? null : String(row.checker_user_id),
      checkerUsername: row.checker_username, checkerComment: row.checker_comment,
      createdAt: row.created_at, decidedAt: row.decided_at,
      ...(row.totalCount !== undefined ? { totalCount: row.totalCount } : {}),
    };
  }

  private page(rows: any[], page: number, limit: number) {
    const totalRecords = rows.length ? Number(rows[0].totalCount ?? 0) : 0;
    return { data: rows.map(({ totalCount, ...row }) => row), totalRecords, currentPage: page,
      totalPages: Math.ceil(totalRecords / limit), pageSize: limit };
  }

  private keywordKey(value: string) { return value.trim().toUpperCase(); }
  private amlKey(walletCode: number, keyword: string) { return `${walletCode}:${this.keywordKey(keyword)}`; }
  private parseAmlKey(key: string) {
    const separator = key.indexOf(':');
    const walletCode = Number(key.slice(0, separator));
    const keyword = this.keywordKey(key.slice(separator + 1));
    if (separator < 1 || !Number.isInteger(walletCode) || walletCode < 1 || !keyword) {
      throw new BadRequestException('Invalid AML configuration key');
    }
    return { walletCode, keyword };
  }
  private auditName(value: string) { return value.slice(0, 20); }

  private async invalidateReferenceCaches() {
    try {
      await this.cache?.setEx('charge:config:version', 86400 * 365, String(Date.now()));
      await this.cache?.setEx('commission:config:version', 86400 * 365, String(Date.now()));
      await this.cache?.setEx('aml:config:version', 86400 * 365, String(Date.now()));
    } catch {}
  }
}
