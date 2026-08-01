import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  AdminWalletQueryDto,
  ChangeWalletStatusDto,
  CreateAdditionalWalletDto,
  CreateCustomerWithWalletDto,
  UpdateWalletRoutingDto,
  WalletTransactionQueryDto,
} from './dto/wallet.dto';

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
    return this.createAdditionalForActor(owner, dto, 'CUSTOMER', owner);
  }

  async createAdditionalForAdmin(
    owner: string,
    dto: CreateAdditionalWalletDto,
    actor: string,
  ) {
    this.assertOwner(owner);
    return this.createAdditionalForActor(owner, dto, 'ADMIN', actor);
  }

  async createCustomer(dto: CreateCustomerWithWalletDto, actor: string) {
    const owner = String(dto.msisdn);
    this.assertOwner(owner);
    const firstName = dto.firstName.trim();
    const lastName = String(dto.lastName || '').trim();
    const email = String(dto.email || '').trim().toLowerCase();
    const address = String(dto.address || '').trim();
    const currency = dto.defaultCurrency.trim().toUpperCase();
    const walletCode = dto.walletCode || 103;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Email address is invalid');
    }
    const routing = this.normalizeRouting(dto);
    try {
      return await this.dataSource.transaction(async manager => {
        await manager.query('SELECT pg_advisory_xact_lock($1::bigint)', [owner]);
        const [existingProfile] = await manager.query(
          `SELECT "MSISDN"::text AS "customerId","First_Name" AS "firstName",
                  "Last_Name" AS "lastName","Email" AS email,"Address" AS address,
                  "KYC_Status" AS "kycStatus","Status" AS status
           FROM public."SW_TBL_PROFILE_CUST" WHERE "MSISDN"=$1::bigint FOR UPDATE`,
          [owner],
        );
        if (existingProfile) {
          const [wallet] = await manager.query(
            `SELECT 1 FROM public."SW_TBL_WALLET"
             WHERE owner_type='CUSTOMER' AND owner_msisdn=$1::bigint AND "Status"<>6 LIMIT 1`,
            [owner],
          );
          if (wallet) throw new ConflictException('Customer profile already has an open wallet');
          if (Number(existingProfile.status) !== STATUS.ACTIVE) {
            throw new ForbiddenException('Customer profile is not active');
          }
        }
        const configured = await manager.query(
          `SELECT 1 FROM public.sw_tbl_accounting_configuration
           WHERE currency=$1 AND is_active AND effective_from<=CURRENT_DATE
             AND (effective_to IS NULL OR effective_to>=CURRENT_DATE)
           LIMIT 1`,
          [currency],
        );
        if (!configured[0]) {
          throw new BadRequestException(`${currency} is not an active operating currency`);
        }
        const [walletType] = await manager.query(
          `SELECT "Wallet_ID" AS "walletCode","Wallet_Name" AS "walletName",
                  "Is_Kyc_Needed" AS "isKycNeeded"
           FROM public."SW_TBL_WALLET_TYPE"
           WHERE "Wallet_ID"=$1 AND "Wallet_Type"=100 AND "Status"`,
          [walletCode],
        );
        if (!walletType) throw new BadRequestException('Selected customer wallet type is not active');
        const walletCollision = await manager.query(
          `SELECT 1 FROM public."SW_TBL_WALLET" WHERE "Wallet_MSISDN"=$1::bigint`,
          [owner],
        );
        if (walletCollision[0]) throw new ConflictException('Customer wallet identifier is already in use');
        if (!existingProfile) {
          await manager.query(
            `INSERT INTO public."SW_TBL_PROFILE_CUST"(
               "MSISDN","First_Name","Last_Name","Email","Address","KYC_Status",
               "Status","Created_By","Approved_By","Approved_Date")
             VALUES($1::bigint,$2,$3,$4,$5,0,0,$6,$6,CURRENT_TIMESTAMP)`,
            [owner, firstName, lastName || null, email || null, address || null, actor],
          );
          await this.customerAudit(
            manager, owner, 'CUSTOMER_CREATE', null,
            { firstName, lastName: lastName || null, email: email || null, address: address || null },
            'Customer profile created for account opening', actor,
          );
        }
        const profile = existingProfile || {
          customerId: owner,
          firstName,
          lastName: lastName || null,
          email: email || null,
          address: address || null,
          status: STATUS.ACTIVE,
          kycStatus: 0,
        };
        const kycRequired = this.requiresKyc(walletType.isKycNeeded);
        const approvedKyc = kycRequired ? await this.approvedKycCase(manager, owner) : null;
        if (kycRequired && !approvedKyc) {
          const [opening] = await manager.query(
            `INSERT INTO public.customer_account_opening_requests(
               customer_msisdn,wallet_code,currency,iban,swift_bic,kyc_required,status,requested_by)
             VALUES($1::bigint,$2,$3,$4,$5,true,'PENDING_KYC',$6)
             ON CONFLICT(customer_msisdn) DO UPDATE SET
               wallet_code=EXCLUDED.wallet_code,currency=EXCLUDED.currency,iban=EXCLUDED.iban,
               swift_bic=EXCLUDED.swift_bic,kyc_required=true,status='PENDING_KYC',
               requested_by=EXCLUDED.requested_by,updated_at=CURRENT_TIMESTAMP
             WHERE customer_account_opening_requests.status<>'OPENED'
             RETURNING id,status,wallet_code AS "walletCode",currency,kyc_required AS "kycRequired"`,
            [owner, walletCode, currency, routing.iban, routing.swiftBic, actor],
          );
          if (!opening) throw new ConflictException('Customer account opening is already complete');
          await this.customerAudit(
            manager, owner, 'ACCOUNT_OPENING_REQUEST', null, opening,
            `KYC approval required before opening ${walletType.walletName || walletCode}`, actor,
          );
          return {
            profile,
            wallet: null,
            accountOpening: {
              ...opening,
              walletName: walletType.walletName,
              message: 'Customer profile created. Complete and approve KYC, then complete account opening.',
            },
          };
        }
        const wallet = await this.insertDefaultWallet(
          manager, owner, walletCode, actor, currency, routing.iban, routing.swiftBic,
        );
        const [opening] = await manager.query(
          `INSERT INTO public.customer_account_opening_requests(
             customer_msisdn,wallet_code,currency,iban,swift_bic,kyc_required,kyc_case_id,
             status,wallet_msisdn,requested_by,completed_by,completed_at)
           VALUES($1::bigint,$2,$3,$4,$5,$6,$7::uuid,'OPENED',$8::bigint,$9,$9,CURRENT_TIMESTAMP)
           ON CONFLICT(customer_msisdn) DO UPDATE SET
             wallet_code=EXCLUDED.wallet_code,currency=EXCLUDED.currency,iban=EXCLUDED.iban,
             swift_bic=EXCLUDED.swift_bic,kyc_required=EXCLUDED.kyc_required,
             kyc_case_id=EXCLUDED.kyc_case_id,status='OPENED',wallet_msisdn=EXCLUDED.wallet_msisdn,
             completed_by=EXCLUDED.completed_by,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
           RETURNING id,status,kyc_required AS "kycRequired"`,
          [owner, walletCode, currency, routing.iban, routing.swiftBic, kycRequired,
            approvedKyc?.id || null, wallet.walletId, actor],
        );
        if (approvedKyc) {
          await manager.query(
            `UPDATE public."SW_TBL_PROFILE_CUST" SET "KYC_Status"=1,
                    "Modified_By"=$2,"Modified_Date"=CURRENT_TIMESTAMP WHERE "MSISDN"=$1::bigint`,
            [owner, actor],
          );
          profile.kycStatus = 1;
        }
        await this.audit(
          manager,
          wallet.walletId,
          owner,
          'CREATE',
          null,
          wallet,
          'Default-currency wallet created with customer',
          'ADMIN',
          actor,
        );
        await this.customerAudit(
          manager, owner, 'ACCOUNT_OPENING_COMPLETE', null,
          { walletId: wallet.walletId, walletCode, currency, kycCaseId: approvedKyc?.id || null },
          'Default customer wallet opened', actor,
        );
        return {
          profile,
          wallet,
          accountOpening: opening,
        };
      });
    } catch (error: any) {
      this.translateRoutingConflict(error);
      throw error;
    }
  }

  listCustomerWalletTypes() {
    return this.dataSource.query(
      `SELECT "Wallet_ID" AS "walletCode","Wallet_Name" AS "walletName",
              "Wallet_Details" AS "walletDetails",
              CASE WHEN COALESCE("Is_Kyc_Needed"::int,0)=1 THEN true ELSE false END AS "kycRequired"
       FROM public."SW_TBL_WALLET_TYPE"
       WHERE "Wallet_Type"=100 AND "Status" ORDER BY "Wallet_ID"`,
    );
  }

  async completeCustomerAccountOpening(owner: string, actor: string) {
    this.assertOwner(owner);
    try {
      return await this.dataSource.transaction(async manager => {
        await manager.query('SELECT pg_advisory_xact_lock($1::bigint)', [owner]);
        const [profile] = await manager.query(
          `SELECT "MSISDN"::text AS "customerId","First_Name" AS "firstName",
                  "Last_Name" AS "lastName","Email" AS email,"Address" AS address,
                  "KYC_Status" AS "kycStatus","Status" AS status
           FROM public."SW_TBL_PROFILE_CUST" WHERE "MSISDN"=$1::bigint FOR UPDATE`, [owner],
        );
        if (!profile) throw new NotFoundException('Customer profile was not found');
        if (Number(profile.status) !== STATUS.ACTIVE) throw new ForbiddenException('Customer profile is not active');
        const [opening] = await manager.query(
          `SELECT id,wallet_code AS "walletCode",currency,iban,swift_bic AS "swiftBic",
                  kyc_required AS "kycRequired",status,wallet_msisdn::text AS "walletId"
           FROM public.customer_account_opening_requests
           WHERE customer_msisdn=$1::bigint FOR UPDATE`, [owner],
        );
        if (!opening) throw new NotFoundException('Pending customer account opening was not found');
        if (opening.status === 'OPENED') {
          return { profile, accountOpening: opening, wallet: opening.walletId ? { walletId: opening.walletId } : null };
        }
        const [walletType] = await manager.query(
          `SELECT "Wallet_Name" AS "walletName","Is_Kyc_Needed" AS "isKycNeeded"
           FROM public."SW_TBL_WALLET_TYPE"
           WHERE "Wallet_ID"=$1 AND "Wallet_Type"=100 AND "Status"`, [opening.walletCode],
        );
        if (!walletType) throw new BadRequestException('Selected customer wallet type is not active');
        const kycRequired = this.requiresKyc(walletType.isKycNeeded) || Boolean(opening.kycRequired);
        const approvedKyc = kycRequired ? await this.approvedKycCase(manager, owner) : null;
        if (kycRequired && !approvedKyc) {
          throw new ConflictException('Approved KYC is required before this customer wallet can be opened');
        }
        const configured = await manager.query(
          `SELECT 1 FROM public.sw_tbl_accounting_configuration
           WHERE currency=$1 AND is_active AND effective_from<=CURRENT_DATE
             AND (effective_to IS NULL OR effective_to>=CURRENT_DATE) LIMIT 1`, [opening.currency],
        );
        if (!configured[0]) throw new BadRequestException(`${opening.currency} is not an active operating currency`);
        const collision = await manager.query(
          `SELECT 1 FROM public."SW_TBL_WALLET" WHERE "Wallet_MSISDN"=$1::bigint`, [owner],
        );
        if (collision[0]) throw new ConflictException('Customer wallet identifier is already in use');
        const wallet = await this.insertDefaultWallet(
          manager, owner, opening.walletCode, actor, opening.currency, opening.iban, opening.swiftBic,
        );
        await manager.query(
          `UPDATE public.customer_account_opening_requests
           SET status='OPENED',kyc_case_id=$2::uuid,wallet_msisdn=$3::bigint,
               completed_by=$4,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
           WHERE id=$1::uuid`, [opening.id, approvedKyc?.id || null, wallet.walletId, actor],
        );
        if (approvedKyc) {
          await manager.query(
            `UPDATE public."SW_TBL_PROFILE_CUST" SET "KYC_Status"=1,
                    "Modified_By"=$2,"Modified_Date"=CURRENT_TIMESTAMP WHERE "MSISDN"=$1::bigint`,
            [owner, actor],
          );
          profile.kycStatus = 1;
        }
        await this.audit(manager, wallet.walletId, owner, 'CREATE', null, wallet,
          'Default-currency wallet created after KYC approval', 'ADMIN', actor);
        await this.customerAudit(manager, owner, 'ACCOUNT_OPENING_COMPLETE', opening,
          { status: 'OPENED', walletId: wallet.walletId, kycCaseId: approvedKyc?.id || null },
          'Default customer wallet opened after eligibility checks', actor);
        return { profile, wallet, accountOpening: { ...opening, status: 'OPENED', walletId: wallet.walletId } };
      });
    } catch (error: any) {
      this.translateRoutingConflict(error);
      throw error;
    }
  }

  async setDefault(owner: string, walletId: string) {
    this.assertOwner(owner);
    return this.setDefaultForActor(owner, walletId, 'CUSTOMER', owner);
  }

  async setDefaultForAdmin(walletId: string, actor: string) {
    const [wallet] = await this.dataSource.query(
      `SELECT owner_msisdn::text AS "ownerMsisdn"
       FROM public."SW_TBL_WALLET"
       WHERE owner_type='CUSTOMER' AND "Wallet_MSISDN"=$1::bigint`,
      [walletId],
    );
    if (!wallet) throw new NotFoundException('Customer wallet was not found');
    return this.setDefaultForActor(wallet.ownerMsisdn, walletId, 'ADMIN', actor);
  }

  private setDefaultForActor(
    owner: string,
    walletId: string,
    actorType: 'CUSTOMER' | 'ADMIN',
    actorId: string,
  ) {
    return this.dataSource.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock($1::bigint)', [owner]);
      const rows = await manager.query(
        `SELECT "Wallet_MSISDN"::text AS "walletId",currency,
                is_default AS "isDefault","Status" AS status,
                wallet_purpose AS purpose
         FROM public."SW_TBL_WALLET"
         WHERE owner_type='CUSTOMER' AND owner_msisdn=$1::bigint AND "Wallet_MSISDN"=$2::bigint
         FOR UPDATE`, [owner, walletId],
      );
      const wallet = rows[0];
      if (!wallet) throw new NotFoundException('Wallet was not found');
      if (Number(wallet.status) !== STATUS.ACTIVE) throw new ConflictException('Only an active wallet can be default');
      await manager.query(
        `UPDATE public."SW_TBL_WALLET"
         SET is_default=false,
             wallet_purpose=CASE WHEN wallet_purpose='CUSTOMER_MAIN'
               THEN 'CUSTOMER_ADDITIONAL' ELSE wallet_purpose END,
             "Modified_Date"=CURRENT_TIMESTAMP,"Modified_By"=$2
         WHERE owner_type='CUSTOMER' AND owner_msisdn=$1::bigint
           AND (is_default OR wallet_purpose='CUSTOMER_MAIN')`,
        [owner, actorId],
      );
      await manager.query(
        `UPDATE public."SW_TBL_WALLET"
         SET is_default=true,wallet_purpose='CUSTOMER_MAIN',
             "Modified_Date"=CURRENT_TIMESTAMP,"Modified_By"=$3
         WHERE owner_type='CUSTOMER' AND owner_msisdn=$1::bigint
           AND "Wallet_MSISDN"=$2::bigint`,
        [owner, walletId, actorId],
      );
      const next = { ...wallet, isDefault: true, purpose: 'CUSTOMER_MAIN' };
      await this.audit(
        manager,
        walletId,
        owner,
        'SET_DEFAULT',
        wallet,
        next,
        `Default customer currency changed to ${wallet.currency}`,
        actorType,
        actorId,
      );
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

  updateRoutingForCustomer(
    owner: string,
    walletId: string,
    dto: UpdateWalletRoutingDto,
  ) {
    this.assertOwner(owner);
    return this.updateRouting(owner, walletId, dto, 'CUSTOMER', owner);
  }

  async updateRoutingForAdmin(
    walletId: string,
    dto: UpdateWalletRoutingDto,
    actor: string,
  ) {
    const [wallet] = await this.dataSource.query(
      `SELECT owner_msisdn::text AS "ownerMsisdn"
       FROM public."SW_TBL_WALLET"
       WHERE owner_type='CUSTOMER' AND "Wallet_MSISDN"=$1::bigint`,
      [walletId],
    );
    if (!wallet) throw new NotFoundException('Customer wallet was not found');
    return this.updateRouting(wallet.ownerMsisdn, walletId, dto, 'ADMIN', actor);
  }

  private async createAdditionalForActor(
    owner: string,
    dto: CreateAdditionalWalletDto,
    actorType: 'CUSTOMER' | 'ADMIN',
    actorId: string,
  ) {
    const currency = dto.currency.trim().toUpperCase();
    const routing = this.normalizeRouting(dto);
    try {
      return await this.dataSource.transaction(async manager => {
        // Serialize wallet creation per owner so concurrent requests cannot
        // create duplicate currency/type wallets.
        await manager.query('SELECT pg_advisory_xact_lock($1::bigint)', [owner]);
        const profiles = await manager.query(
          `SELECT "MSISDN"::text,"Status" AS status
           FROM public."SW_TBL_PROFILE_CUST"
           WHERE "MSISDN"=$1::bigint FOR SHARE`,
          [owner],
        );
        if (!profiles[0]) throw new ForbiddenException('Customer profile was not found');
        if (Number(profiles[0].status) !== 0) {
          throw new ForbiddenException('Customer profile is not active');
        }
        const configured = await manager.query(
          `SELECT 1 FROM public.sw_tbl_accounting_configuration
           WHERE currency=$1 AND is_active AND effective_from<=CURRENT_DATE
             AND (effective_to IS NULL OR effective_to>=CURRENT_DATE)
           LIMIT 1`,
          [currency],
        );
        if (!configured[0]) {
          throw new BadRequestException(`${currency} is not an active operating currency`);
        }
        const types = await manager.query(
          `SELECT "Wallet_ID","Wallet_Name","Wallet_Type","Is_Kyc_Needed" AS "isKycNeeded"
           FROM public."SW_TBL_WALLET_TYPE"
           WHERE "Wallet_ID"=$1 AND "Wallet_Type"=100 AND "Status"`,
          [dto.walletCode],
        );
        if (!types[0]) {
          throw new BadRequestException('An eligible customer wallet type is required');
        }
        if (this.requiresKyc(types[0].isKycNeeded) && !(await this.approvedKycCase(manager, owner))) {
          throw new ForbiddenException(
            `Approved KYC is required before wallet type ${types[0].Wallet_Name || dto.walletCode} can be opened`,
          );
        }
        const duplicate = await manager.query(
          `SELECT 1 FROM public."SW_TBL_WALLET"
           WHERE owner_type='CUSTOMER' AND owner_msisdn=$1::bigint
             AND "Wallet_Code"=$2 AND upper(currency)=$3 AND "Status"<>6`,
          [owner, dto.walletCode, currency],
        );
        if (duplicate[0]) {
          throw new ConflictException('This customer already has that wallet type and currency');
        }
        const [globalMain] = await manager.query(
          `SELECT "Wallet_MSISDN"::text AS "walletId"
           FROM public."SW_TBL_WALLET"
           WHERE owner_type='CUSTOMER' AND owner_msisdn=$1::bigint
             AND wallet_purpose='CUSTOMER_MAIN' AND "Status"<>6
           LIMIT 1`,
          [owner],
        );
        if (!globalMain) throw new ConflictException('The customer default wallet is missing');
        const [currencyMain] = await manager.query(
          `SELECT wallet."Wallet_MSISDN"::text AS "walletId"
           FROM public."SW_TBL_WALLET" wallet
           JOIN public."SW_TBL_WALLET_TYPE" type
             ON type."Wallet_ID"=wallet."Wallet_Code" AND type."Wallet_Type"=100
           WHERE wallet.owner_type='CUSTOMER'
             AND wallet.owner_msisdn=$1::bigint
             AND upper(wallet.currency)=$2 AND wallet."Status"<>6
           ORDER BY wallet."Created_Date" LIMIT 1`,
          [owner, currency],
        );
        if (dto.walletCode !== 103 && !currencyMain) {
          throw new ConflictException(
            `Create the customer's ${currency} currency wallet before adding another wallet type`,
          );
        }
        const [wallet] = await manager.query(
          `INSERT INTO public."SW_TBL_WALLET"(
             "Wallet_MSISDN","Wallet_Code","Amount","Created_By","Status","Parent",
             "Mobile_Number",commission_balance,is_default,currency,
             owner_msisdn,owner_type,wallet_purpose,iban,swift_bic)
           VALUES(nextval('public.sw_wallet_account_number_seq'),$1,0,$2,0,$3::bigint,
                  $4::bigint,0,false,$5,$4::bigint,'CUSTOMER',
                  'CUSTOMER_ADDITIONAL',$6,$7)
           RETURNING "Wallet_MSISDN"::text AS "walletId",
                     "Account_code"::text AS "accountCode",
                     "Wallet_Code" AS "walletCode","Amount"::numeric AS balance,
                     currency,"Status" AS status,is_default AS "isDefault",
                     wallet_purpose AS purpose,iban,swift_bic AS "swiftBic"`,
          [
            dto.walletCode,
            actorId,
            currencyMain?.walletId ?? globalMain.walletId,
            owner,
            currency,
            routing.iban,
            routing.swiftBic,
          ],
        );
        await this.audit(
          manager,
          wallet.walletId,
          owner,
          'CREATE',
          null,
          wallet,
          `Additional ${currency} customer wallet created`,
          actorType,
          actorId,
        );
        return wallet;
      });
    } catch (error: any) {
      this.translateRoutingConflict(error);
      throw error;
    }
  }

  private async updateRouting(
    owner: string,
    walletId: string,
    dto: UpdateWalletRoutingDto,
    actorType: 'CUSTOMER' | 'ADMIN',
    actorId: string,
  ) {
    const routing = this.normalizeRouting(dto);
    try {
      return await this.dataSource.transaction(async manager => {
        const [wallet] = await manager.query(
          `SELECT "Wallet_MSISDN"::text AS "walletId",
                  owner_msisdn::text AS "ownerMsisdn",currency,iban,
                  swift_bic AS "swiftBic","Status" AS status
           FROM public."SW_TBL_WALLET"
           WHERE owner_type='CUSTOMER' AND owner_msisdn=$1::bigint
             AND "Wallet_MSISDN"=$2::bigint
           FOR UPDATE`,
          [owner, walletId],
        );
        if (!wallet) throw new NotFoundException('Customer wallet was not found');
        if (Number(wallet.status) === STATUS.CLOSED) {
          throw new ConflictException('Routing cannot be changed on a closed wallet');
        }
        const updateResult = await manager.query(
          `UPDATE public."SW_TBL_WALLET"
           SET iban=$3,swift_bic=$4,
               "Modified_By"=$5,"Modified_Date"=CURRENT_TIMESTAMP
           WHERE owner_type='CUSTOMER' AND owner_msisdn=$1::bigint
             AND "Wallet_MSISDN"=$2::bigint
           RETURNING "Wallet_MSISDN"::text AS "walletId",
                     owner_msisdn::text AS "ownerMsisdn",currency,iban,
                     swift_bic AS "swiftBic"`,
          [owner, walletId, routing.iban, routing.swiftBic, actorId],
        );
        const updated = this.firstReturnedRow(updateResult);
        if (!updated) throw new Error('Wallet routing update did not return the updated wallet');
        await this.audit(
          manager,
          walletId,
          owner,
          'ROUTING_UPDATE',
          wallet,
          updated,
          'Customer wallet bank-routing details updated',
          actorType,
          actorId,
        );
        return updated;
      });
    } catch (error: any) {
      this.translateRoutingConflict(error);
      throw error;
    }
  }

  private wallets(where: string, args: unknown[]) {
    return this.dataSource.query(
      `SELECT wallet."Wallet_MSISDN"::text AS "walletId",wallet."Account_code"::text AS "accountCode",
              wallet.owner_msisdn::text AS "ownerMsisdn",wallet.owner_type AS "ownerType",
              wallet.wallet_purpose AS purpose,wallet."Wallet_Code" AS "walletCode",
              type."Wallet_Name" AS "walletName",wallet."Amount"::numeric AS balance,
              wallet.commission_balance::numeric AS "commissionBalance",wallet.currency,
              wallet."Status" AS status,wallet.is_default AS "isDefault",
              wallet.iban,wallet.swift_bic AS "swiftBic",
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

  private customerAudit(
    manager: any,
    owner: string,
    operation: string,
    previous: unknown,
    next: unknown,
    reason: string,
    actor: string,
  ) {
    return manager.query(
      `INSERT INTO public.customer_profile_operation_audit(
         customer_msisdn,operation,previous_state,new_state,reason,actor_id)
       VALUES($1::bigint,$2,$3::jsonb,$4::jsonb,$5,$6)`,
      [owner, operation, previous ? JSON.stringify(previous) : null,
        next ? JSON.stringify(next) : null, reason, actor],
    );
  }

  private async approvedKycCase(manager: any, owner: string) {
    const [kycCase] = await manager.query(
      `SELECT id,reviewed_at AS "reviewedAt"
       FROM kyc.cases
       WHERE customer_msisdn=$1::bigint AND status='APPROVED'
       ORDER BY reviewed_at DESC NULLS LAST,updated_at DESC LIMIT 1`,
      [owner],
    );
    return kycCase || null;
  }

  private requiresKyc(value: unknown) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  private async insertDefaultWallet(
    manager: any,
    owner: string,
    walletCode: number,
    actor: string,
    currency: string,
    iban: string | null,
    swiftBic: string | null,
  ) {
    const [wallet] = await manager.query(
      `INSERT INTO public."SW_TBL_WALLET"(
         "Wallet_MSISDN","Wallet_Code","Amount","Created_By","Status",
         "Mobile_Number",commission_balance,is_default,currency,
         owner_msisdn,owner_type,wallet_purpose,iban,swift_bic)
       VALUES($1::bigint,$2,0,$3,0,$1::bigint,0,true,$4,
              $1::bigint,'CUSTOMER','CUSTOMER_MAIN',$5,$6)
       RETURNING "Wallet_MSISDN"::text AS "walletId",
                 "Account_code"::text AS "accountCode",
                 "Wallet_Code" AS "walletCode","Amount"::numeric AS balance,
                 currency,"Status" AS status,is_default AS "isDefault",
                 wallet_purpose AS purpose,iban,swift_bic AS "swiftBic"`,
      [owner, walletCode, actor, currency, iban, swiftBic],
    );
    return wallet;
  }

  private assertOwner(owner: string) {
    if (!/^\d+$/.test(String(owner))) throw new ForbiddenException('Customer identity is invalid');
  }

  private normalizeRouting(input: { iban?: string; swiftBic?: string }) {
    const iban = String(input.iban || '').replace(/\s+/g, '').toUpperCase();
    const swiftBic = String(input.swiftBic || '').replace(/\s+/g, '').toUpperCase();
    if (iban) {
      if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) || !this.validIbanChecksum(iban)) {
        throw new BadRequestException('IBAN is invalid');
      }
    }
    if (swiftBic && !/^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(swiftBic)) {
      throw new BadRequestException('SWIFT/BIC must contain 8 or 11 valid characters');
    }
    return { iban: iban || null, swiftBic: swiftBic || null };
  }

  private validIbanChecksum(iban: string) {
    const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
    let remainder = 0;
    for (const character of rearranged) {
      const numeric = /\d/.test(character)
        ? character
        : String(character.charCodeAt(0) - 55);
      for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
    }
    return remainder === 1;
  }

  private translateRoutingConflict(error: any) {
    if (error?.code === '23505' && String(error?.constraint || '').includes('UQ_WALLET_IBAN')) {
      throw new ConflictException('This IBAN is already assigned to another wallet');
    }
  }

  private firstReturnedRow(result: any) {
    if (!Array.isArray(result)) return undefined;
    return Array.isArray(result[0]) ? result[0][0] : result[0];
  }
}
