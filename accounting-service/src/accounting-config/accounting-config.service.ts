import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateAccountingConfigDto } from './accounting-config.dto';

@Injectable()
export class AccountingConfigService {
  constructor(private readonly dataSource: DataSource) {}

  list() {
    return this.dataSource.query(
      `SELECT config.id::text,config.reporting_entity AS "reportingEntity",
              config.currency,config.base_currency AS "baseCurrency",
              config.business_timezone AS "businessTimezone",
              config.cutoff_time::text AS "cutoffTime",
              config.master_wallet::text AS "masterWallet",
              config.strict_safeguarding AS "strictSafeguarding",
              config.effective_from AS "effectiveFrom",
              config.effective_to AS "effectiveTo",config.is_active AS "isActive",
              wallet."Wallet_Code" AS "masterWalletCode",wallet."Amount"::numeric AS "masterBalance"
       FROM public.sw_tbl_accounting_configuration config
       JOIN public."SW_TBL_WALLET" wallet ON wallet."Wallet_MSISDN"=config.master_wallet
       ORDER BY config.reporting_entity,config.currency,config.effective_from DESC`,
    );
  }

  activeCurrencies(reportingEntity = 'FINIFY_UK') {
    return this.dataSource.query<Array<{ currency: string; businessTimezone: string; cutoffTime: string }>>(
      `SELECT currency,business_timezone AS "businessTimezone",cutoff_time::text AS "cutoffTime"
       FROM public.sw_tbl_accounting_configuration
       WHERE reporting_entity=$1 AND is_active
         AND effective_from<=CURRENT_DATE
         AND (effective_to IS NULL OR effective_to>=CURRENT_DATE)
       ORDER BY currency`,
      [reportingEntity],
    );
  }

  async create(dto: CreateAccountingConfigDto) {
    if (dto.maker.trim().toLowerCase() === dto.checker.trim().toLowerCase()) {
      throw new BadRequestException('Maker and checker must be different users');
    }
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: dto.businessTimezone }).format(new Date());
    } catch {
      throw new BadRequestException('businessTimezone must be a valid IANA timezone');
    }
    const currency = dto.currency.toUpperCase();
    const baseCurrency = dto.baseCurrency.toUpperCase();
    return this.dataSource.transaction(async manager => {
      const wallets = await manager.query<Array<Record<string, unknown>>>(
        `SELECT "Wallet_MSISDN"::text AS msisdn,upper(currency) AS currency,"Status" AS status
         FROM public."SW_TBL_WALLET" WHERE "Wallet_MSISDN"=$1::bigint FOR UPDATE`,
        [dto.masterWallet],
      );
      if (!wallets[0]) throw new NotFoundException('Master wallet was not found');
      if (wallets[0].currency !== currency || Number(wallets[0].status) !== 0) {
        throw new BadRequestException('Master wallet must be active and use the configured currency');
      }
      await manager.query(
        `UPDATE public.sw_tbl_accounting_configuration
         SET effective_to=$3::date-1,is_active=true
         WHERE reporting_entity=$1 AND currency=$2 AND is_active AND effective_to IS NULL`,
        [dto.reportingEntity, currency, dto.effectiveFrom],
      );
      const rows = await manager.query(
        `INSERT INTO public.sw_tbl_accounting_configuration (
           reporting_entity,currency,base_currency,business_timezone,cutoff_time,
           master_wallet,strict_safeguarding,effective_from,created_by,approved_by)
         VALUES($1,$2,$3,$4,$5::time,$6::bigint,$7,$8::date,$9,$10)
         RETURNING id::text,reporting_entity AS "reportingEntity",currency,
                   business_timezone AS "businessTimezone",cutoff_time::text AS "cutoffTime",
                   master_wallet::text AS "masterWallet",effective_from AS "effectiveFrom"`,
        [dto.reportingEntity, currency, baseCurrency, dto.businessTimezone, dto.cutoffTime,
          dto.masterWallet, dto.strictSafeguarding, dto.effectiveFrom, dto.maker, dto.checker],
      );
      return rows[0];
    });
  }
}
