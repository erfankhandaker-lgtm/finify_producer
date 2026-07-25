import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AdminWalletQueryDto, ChangeWalletStatusDto, CreateAdditionalWalletDto, WalletTransactionQueryDto } from './dto/wallet.dto';

const STATUS = { ACTIVE: 0, SUSPENDED: 1, FROZEN: 2, CLOSED: 6 } as const;

@Injectable()
export class WalletService {
  constructor(private readonly dataSource: DataSource) {}

  listMine(owner: string) {
    this.assertOwner(owner);
    return this.wallets(`wallet.owner_type='CUSTOMER' AND wallet.owner_msisdn=$1::bigint`, [owner]);
  }

  async getMine(owner: string, walletId: string) {
    this.assertOwner(owner);
    const rows = await this.wallets(
      `wallet.owner_type='CUSTOMER' AND wallet.owner_msisdn=$1::bigint AND wallet."Wallet_MSISDN"=$2::bigint`,
      [owner, walletId],
    );
    if (!rows[0]) throw new NotFoundException('Wallet was not found');
    return rows[0];
  }

  async createAdditional(owner: string, dto: CreateAdditionalWalletDto) {
    this.assertOwner(owner);
    return this.dataSource.transaction(async manager => {
      const currency = dto.currency.trim().toUpperCase();
      await manager.query('SELECT pg_advisory_xact_lock($1::bigint)', [owner]);
      const profiles = await manager.query(
        `SELECT "MSISDN"::text,"Status" AS status FROM public."SW_TBL_PROFILE_CUST"
         WHERE "MSISDN"=$1::bigint FOR SHARE`, [owner],
      );
      if (!profiles[0]) throw new ForbiddenException('Customer profile was not found');
      if (Number(profiles[0].status) !== 0) throw new ForbiddenException('Customer profile is not active');
      const types = await manager.query(
        `SELECT "Wallet_ID","Wallet_Name","Wallet_Type" FROM public."SW_TBL_WALLET_TYPE"
         WHERE "Wallet_ID"=$1 AND "Wallet_Type"=100`, [dto.walletCode],
      );
      if (!types[0]) throw new BadRequestException('An eligible customer wallet type is required');
      const duplicate = await manager.query(
        `SELECT 1 FROM public."SW_TBL_WALLET"
         WHERE owner_type='CUSTOMER' AND owner_msisdn=$1::bigint
           AND "Wallet_Code"=$2 AND upper(currency)=$3 AND "Status"<>6`,
        [owner, dto.walletCode, currency],
      );
      if (duplicate[0]) throw new ConflictException('This customer already has that wallet type and currency');
      const main = await manager.query(
        `SELECT "Wallet_MSISDN"::text FROM public."SW_TBL_WALLET"
         WHERE owner_type='CUSTOMER' AND owner_msisdn=$1::bigint
           AND wallet_purpose='CUSTOMER_MAIN' AND upper(currency)=$2
         ORDER BY is_default DESC,"Created_Date" LIMIT 1`, [owner, currency],
      );
      if (!main[0]) throw new ConflictException('The customer main wallet must exist for this currency');
      const rows = await manager.query(
        `INSERT INTO public."SW_TBL_WALLET"(
           "Wallet_MSISDN","Wallet_Code","Amount","Created_By","Status","Parent",
           "Mobile_Number",commission_balance,is_default,currency,
           owner_msisdn,owner_type,wallet_purpose)
         VALUES(nextval('public.sw_wallet_account_number_seq'),$1,0,$2,0,$3::bigint,
                $2::bigint,0,false,$4,$2::bigint,'CUSTOMER','CUSTOMER_ADDITIONAL')
         RETURNING "Wallet_MSISDN"::text AS "walletId","Account_code"::text AS "accountCode",
                   "Wallet_Code" AS "walletCode","Amount"::numeric AS balance,currency,
                   "Status" AS status,is_default AS "isDefault",wallet_purpose AS purpose`,
        [dto.walletCode, owner, main[0].Wallet_MSISDN, currency],
      );
      await this.audit(manager, rows[0].walletId, owner, 'CREATE', null, rows[0], null, 'CUSTOMER', owner);
      return rows[0];
    });
  }

