import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateAccountingConfigDto, ProvisionCurrencyDto } from './accounting-config.dto';

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

  currencyUniverse(reportingEntity = 'FINIFY_UK') {
    return this.dataSource.query<Array<{ currency: string; configured: boolean }>>(
      `WITH currencies AS (
         SELECT upper(currency)::varchar(3) AS currency FROM public."SW_TBL_WALLET"
         UNION
         SELECT upper(currency)::varchar(3) FROM public.sw_tbl_accounting_journal
         UNION
         SELECT upper(currency)::varchar(3) FROM public.sw_tbl_accounting_configuration
           WHERE reporting_entity=$1
       )
       SELECT currencies.currency,(config.currency IS NOT NULL) AS configured
       FROM currencies
       LEFT JOIN public.sw_tbl_accounting_configuration config
         ON config.reporting_entity=$1 AND config.currency=currencies.currency
        AND config.is_active AND config.effective_from<=CURRENT_DATE
        AND (config.effective_to IS NULL OR config.effective_to>=CURRENT_DATE)
       WHERE currencies.currency ~ '^[A-Z]{3}$'
       ORDER BY currencies.currency`,
      [reportingEntity],
    );
  }

  currencyOverview(reportingEntity = 'FINIFY_UK', businessDate?: string) {
    return this.dataSource.query(
      `WITH currencies AS (
         SELECT upper(currency)::varchar(3) AS currency FROM public."SW_TBL_WALLET"
         UNION
         SELECT upper(currency)::varchar(3) FROM public.sw_tbl_accounting_journal
         UNION
         SELECT upper(currency)::varchar(3) FROM public.sw_tbl_accounting_configuration
           WHERE reporting_entity=$1
       )
       SELECT currencies.currency,
              (config.id IS NOT NULL) AS configured,
              config.base_currency AS "baseCurrency",
              config.business_timezone AS "businessTimezone",
              config.cutoff_time::text AS "cutoffTime",
              config.master_wallet::text AS "masterWallet",
              master."Amount"::numeric AS "masterBalance",
              config.strict_safeguarding AS "strictSafeguarding",
              COALESCE(wallets.count,0)::int AS "walletCount",
              COALESCE(journals.count,0)::int AS "journalCount",
              COALESCE(journals.debit,0)::numeric AS "journalDebit",
              COALESCE(journals.credit,0)::numeric AS "journalCredit",
              latest.status AS "latestRunStatus",
              to_char(latest.business_date,'YYYY-MM-DD') AS "latestRunDate",
              latest.safeguarding_variance::numeric AS "latestVariance",
              period.status AS "periodStatus"
       FROM currencies
       LEFT JOIN LATERAL (
         SELECT row.* FROM public.sw_tbl_accounting_configuration row
         WHERE row.reporting_entity=$1 AND row.currency=currencies.currency
           AND row.is_active AND row.effective_from<=CURRENT_DATE
           AND (row.effective_to IS NULL OR row.effective_to>=CURRENT_DATE)
         ORDER BY row.effective_from DESC LIMIT 1
       ) config ON true
       LEFT JOIN public."SW_TBL_WALLET" master ON master."Wallet_MSISDN"=config.master_wallet
       LEFT JOIN LATERAL (
         SELECT count(*) FROM public."SW_TBL_WALLET" wallet
         WHERE upper(wallet.currency)=currencies.currency
       ) wallets ON true
       LEFT JOIN LATERAL (
         SELECT count(DISTINCT journal.id) AS count,
                COALESCE(sum(entry."Debit"),0) AS debit,
                COALESCE(sum(entry."Credit"),0) AS credit
         FROM public.sw_tbl_accounting_journal journal
         LEFT JOIN public.sw_tbl_accounting_entry entry ON entry.journal_id=journal.id
         WHERE journal.reporting_entity=$1 AND journal.currency=currencies.currency
           AND ($2::date IS NULL OR journal.business_date=$2::date)
       ) journals ON true
       LEFT JOIN LATERAL (
         SELECT run.status,run.business_date,run.safeguarding_variance
         FROM public.sw_tbl_eod_run run
         WHERE run.reporting_entity=$1 AND run.currency=currencies.currency
         ORDER BY run.started_at DESC LIMIT 1
       ) latest ON true
       LEFT JOIN public.sw_tbl_accounting_period period
         ON period.reporting_entity=$1 AND period.currency=currencies.currency
        AND period.business_date=$2::date
       WHERE currencies.currency ~ '^[A-Z]{3}$'
       ORDER BY currencies.currency`,
      [reportingEntity, businessDate || null],
    );
  }

  async provisionCurrency(dto: ProvisionCurrencyDto) {
    const currency = dto.currency.trim().toUpperCase();
    const baseCurrency = dto.baseCurrency.trim().toUpperCase();
    if (dto.requestedBy.trim().toLowerCase() === dto.approvedBy.trim().toLowerCase()) {
      throw new BadRequestException('Currency maker and checker must be different users');
    }
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: dto.businessTimezone }).format(new Date());
      new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(0);
    } catch {
      throw new BadRequestException('Currency or business timezone is invalid');
    }
    const specifications = [
      { walletCode: 105, purpose: 'TEMPORARY_RESERVE' },
      { walletCode: 110, purpose: 'SAFEGUARDING' },
      { walletCode: 113, purpose: 'SYSTEM' },
      { walletCode: 114, purpose: 'SYSTEM' },
      { walletCode: 115, purpose: 'SYSTEM' },
    ] as const;
    return this.dataSource.transaction(async manager => {
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
        [`ACCOUNTING_CURRENCY:${dto.reportingEntity}:${currency}`],
      );
      const existing = await manager.query(
        `SELECT id FROM public.sw_tbl_accounting_configuration
         WHERE reporting_entity=$1 AND currency=$2 AND is_active
           AND (effective_to IS NULL OR effective_to>=CURRENT_DATE)
         LIMIT 1`,
        [dto.reportingEntity, currency],
      );
      if (existing[0]) throw new ConflictException(`${currency} is already configured`);
      const administrators = await manager.query(
        `SELECT user_row.username
         FROM public.admin_users user_row
         WHERE user_row.status='active'
           AND lower(user_row.username)=ANY($1::text[])
           AND EXISTS (
             SELECT 1
             FROM public.admin_user_roles user_role
             JOIN public.admin_roles role ON role.id=user_role.role_id
             LEFT JOIN public.admin_role_permissions role_permission
               ON role_permission.role_id=role.id
             LEFT JOIN public.admin_permissions permission
               ON permission.id=role_permission.permission_id
             WHERE user_role.user_id=user_row.id
               AND (role.code='super_admin' OR permission.code='accounting.operate')
           )`,
        [[dto.requestedBy.trim().toLowerCase(), dto.approvedBy.trim().toLowerCase()]],
      );
      const authorized = new Set(
        administrators.map((row: Record<string, unknown>) => String(row.username).toLowerCase()),
      );
      if (!authorized.has(dto.requestedBy.trim().toLowerCase())) {
        throw new BadRequestException('Currency maker is not an active accounting operator');
      }
      if (!authorized.has(dto.approvedBy.trim().toLowerCase())) {
        throw new BadRequestException('Currency checker is not an active accounting operator');
      }
      const base = await manager.query(
        `SELECT 1 FROM public.sw_tbl_accounting_configuration
         WHERE reporting_entity=$1 AND currency=$2 AND is_active
           AND effective_from<=CURRENT_DATE
           AND (effective_to IS NULL OR effective_to>=CURRENT_DATE)`,
        [dto.reportingEntity, baseCurrency],
      );
      if (!base[0] && baseCurrency !== currency) {
        throw new BadRequestException(`Base currency ${baseCurrency} is not actively configured`);
      }
      const types = await manager.query(
        `SELECT "Wallet_ID" FROM public."SW_TBL_WALLET_TYPE"
         WHERE "Wallet_ID"=ANY($1::integer[])`,
        [specifications.map(item => item.walletCode)],
      );
      if (types.length !== specifications.length) {
        throw new BadRequestException('One or more required system wallet types are not configured');
      }
      const wallets: Array<Record<string, unknown>> = [];
      for (const specification of specifications) {
        const matches = await manager.query(
          `SELECT "Wallet_MSISDN"::text AS "walletId","Wallet_Code" AS "walletCode",
                  wallet_purpose AS purpose,"Amount"::numeric AS balance,currency
           FROM public."SW_TBL_WALLET"
           WHERE owner_type='SYSTEM' AND "Wallet_Code"=$1
             AND upper(currency)=$2 AND "Status"=0
           FOR UPDATE`,
          [specification.walletCode, currency],
        );
        if (matches.length > 1) {
          throw new ConflictException(
            `Multiple active wallet-code ${specification.walletCode} accounts exist for ${currency}`,
          );
        }
        if (matches[0]) {
          wallets.push(matches[0]);
          continue;
        }
        const [identifier] = await manager.query(
          `SELECT nextval('public.sw_wallet_account_number_seq')::text AS id`,
        );
        const [wallet] = await manager.query(
          `INSERT INTO public."SW_TBL_WALLET"(
             "Wallet_MSISDN","Wallet_Code","Amount","Created_By","Status",
             is_default,currency,owner_msisdn,owner_type,wallet_purpose)
           VALUES($1::bigint,$2,0,$3,0,false,$4,$1::bigint,'SYSTEM',$5)
           RETURNING "Wallet_MSISDN"::text AS "walletId","Wallet_Code" AS "walletCode",
                     wallet_purpose AS purpose,"Amount"::numeric AS balance,currency,
                     "Account_code"::text AS "accountCode"`,
          [
            identifier.id,
            specification.walletCode,
            dto.requestedBy,
            currency,
            specification.purpose,
          ],
        );
        wallets.push(wallet);
      }
      const safeguarding = wallets.find(wallet => Number(wallet.walletCode) === 110);
      if (!safeguarding) throw new BadRequestException('Safeguarding wallet provisioning failed');
      const [configuration] = await manager.query(
        `INSERT INTO public.sw_tbl_accounting_configuration(
           reporting_entity,currency,base_currency,business_timezone,cutoff_time,
           master_wallet,strict_safeguarding,effective_from,created_by,approved_by)
         VALUES($1,$2,$3,$4,$5::time,$6::bigint,true,$7::date,$8,$9)
         RETURNING id::text,reporting_entity AS "reportingEntity",currency,
                   base_currency AS "baseCurrency",business_timezone AS "businessTimezone",
                   cutoff_time::text AS "cutoffTime",master_wallet::text AS "masterWallet",
                   effective_from AS "effectiveFrom",is_active AS "isActive"`,
        [
          dto.reportingEntity,
          currency,
          baseCurrency,
          dto.businessTimezone,
          dto.cutoffTime,
          safeguarding.walletId,
          dto.effectiveFrom,
          dto.requestedBy,
          dto.approvedBy,
        ],
      );
      return { configuration, wallets };
    });
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
