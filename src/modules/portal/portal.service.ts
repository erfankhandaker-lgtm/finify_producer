import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PasswordService } from '../transaction/password.service';
import { TransactionService } from '../transaction/transaction.service';
import { ChangePortalPinDto, PortalActivityQueryDto, PortalPaymentDto } from './dto/portal.dto';

type Principal = {
  accountType: 'CUSTOMER' | 'BUSINESS';
  ownerType: 'CUSTOMER' | 'MERCHANT';
  ownerMsisdn: string;
  displayName: string;
  email: string | null;
  status: number;
  kycStatus: number | null;
  businessType: string | null;
};

@Injectable()
export class PortalService {
  constructor(
    private readonly db: DataSource,
    private readonly transactions: TransactionService,
    private readonly passwords: PasswordService,
  ) {}

  async dashboard(identity: string) {
    const principal = await this.principal(identity);
    const wallets = await this.walletsFor(principal);
    const walletIds = wallets.map((wallet: any) => wallet.walletId);
    const [activity, kyc, services] = await Promise.all([
      this.activityFor(walletIds, 8, 0),
      principal.accountType === 'CUSTOMER'
        ? this.db.query(
          `SELECT id,status,system_recommendation AS "systemRecommendation",
                  created_at AS "createdAt",reviewed_at AS "reviewedAt"
           FROM kyc.cases WHERE customer_msisdn=$1::bigint
           ORDER BY created_at DESC LIMIT 1`, [identity],
        ).then((rows) => rows[0] || null)
        : Promise.resolve(null),
      this.services(),
    ]);
    const balances = wallets.reduce((groups: Record<string, number>, wallet: any) => {
      groups[wallet.currency] = (groups[wallet.currency] || 0) + Number(wallet.balance || 0);
      return groups;
    }, {});
    return { principal, wallets, balances, recentActivity: activity, kyc, services };
  }

  async activity(identity: string, query: PortalActivityQueryDto) {
    const principal = await this.principal(identity);
    const wallets = await this.walletsFor(principal);
    const owned = new Set<string>(wallets.map((wallet: any) => String(wallet.walletId)));
    if (query.walletId && !owned.has(query.walletId)) throw new ForbiddenException('Wallet is not owned by this account');
    const walletIds = query.walletId ? [query.walletId] : [...owned];
    const offset = (query.page - 1) * query.limit;
    const [data, count] = await Promise.all([
      this.activityFor(walletIds, query.limit, offset),
      walletIds.length ? this.db.query(
        `SELECT count(*)::int AS count FROM public.sw_tbl_accounting_entry
         WHERE accountnumber=ANY($1::bigint[])`, [walletIds],
      ) : Promise.resolve([{ count: 0 }]),
    ]);
    return { data, totalRecords: Number(count[0]?.count || 0), page: query.page, limit: query.limit };
  }

  async recipient(identity: string, walletId: string) {
    await this.principal(identity);
    if (!/^\d+$/.test(walletId)) throw new BadRequestException('Wallet identifier is invalid');
    const [row] = await this.db.query(
      `SELECT wallet."Wallet_MSISDN"::text AS "walletId",wallet.currency,
              wallet.owner_type AS "ownerType",type."Wallet_Name" AS "walletName",
              CASE wallet.owner_type
                WHEN 'MERCHANT' THEN merchant."Merchant_Name"
                WHEN 'CUSTOMER' THEN concat_ws(' ',customer."First_Name",customer."Last_Name")
                ELSE 'Finify account'
              END AS "displayName"
       FROM public."SW_TBL_WALLET" wallet
       LEFT JOIN public."SW_TBL_WALLET_TYPE" type ON type."Wallet_ID"=wallet."Wallet_Code"
       LEFT JOIN public."SW_TBL_PROFILE_CUST" customer ON customer."MSISDN"=wallet.owner_msisdn
       LEFT JOIN public."SW_TBL_PROFILE_MERCHANT" merchant ON merchant."MSISDN"=wallet.owner_msisdn
       WHERE wallet."Wallet_MSISDN"=$1::bigint AND wallet."Status"=0`, [walletId],
    );
    if (!row) throw new NotFoundException('Recipient wallet was not found');
    return row;
  }

  async payment(identity: string, input: PortalPaymentDto) {
    const principal = await this.principal(identity);
    const [source] = await this.db.query(
      `SELECT "Wallet_MSISDN"::text AS "walletId",currency,"Status" AS status
       FROM public."SW_TBL_WALLET"
       WHERE "Wallet_MSISDN"=$1::bigint AND owner_msisdn=$2::bigint AND owner_type=$3`,
      [input.sourceWalletId, principal.ownerMsisdn, principal.ownerType],
    );
    if (!source) throw new ForbiddenException('Source wallet is not owned by this account');
    if (Number(source.status) !== 0) throw new ForbiddenException('Source wallet is not active');
    if (String(source.currency).toUpperCase() !== input.currency) {
      throw new BadRequestException('Payment currency must match the source wallet');
    }
    return this.transactions.transactionprocess({
      amount: input.amount,
      pin: input.pin,
      keyword: input.keyword,
      sourceAccount: input.sourceWalletId,
      destinationAccount: input.destinationWalletId,
      mobileNumber: principal.ownerMsisdn,
      referenceId: input.referenceId,
      currency: input.currency,
      transactionId: undefined as any,
    });
  }