  async setDefault(owner: string, walletId: string) {
    this.assertOwner(owner);
    return this.dataSource.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock($1::bigint)', [owner]);
      const rows = await manager.query(
        `SELECT "Wallet_MSISDN"::text AS "walletId",currency,is_default AS "isDefault","Status" AS status
         FROM public."SW_TBL_WALLET"
         WHERE owner_type='CUSTOMER' AND owner_msisdn=$1::bigint AND "Wallet_MSISDN"=$2::bigint
         FOR UPDATE`, [owner, walletId],
      );
      const wallet = rows[0];
      if (!wallet) throw new NotFoundException('Wallet was not found');
      if (Number(wallet.status) !== STATUS.ACTIVE) throw new ConflictException('Only an active wallet can be default');
      await manager.query(
        `UPDATE public."SW_TBL_WALLET" SET is_default=false,"Modified_Date"=CURRENT_TIMESTAMP,
           "Modified_By"=$1 WHERE owner_type='CUSTOMER' AND owner_msisdn=$1::bigint
           AND upper(currency)=upper($2) AND is_default`, [owner, wallet.currency],
      );
      await manager.query(
        `UPDATE public."SW_TBL_WALLET" SET is_default=true,"Modified_Date"=CURRENT_TIMESTAMP,
           "Modified_By"=$1 WHERE "Wallet_MSISDN"=$2::bigint`, [owner, walletId],
      );
      const next = { ...wallet, isDefault: true };
      await this.audit(manager, walletId, owner, 'SET_DEFAULT', wallet, next, null, 'CUSTOMER', owner);
      return next;
    });
  }

  async transactions(owner: string, walletId: string, query: WalletTransactionQueryDto) {
    await this.getMine(owner, walletId);
    const offset = (query.page - 1) * query.limit;
    const args: unknown[] = [walletId, query.limit, offset, query.dateFrom ?? null, query.dateTo ?? null];
    const [rows, counts] = await Promise.all([
      this.dataSource.query(
        `SELECT id::text,journal_id::text AS "journalId",transactionid::text AS "transactionId",
                "Debit"::numeric AS debit,"Credit"::numeric AS credit,
                balance_before::numeric AS "balanceBefore",balance_after::numeric AS "balanceAfter",
                currency,business_date AS "businessDate",entrydate AS "createdAt"
         FROM public.sw_tbl_accounting_entry WHERE accountnumber=$1::bigint
           AND ($4::date IS NULL OR business_date>=$4::date)
           AND ($5::date IS NULL OR business_date<=$5::date)
         ORDER BY entrydate DESC,id DESC LIMIT $2 OFFSET $3`, args),
      this.dataSource.query(
        `SELECT count(*)::int AS count FROM public.sw_tbl_accounting_entry
         WHERE accountnumber=$1::bigint AND ($4::date IS NULL OR business_date>=$4::date)
           AND ($5::date IS NULL OR business_date<=$5::date)`, args),
    ]);
    return { data: rows, totalRecords: counts[0].count, page: query.page, limit: query.limit };
  }

  async adminList(query: AdminWalletQueryDto) {
    const conditions = ['1=1']; const args: unknown[] = [];
    const add = (sql: string, value: unknown) => { args.push(value); conditions.push(sql.replace('?', `$${args.length}`)); };
    if (query.ownerMsisdn) add('wallet.owner_msisdn=?::bigint', query.ownerMsisdn);
    if (query.ownerType) add('wallet.owner_type=?', query.ownerType);
    if (query.currency) add('upper(wallet.currency)=?', query.currency.trim().toUpperCase());
    if (query.status !== undefined) add('wallet."Status"=?', query.status);
    const filterArgs = [...args];
    const counts = await this.dataSource.query(
      `SELECT count(*)::int AS count FROM public."SW_TBL_WALLET" wallet
       WHERE ${conditions.join(' AND ')}`, filterArgs,
    );
    const offset = (query.page - 1) * query.limit;
    args.push(query.limit, offset);
    const rows = await this.wallets(`${conditions.join(' AND ')} ORDER BY wallet."Created_Date" DESC LIMIT $${args.length-1} OFFSET $${args.length}`, args);
    return { data: rows, totalRecords: counts[0].count, page: query.page, limit: query.limit };
  }

  async changeStatus(walletId: string, dto: ChangeWalletStatusDto, actor: string) {
    return this.dataSource.transaction(async manager => {
      const rows = await manager.query(
        `SELECT "Wallet_MSISDN"::text AS "walletId",owner_msisdn::text AS "ownerMsisdn",
                "Status" AS status,is_default AS "isDefault",currency,wallet_purpose AS purpose
         FROM public."SW_TBL_WALLET" WHERE "Wallet_MSISDN"=$1::bigint FOR UPDATE`, [walletId],
      );
      const wallet = rows[0];
      if (!wallet) throw new NotFoundException('Wallet was not found');
      const nextStatus = STATUS[dto.status];
      if (wallet.purpose === 'CUSTOMER_MAIN' && dto.status === 'CLOSED') {
        throw new ConflictException('A customer main wallet cannot be closed');
      }
      if (wallet.isDefault && nextStatus !== STATUS.ACTIVE) {
        throw new ConflictException('Select another default wallet before restricting this wallet');
      }
      if (Number(wallet.status) === nextStatus) return wallet;
      await manager.query(
        `UPDATE public."SW_TBL_WALLET" SET "Status"=$2,"Modified_Date"=CURRENT_TIMESTAMP,
                "Modified_By"=$3 WHERE "Wallet_MSISDN"=$1::bigint`,
        [walletId, nextStatus, actor],
      );
      const next = { ...wallet, status: nextStatus };
      await this.audit(manager, walletId, wallet.ownerMsisdn, 'STATUS_CHANGE', wallet, next,
        dto.reason, 'ADMIN', actor);
      return next;
    });
  }

  history(walletId: string) {
    return this.dataSource.query(
      `SELECT id::text,operation,previous_state AS "previousState",new_state AS "newState",
              reason,actor_type AS "actorType",actor_id AS "actorId",
              correlation_id AS "correlationId",created_at AS "createdAt"
       FROM public.sw_tbl_wallet_operation_audit WHERE wallet_msisdn=$1::bigint
       ORDER BY created_at DESC,id DESC`, [walletId],
    );
  }

  private wallets(where: string, args: unknown[]) {
    return this.dataSource.query(
      `SELECT wallet."Wallet_MSISDN"::text AS "walletId",wallet."Account_code"::text AS "accountCode",
              wallet.owner_msisdn::text AS "ownerMsisdn",wallet.owner_type AS "ownerType",
              wallet.wallet_purpose AS purpose,wallet."Wallet_Code" AS "walletCode",
              type."Wallet_Name" AS "walletName",wallet."Amount"::numeric AS balance,
              wallet.commission_balance::numeric AS "commissionBalance",wallet.currency,
              wallet."Status" AS status,wallet.is_default AS "isDefault",
              wallet."Created_Date" AS "createdAt",wallet."Modified_Date" AS "modifiedAt"
       FROM public."SW_TBL_WALLET" wallet
       LEFT JOIN public."SW_TBL_WALLET_TYPE" type ON type."Wallet_ID"=wallet."Wallet_Code"
       WHERE ${where}`, args,
    );
  }

  private audit(manager: any, walletId: string, owner: string, operation: string,
    previous: unknown, next: unknown, reason: string | null, actorType: string, actorId: string) {
    return manager.query(
      `INSERT INTO public.sw_tbl_wallet_operation_audit(
         wallet_msisdn,owner_msisdn,operation,previous_state,new_state,reason,actor_type,actor_id)
       VALUES($1::bigint,$2::bigint,$3,$4::jsonb,$5::jsonb,$6,$7,$8)`,
      [walletId, owner, operation, previous ? JSON.stringify(previous) : null,
        JSON.stringify(next), reason, actorType, actorId],
    );
  }

  private assertOwner(owner: string) {
    if (!/^\d+$/.test(String(owner))) throw new ForbiddenException('Customer identity is invalid');
  }
}
