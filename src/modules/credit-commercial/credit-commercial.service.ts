import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { DataSource } from 'typeorm';
import {
  CreateCreditCommercialConfigurationDto,
  SimulateCreditCommercialConfigurationDto,
  UpdateCreditCommercialConfigurationDto,
} from './dto/credit-commercial.dto';

type DatabaseError = Error & { code?: string };

@Injectable()
export class CreditCommercialService {
  constructor(private readonly dataSource: DataSource) {}

  async metadata() {
    const [row] = await this.dataSource.query(`
      SELECT jsonb_build_object(
        'merchants',COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id',merchant.id::text,'code',merchant.code,'name',merchant.display_name,
          'countryCode',merchant.country_code,'walletTypeCode',merchant.default_wallet_type_code
        ) ORDER BY merchant.display_name) FROM public.business_merchants merchant
          WHERE merchant.status='ACTIVE' AND merchant.merchant_type_code='BANK'),'[]'::jsonb),
        'lenders',COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id',lender.id::text,'code',lender.code,'name',lender.name,'countryCode',lender.country_code,
          'merchantId',lender.merchant_id::text,'allocationWeight',lender.allocation_weight,
          'settlementWalletTypeCode',lender.settlement_wallet_type_code
        ) ORDER BY lender.name) FROM public.credit_lenders lender WHERE lender.status='ACTIVE'),'[]'::jsonb),
        'customerWalletTypes',COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'code',wallet."Wallet_ID",'name',wallet."Wallet_Name"
        ) ORDER BY wallet."Wallet_ID") FROM public."SW_TBL_WALLET_TYPE" wallet
          WHERE wallet."Status" AND wallet."Wallet_Type"=100),'[]'::jsonb),
        'settlementWalletTypes',COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'code',wallet."Wallet_ID",'name',wallet."Wallet_Name"
        ) ORDER BY wallet."Wallet_ID") FROM public."SW_TBL_WALLET_TYPE" wallet
          WHERE wallet."Status" AND wallet."Wallet_Type"=200),'[]'::jsonb),
        'channels',COALESCE((SELECT jsonb_agg(jsonb_build_object('code',channel.code,'name',channel.name)
          ORDER BY channel.name) FROM onboarding.channels channel WHERE channel.is_active),'[]'::jsonb),
        'creditProducts',COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'code',product.rule_code,'name',product.name,'currency',product.currency
        ) ORDER BY product.name) FROM public.credit_master_rules product WHERE product.status='ACTIVE'),'[]'::jsonb),
        'fineractProducts',COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object(
          'id',binding.fineract_product_id,'name',binding.fineract_product_name,
          'tenant',binding.fineract_tenant,'currency',binding.currency
        )) FROM public.credit_product_bindings binding WHERE binding.fineract_product_id IS NOT NULL),'[]'::jsonb),
        'countries',COALESCE((SELECT jsonb_agg(DISTINCT merchant.country_code)
          FROM public.business_merchants merchant WHERE merchant.status='ACTIVE'),'[]'::jsonb),
        'currencies',COALESCE((SELECT jsonb_agg(DISTINCT upper(configuration.currency))
          FROM public.sw_tbl_accounting_configuration configuration WHERE configuration.is_active),'[]'::jsonb)
      ) AS metadata
    `);
    return row?.metadata ?? {};
  }

  async list(filters: { status?: string; environmentScope?: string }) {
    const values: unknown[] = [];
    const where = ['1=1'];
    if (filters.status) {
      values.push(filters.status.toUpperCase());
      where.push(`binding.status=$${values.length}`);
    }
    if (filters.environmentScope) {
      values.push(filters.environmentScope.toUpperCase());
      where.push(`binding.environment_scope=$${values.length}`);
    }
    const rows = await this.dataSource.query(
      `SELECT public.credit_commercial_configuration_view(binding.id) AS configuration
       FROM public.credit_product_bindings binding WHERE ${where.join(' AND ')}
       ORDER BY binding.updated_at DESC,binding.code,binding.version DESC`,
      values,
    );
    return rows.map((row: { configuration: unknown }) => row.configuration);
  }

  async get(id: string) {
    const [row] = await this.dataSource.query(
      `SELECT public.credit_commercial_configuration_view($1::uuid) AS configuration`,
      [id],
    );
    if (!row?.configuration) throw new NotFoundException('Commercial configuration was not found');
    return row.configuration;
  }

