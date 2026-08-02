import {
  BadRequestException, BadGatewayException, ForbiddenException, Injectable,
  NotFoundException, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
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
    const kycRequired = principal.accountType === 'CUSTOMER'
      && wallets.some((wallet: any) => Boolean(wallet.kycRequired));
    const kycComplete = !kycRequired || kyc?.status === 'APPROVED';
    return { principal, wallets, balances, recentActivity: activity, kyc, kycRequired, kycComplete, services };
  }

  async kycJourney(identity: string) {
    const principal = await this.principal(identity);
    if (principal.accountType !== 'CUSTOMER') {
      throw new BadRequestException('Business KYC is managed through the business onboarding process');
    }
    const [requirement] = await this.db.query(
      `SELECT EXISTS(
         SELECT 1 FROM public."SW_TBL_WALLET" wallet
         JOIN public."SW_TBL_WALLET_TYPE" type ON type."Wallet_ID"=wallet."Wallet_Code"
         WHERE wallet.owner_type='CUSTOMER' AND wallet.owner_msisdn=$1::bigint
           AND wallet."Status"<>6 AND type."Is_Kyc_Needed"
       ) AS required`, [identity],
    );
    const [kycCase] = await this.db.query(
      `SELECT id,status,document_type AS "documentType",issuing_country AS "issuingCountry",
              system_recommendation AS "systemRecommendation",
              face_match_score::numeric AS "faceMatchScore",aml_match AS "amlMatch",
              screening_summary AS "screeningSummary",final_reason AS "finalReason",
              created_at AS "createdAt",updated_at AS "updatedAt",reviewed_at AS "reviewedAt"
       FROM kyc.cases WHERE customer_msisdn=$1::bigint
       ORDER BY CASE WHEN status IN ('DRAFT','RESUBMISSION_REQUIRED','PROCESSING','MANUAL_REVIEW') THEN 0 ELSE 1 END,
                created_at DESC LIMIT 1`, [identity],
    );
    const documents = kycCase ? await this.db.query(
      `SELECT document_role AS role,original_name AS "originalName",created_at AS "createdAt"
       FROM kyc.documents WHERE case_id=$1::uuid AND deleted_at IS NULL
       ORDER BY created_at`, [kycCase.id],
    ) : [];
    return {
      required: Boolean(requirement?.required),
      complete: !requirement?.required || kycCase?.status === 'APPROVED',
      case: kycCase ? { ...kycCase, documents } : null,
    };
  }

  async uploadKycDocument(identity: string, role: string, file: Express.Multer.File) {
    const kycCase = await this.ownedEditableKycCase(identity);
    const allowedRole = kycCase.documentType === 'PASSPORT'
      ? ['PASSPORT', 'SELFIE']
      : ['ID_FRONT', 'ID_BACK', 'SELFIE'];
    const normalizedRole = String(role || '').trim().toUpperCase();
    if (!allowedRole.includes(normalizedRole)) {
      throw new BadRequestException('This document role is not valid for the selected identity document');
    }
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
      throw new BadRequestException('KYC evidence must be a JPEG or PNG image');
    }
    const form = new FormData();
    form.set('role', normalizedRole);
    form.set('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname);
    return this.callKyc(`/cases/${kycCase.id}/documents`, 'POST', identity, form);
  }

  async verifyKyc(identity: string) {
    const kycCase = await this.ownedEditableKycCase(identity);
    await this.callKyc(`/cases/${kycCase.id}/verify`, 'POST', identity, JSON.stringify({}));
    return this.kycJourney(identity);
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
    await this.assertKycEligible(principal);
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
    }, identity);
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
              ,CASE WHEN COALESCE(type."Is_Kyc_Needed"::int,0)=1 THEN true ELSE false END AS "kycRequired"
       FROM public."SW_TBL_WALLET" wallet
       LEFT JOIN public."SW_TBL_WALLET_TYPE" type ON type."Wallet_ID"=wallet."Wallet_Code"
       WHERE wallet.owner_msisdn=$1::bigint AND wallet.owner_type=$2 AND wallet."Status"<>6
       ORDER BY wallet.is_default DESC,wallet."Created_Date"`,
      [principal.ownerMsisdn, principal.ownerType],
    );
  }

  private async assertKycEligible(principal: Principal) {
    if (principal.accountType !== 'CUSTOMER') return;
    const [state] = await this.db.query(
      `SELECT EXISTS(
         SELECT 1 FROM public."SW_TBL_WALLET" wallet
         JOIN public."SW_TBL_WALLET_TYPE" type ON type."Wallet_ID"=wallet."Wallet_Code"
         WHERE wallet.owner_type='CUSTOMER' AND wallet.owner_msisdn=$1::bigint
           AND wallet."Status"<>6 AND type."Is_Kyc_Needed"
       ) AS required,
       EXISTS(
         SELECT 1 FROM kyc.cases WHERE customer_msisdn=$1::bigint AND status='APPROVED'
       ) AS approved`, [principal.ownerMsisdn],
    );
    if (state?.required && !state?.approved) {
      throw new ForbiddenException('Complete KYC verification before making a payment');
    }
  }

  private async ownedEditableKycCase(identity: string) {
    await this.principal(identity);
    const [kycCase] = await this.db.query(
      `SELECT id,document_type AS "documentType",status
       FROM kyc.cases WHERE customer_msisdn=$1::bigint
         AND status IN ('DRAFT','RESUBMISSION_REQUIRED')
       ORDER BY created_at DESC LIMIT 1`, [identity],
    );
    if (!kycCase) throw new ForbiddenException('No editable KYC case belongs to this account');
    return kycCase;
  }

  private async callKyc(path: string, method: string, actor: string, body: FormData | string) {
    const key = process.env.KYC_ADMIN_API_KEY || '';
    if (!key) throw new ServiceUnavailableException('KYC service credential is not configured');
    const base = (process.env.KYC_SERVICE_URL || 'http://127.0.0.1:5006').replace(/\/+$/, '');
    const multipart = body instanceof FormData;
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method,
        headers: {
          'x-admin-api-key': key,
          'x-actor-id': `CUSTOMER:${actor}`,
          ...(multipart ? {} : { 'content-type': 'application/json' }),
        },
        body,
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      throw new ServiceUnavailableException('KYC verification service is unavailable');
    }
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = Array.isArray(payload?.message) ? payload.message.join(', ') : payload?.message;
      throw new BadGatewayException(message || 'KYC service could not complete the request');
    }
    return payload;
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