  async changePin(identity: string, input: ChangePortalPinDto) {
    await this.principal(identity);
    const current = await this.passwords.PINVerify(input.currentPin, identity);
    if (!current.Passwordmatch) throw new UnauthorizedException('Current PIN is incorrect');
    await this.passwords.encryptPassword(input.newPin, identity);
    return { changed: true };
  }

  services() {
    return this.db.query(
      `SELECT "Keyword" AS keyword,"Keyword_Description" AS description,
              "Keyword_Scope" AS scope
       FROM public."SW_TBL_KEYWORD"
       WHERE "Is_Active" AND "Service_Status" AND "Is_Financial"
       ORDER BY priority NULLS LAST,"Keyword"`,
    );
  }

  private async principal(identity: string): Promise<Principal> {
    if (!/^\d{7,15}$/.test(identity)) throw new UnauthorizedException('Portal identity is invalid');
    const [customer] = await this.db.query(
      `SELECT "MSISDN"::text AS "ownerMsisdn",
              concat_ws(' ',"First_Name","Last_Name") AS "displayName",
              "Email" AS email,"Status" AS status,"KYC_Status" AS "kycStatus"
       FROM public."SW_TBL_PROFILE_CUST" WHERE "MSISDN"=$1::bigint`, [identity],
    );
    if (customer) return { accountType: 'CUSTOMER', ownerType: 'CUSTOMER', businessType: null, ...customer };
    const [merchant] = await this.db.query(
      `SELECT "MSISDN"::text AS "ownerMsisdn","Merchant_Name" AS "displayName",
              "Email" AS email,"Status" AS status,"Merchant_Type" AS "businessType"
       FROM public."SW_TBL_PROFILE_MERCHANT" WHERE "MSISDN"=$1::bigint`, [identity],
    );
    if (merchant) return { accountType: 'BUSINESS', ownerType: 'MERCHANT', kycStatus: null, ...merchant };
    throw new NotFoundException('Portal account was not found');
  }

  private walletsFor(principal: Principal) {
    return this.db.query(
      `SELECT wallet."Wallet_MSISDN"::text AS "walletId",
              wallet."Account_code"::text AS "accountCode",wallet."Wallet_Code" AS "walletCode",
              type."Wallet_Name" AS "walletName",wallet."Amount"::numeric AS balance,
              wallet.commission_balance::numeric AS "commissionBalance",upper(wallet.currency) AS currency,
              wallet."Status" AS status,wallet.is_default AS "isDefault",
              wallet.wallet_purpose AS purpose,wallet.iban,wallet.swift_bic AS "swiftBic"
       FROM public."SW_TBL_WALLET" wallet
       LEFT JOIN public."SW_TBL_WALLET_TYPE" type ON type."Wallet_ID"=wallet."Wallet_Code"
       WHERE wallet.owner_msisdn=$1::bigint AND wallet.owner_type=$2 AND wallet."Status"<>6
       ORDER BY wallet.is_default DESC,wallet."Created_Date"`,
      [principal.ownerMsisdn, principal.ownerType],
    );
  }

  private activityFor(walletIds: string[], limit: number, offset: number) {
    if (!walletIds.length) return Promise.resolve([]);
    return this.db.query(
      `SELECT entry.id::text,entry.transactionid::text AS "transactionId",
              entry.accountnumber::text AS "walletId",entry."Debit"::numeric AS debit,
              entry."Credit"::numeric AS credit,entry.balance_before::numeric AS "balanceBefore",
              entry.balance_after::numeric AS "balanceAfter",entry.currency,
              entry.business_date AS "businessDate",entry.entrydate AS "createdAt",
              request."Keyword" AS keyword,request."Reference_ID" AS reference,
              request."Source_Wallet_ID"::text AS "sourceWalletId",
              request."Dest_Wallet_ID"::text AS "destinationWalletId"
       FROM public.sw_tbl_accounting_entry entry
       LEFT JOIN public."SW_TBL_TRANSACTION_REQUEST" request
         ON request."Transaction_ID"=entry.transactionid
       WHERE entry.accountnumber=ANY($1::bigint[])
       ORDER BY entry.entrydate DESC,entry.id DESC LIMIT $2 OFFSET $3`,
      [walletIds, limit, offset],
    );
  }
}