  async audit(id: string) {
    return this.dataSource.query(
      `SELECT id::text,action,actor_id AS "actorId",reason,created_at AS "createdAt",
              previous_state AS "previousState",new_state AS "newState"
       FROM public.credit_commercial_configuration_audit
       WHERE binding_id=$1::uuid ORDER BY created_at DESC,id DESC LIMIT 100`,
      [id],
    );
  }

  async create(dto: CreateCreditCommercialConfigurationDto, actor: string) {
    try {
      const [row] = await this.dataSource.query(
        `SELECT public.create_credit_commercial_configuration($1,$2,$3::jsonb) AS configuration`,
        [dto.code, actor, JSON.stringify(dto)],
      );
      return row.configuration;
    } catch (error) {
      this.raiseDatabaseError(error as DatabaseError);
    }
  }

  async update(id: string, dto: UpdateCreditCommercialConfigurationDto, actor: string) {
    try {
      const [row] = await this.dataSource.query(
        `SELECT public.apply_credit_commercial_configuration($1::uuid,$2,$3,$4::jsonb) AS configuration`,
        [id, dto.expectedRevision, actor, JSON.stringify(dto)],
      );
      return row.configuration;
    } catch (error) {
      this.raiseDatabaseError(error as DatabaseError);
    }
  }

  async transition(
    id: string,
    expectedRevision: number,
    action: 'SUBMIT' | 'APPROVE' | 'ACTIVATE' | 'REJECT' | 'RETIRE',
    actor: string,
    reason?: string,
  ) {
    try {
      const [row] = await this.dataSource.query(
        `SELECT public.transition_credit_commercial_configuration(
          $1::uuid,$2,$3,$4,$5
        ) AS configuration`,
        [id, expectedRevision, action, actor, reason || null],
      );
      return row.configuration;
    } catch (error) {
      this.raiseDatabaseError(error as DatabaseError);
    }
  }

  async simulate(dto: SimulateCreditCommercialConfigurationDto) {
    const status = dto.environmentScope === 'TEST' ? 'TEST_ACTIVE' : 'ACTIVE';
    const [row] = await this.dataSource.query(
      `SELECT public.credit_commercial_configuration_view(binding.id) AS configuration
       FROM public.credit_product_bindings binding
       JOIN public.credit_lenders lender ON lender.id=binding.lender_id AND lender.status='ACTIVE'
       WHERE binding.status=$1 AND binding.environment_scope=$2 AND binding.product_id=upper($3)
         AND binding.country_code=upper($4) AND binding.currency=upper($5)
         AND (binding.channel IS NULL OR binding.channel=upper($6))
       ORDER BY CASE WHEN binding.channel=upper($6) THEN 0 ELSE 1 END,binding.version DESC LIMIT 1`,
      [status, dto.environmentScope, dto.productId, dto.countryCode, dto.currency, dto.channel],
    );
    if (!row?.configuration) {
      return { matched: false, reasonCode: 'COMMERCIAL_BINDING_INACTIVE' };
    }
    const configuration = row.configuration as Record<string, unknown>;
    const principal = new Decimal(dto.principal);
    const fee = (type: unknown, value: unknown) =>
      String(type) === 'PERCENT'
        ? principal.mul(new Decimal(String(value || 0))).div(100)
        : new Decimal(String(value || 0));
    return {
      matched: true,
      configuration,
      projection: {
        principal: principal.toNumber(),
        processingFee: fee(configuration.processingFeeType, configuration.processingFeeValue).toNumber(),
        lateFee: fee(configuration.lateFeeType, configuration.lateFeeValue).toNumber(),
        earlySettlementFee: configuration.earlySettlementAllowed
          ? fee(configuration.earlySettlementFeeType, configuration.earlySettlementFeeValue).toNumber()
          : null,
      },
    };
  }

  private raiseDatabaseError(error: DatabaseError): never {
    const message = error.message?.replace(/^.*ERROR:\s*/i, '') || 'Commercial configuration failed';
    if (error.code === 'P0002') throw new NotFoundException(message);
    if (error.code === '42501') throw new ForbiddenException(message);
    if (['40001', '55000', '23505'].includes(String(error.code))) throw new ConflictException(message);
    if (['22023', '23503', '23514'].includes(String(error.code))) throw new BadRequestException(message);
    throw error;
  }
}
