import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { connect } from 'node:net';
import { REDIS_CONNECTION } from '@config/constants';
import { decrypt } from '@helpers/cipher';
import { ChargeService } from '../transaction/charge.service';
import { CommissionService } from '../transaction/commission.service';

type Upstream = 'credit' | 'accounting' | 'kyc';

@Injectable()
export class AdminOperationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly charges: ChargeService,
    private readonly commissions: CommissionService,
    @Inject(REDIS_CONNECTION) private readonly cache: any,
  ) {}

  async systemPulse() {
    const checkedAt = new Date().toISOString();
    const creditUrl = this.config.get<string>('CREDIT_RULE_SERVICE_URL') || 'http://127.0.0.1:5005';
    const accountingUrl = this.config.get<string>('ACCOUNTING_SERVICE_URL') || 'http://127.0.0.1:5004';
    const consumerUrl = this.config.get<string>('CONSUMER_SERVICE_URL') || 'http://127.0.0.1:5003';
    const mockMerchantUrl = this.config.get<string>('MOCK_MERCHANT_SERVICE_URL') || 'http://127.0.0.1:5010';
    const adminUiUrl = this.config.get<string>('ADMIN_UI_SERVICE_URL') || 'http://127.0.0.1:3100';
    const portalUiUrl = this.config.get<string>('PORTAL_UI_SERVICE_URL') || 'http://127.0.0.1:3200';
    const kycUrl = this.config.get<string>('KYC_SERVICE_URL') || 'http://127.0.0.1:5006';
    const kycOcrUrl = this.config.get<string>('KYC_OCR_SERVICE_URL') || 'http://127.0.0.1:8000';
    const kongStatusUrl = this.config.get<string>('KONG_STATUS_URL') || 'http://127.0.0.1:8100/status';
    const accountingKey = this.config.get<string>('ACCOUNTING_ADMIN_API_KEY') || '';
    const integrationKey = this.config.get<string>('INTEGRATION_ADMIN_API_KEY') || '';
    const creditKey = this.config.get<string>('CREDIT_RULE_ADMIN_API_KEY') || '';
    const kycKey = this.config.get<string>('KYC_ADMIN_API_KEY') || '';
    const minioProtocol = String(this.config.get<string>('MINIO_USE_SSL') || 'false') === 'true'
      ? 'https'
      : 'http';
    const minioUrl = `${minioProtocol}://${this.config.get<string>('MINIO_ENDPOINT') || '127.0.0.1'}:${this.config.get<string>('MINIO_PORT') || '9000'}`;
    const [assistantSettings] = await this.dataSource.query(
      `SELECT api_key_ciphertext IS NOT NULL AS database_key_configured,model
       FROM public.mr_finify_settings WHERE id=1`,
    );
    const assistantConfigured = Boolean(
      assistantSettings?.database_key_configured
      || this.config.get<string>('OPENAI_API_KEY'),
    );
    const assistantModel = assistantSettings?.model
      || this.config.get<string>('OPENAI_MODEL')
      || 'gpt-5.6-sol';
    const [kong, adminUi, portalUi, consumer, credit, accounting, kyc, kycOcr, mockMerchant, postgres, redis, kafka, minio] = await Promise.all([
      this.checkHttp('kong', 'Kong API gateway', 'External API routing, limits, and perimeter controls', 'APPLICATION', kongStatusUrl),
      this.checkHttp('admin-ui', 'Admin UI', 'Command and control interface', 'APPLICATION', adminUiUrl),
      this.checkHttp('portal-ui', 'Customer & business portal', 'Responsive wallet and payment experience', 'APPLICATION', portalUiUrl),
      this.checkHttp('consumer', 'Consumer service', 'Authenticated merchant integration readiness', 'APPLICATION', `${consumerUrl.replace(/\/+$/, '')}/v1/merchant-integrations/source-fields`, { 'x-admin-api-key': integrationKey }, false),
      this.checkHttp('credit-rules', 'Credit rules', 'Authenticated policy administration readiness', 'APPLICATION', `${creditUrl.replace(/\/+$/, '')}/v1/credit-rule-masters?limit=1`, { 'x-api-key': creditKey, 'x-actor-id': 'system-pulse' }, false),
      this.checkHttp('accounting', 'Accounting service', 'Authenticated ledger administration readiness', 'APPLICATION', `${accountingUrl.replace(/\/+$/, '')}/v1/accounting/configurations`, { 'x-admin-api-key': accountingKey }, false),
      this.checkHttp('kyc', 'KYC service', 'Authenticated identity-case readiness', 'APPLICATION', `${kycUrl.replace(/\/+$/, '')}/cases?limit=1`, { 'x-admin-api-key': kycKey, 'x-actor-id': 'system-pulse' }, false),
      this.checkHttp('kyc-ocr', 'KYC OCR worker', 'Document OCR and biometric face comparison', 'APPLICATION', `${kycOcrUrl.replace(/\/+$/, '')}/health`),
      this.checkHttp('mock-merchant', 'Mock merchant', 'Two-leg merchant approval and rejection simulator', 'APPLICATION', `${mockMerchantUrl.replace(/\/+$/, '')}/health`),
      this.checkDatabase(),
      this.checkRedis(),
      this.checkKafka(),
      this.checkHttp('minio', 'MinIO', 'Private treasury document storage', 'DEPENDENCY', `${minioUrl}/minio/health/live`),
    ]);
    const services = [
      {
        id: 'producer',
        label: 'Producer API',
        detail: 'Core transaction and administration API',
        category: 'APPLICATION',
        state: 'operational',
        latency: 0,
        message: 'System Pulse endpoint is responding',
      },
      {
        id: 'mr-finify',
        label: 'Mr. Finify',
        detail: 'Role-scoped intelligent financial operations assistant',
        category: 'APPLICATION',
        state: assistantConfigured ? 'operational' : 'degraded',
        latency: 0,
        message: assistantConfigured
          ? `OpenAI Responses connection configured with ${assistantModel}`
          : 'Secure OpenAI API key configuration is required',
      },
      kong,
      adminUi,
      portalUi,
      consumer,
      credit,
      accounting,
      kyc,
      kycOcr,
      mockMerchant,
      postgres,
      redis,
      kafka,
      minio,
    ];
    const operational = services.filter((service) => service.state === 'operational').length;
    return {
      status: operational === services.length ? 'operational' : 'degraded',
      checkedAt,
      refreshAfterSeconds: 15,
      summary: {
        total: services.length,
        operational,
        degraded: services.length - operational,
      },
      services,
    };
  }

  async commandCenterMetrics() {
    const [metricRows, balanceRows, systemWallets] = await Promise.all([
      this.dataSource.query(
        `SELECT
         (SELECT count(*)::int
          FROM public."SW_TBL_WALLET"
          WHERE owner_type='CUSTOMER') AS "customerWallets",
         (SELECT count(*)::int
          FROM public."SW_TBL_WALLET"
          WHERE owner_type='CUSTOMER' AND "Status"=0) AS "activeCustomerWallets",
         (SELECT count(DISTINCT scored.profile_msisdn)::int
          FROM public.credit_scored_customers scored
          JOIN public."SW_TBL_PROFILE_CUST" profile
            ON profile."MSISDN"=scored.profile_msisdn) AS "scoredProfiles",
         (SELECT count(*)::int
          FROM public.credit_scored_customers) AS "scoreRecords",
         (SELECT count(*)::int
          FROM public.credit_master_rules) AS "creditPolicies",
         (SELECT count(*)::int
          FROM public.credit_master_rules
          WHERE status='ACTIVE') AS "activeCreditPolicies",
         (SELECT count(*)::int
          FROM public.reference_data_change_requests
          WHERE status='PENDING') AS "referenceDataReviews",
         (SELECT count(*)::int
          FROM public.pricing_rule_flows
          WHERE status='SUBMITTED') AS "pricingReviews",
         (SELECT count(*)::int
          FROM public.treasury_funding_requests
          WHERE status='PENDING') AS "treasuryFundingReviews",
         (SELECT count(*)::int
          FROM kyc.cases
          WHERE status='MANUAL_REVIEW') AS "kycReviews"`,
      ),
      this.dataSource.query(
        `SELECT owner_type AS "ownerType",upper(currency) AS currency,
                count(*)::int AS "walletCount",
                COALESCE(sum("Amount"::numeric),0)::numeric AS balance
         FROM public."SW_TBL_WALLET"
         WHERE owner_type IN ('CUSTOMER','MERCHANT') AND "Status"<>6
         GROUP BY owner_type,upper(currency)
         ORDER BY owner_type,upper(currency)`,
      ),
      this.dataSource.query(
        `SELECT wallet."Wallet_MSISDN"::text AS "walletId",
                wallet."Wallet_Code" AS "walletCode",
                COALESCE(type."Wallet_Name",wallet.wallet_purpose) AS "walletName",
                wallet.wallet_purpose AS purpose,
                wallet."Amount"::numeric AS balance,
                upper(wallet.currency) AS currency,
                wallet."Status" AS status
         FROM public."SW_TBL_WALLET" wallet
         LEFT JOIN public."SW_TBL_WALLET_TYPE" type
           ON type."Wallet_ID"=wallet."Wallet_Code"
         WHERE wallet.owner_type='SYSTEM'
         ORDER BY wallet."Wallet_Code",upper(wallet.currency),wallet."Wallet_MSISDN"`,
      ),
    ]);
    const metrics = metricRows[0];
    const referenceData = Number(metrics?.referenceDataReviews || 0);
    const pricingFlows = Number(metrics?.pricingReviews || 0);
    const treasuryFunding = Number(metrics?.treasuryFundingReviews || 0);
    const kyc = Number(metrics?.kycReviews || 0);
    const balances = (ownerType: 'CUSTOMER' | 'MERCHANT') =>
      balanceRows
        .filter((row: Record<string, unknown>) => row.ownerType === ownerType)
        .map((row: Record<string, unknown>) => ({
          currency: String(row.currency),
          balance: String(row.balance),
          walletCount: Number(row.walletCount),
        }));
    return {
      checkedAt: new Date().toISOString(),
      customerWallets: {
        total: Number(metrics?.customerWallets || 0),
        active: Number(metrics?.activeCustomerWallets || 0),
        balances: balances('CUSTOMER'),
      },
      merchantWallets: {
        balances: balances('MERCHANT'),
      },
      systemWallets: systemWallets.map((wallet: Record<string, unknown>) => ({
        ...wallet,
        walletCode: Number(wallet.walletCode),
        status: Number(wallet.status),
        balance: String(wallet.balance),
      })),
      scoredProfiles: {
        total: Number(metrics?.scoredProfiles || 0),
        scoreRecords: Number(metrics?.scoreRecords || 0),
        linkedBy: 'MSISDN',
      },
      creditPolicies: {
        total: Number(metrics?.creditPolicies || 0),
        active: Number(metrics?.activeCreditPolicies || 0),
      },
      pendingReviews: {
        total: referenceData + pricingFlows + treasuryFunding + kyc,
        referenceData,
        pricingFlows,
        treasuryFunding,
        kyc,
      },
    };
  }

  treasuryFundingRequests(status?: string) {
    const normalized = String(status || '').trim().toUpperCase();
    if (normalized && !['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(normalized)) {
      throw new BadRequestException('Unsupported treasury funding status');
    }
    return this.dataSource.query(
      `SELECT request.id::text,request.funding_type AS "fundingType",
              request.direction,request.business_purpose AS "businessPurpose",
              request.funding_classification AS "fundingClassification",
              request.wallet_msisdn::text AS "walletId",
              request.wallet_code AS "walletCode",type."Wallet_Name" AS "walletName",
              request.currency,request.amount::numeric AS amount,request.reference,
              request.bank_name AS "bankName",request.bank_account AS "bankAccount",
              request.value_date AS "valueDate",
              request.evidence_reference AS "evidenceReference",
              document.id::text AS "evidenceDocumentId",
              document.original_name AS "evidenceDocumentName",
              document.content_type AS "evidenceDocumentType",
              document.size_bytes::text AS "evidenceDocumentSize",
              request.status,request.maker_id AS maker,request.maker_comment AS "makerComment",
              request.checker_id AS checker,request.checker_comment AS "checkerComment",
              request.wallet_balance_before::numeric AS "balanceBefore",
              request.wallet_balance_after::numeric AS "balanceAfter",
              request.created_at AS "createdAt",request.decided_at AS "decidedAt"
       FROM public.treasury_funding_requests request
       JOIN public."SW_TBL_WALLET_TYPE" type ON type."Wallet_ID"=request.wallet_code
       LEFT JOIN public.treasury_documents document
         ON document.treasury_request_id=request.id AND document.status='ATTACHED'
       WHERE ($1='' OR request.status=$1)
       ORDER BY CASE WHEN request.status='PENDING' THEN 0 ELSE 1 END,
                request.created_at DESC,request.id DESC`,
      [normalized],
    );
  }

  async createTreasuryFunding(
    body: Record<string, unknown>,
    actor: string,
  ) {
    const operations: Record<string, {
      direction: 'CREDIT' | 'DEBIT';
      fundingType: 'SAFEGUARDING' | 'COMMISSION_FUNDING' | 'CHARGE_REVENUE';
      walletCode: number;
      businessPurpose: string;
    }> = {
      ADD_SAFEGUARDING: {
        direction: 'CREDIT',
        fundingType: 'SAFEGUARDING',
        walletCode: 110,
        businessPurpose: 'SAFEGUARDING_FUNDING',
      },
      ADD_COMMISSION_FUNDING: {
        direction: 'CREDIT',
        fundingType: 'COMMISSION_FUNDING',
        walletCode: 114,
        businessPurpose: 'COMMISSION_FUNDING',
      },
      WITHDRAW_SAFEGUARDING: {
        direction: 'DEBIT',
        fundingType: 'SAFEGUARDING',
        walletCode: 110,
        businessPurpose: 'SAFEGUARDING_WITHDRAWAL',
      },
      WITHDRAW_CHARGE_REVENUE: {
        direction: 'DEBIT',
        fundingType: 'CHARGE_REVENUE',
        walletCode: 113,
        businessPurpose: 'GROSS_PROFIT_WITHDRAWAL',
      },
    };
    const legacyFundingType = String(body.fundingType || '').trim().toUpperCase();
    const operationName = String(
      body.operation
      || (legacyFundingType === 'SAFEGUARDING' ? 'ADD_SAFEGUARDING' : '')
      || (legacyFundingType === 'COMMISSION_FUNDING' ? 'ADD_COMMISSION_FUNDING' : ''),
    ).trim().toUpperCase();
    const operation = operations[operationName];
    if (!operation) {
      throw new BadRequestException(
        'Operation must add safeguarding, add commission funding, withdraw safeguarding, or withdraw charge revenue',
      );
    }
    const requestedClassification = String(body.fundingClassification || '')
      .trim()
      .toUpperCase();
    const safeguardingClassifications = [
      'OWNER_INVESTMENT',
      'CUSTOMER_FUNDS',
      'BANK_PREFUNDING',
    ];
    let fundingClassification = 'NOT_APPLICABLE';
    if (operation.fundingType === 'SAFEGUARDING') {
      if (!safeguardingClassifications.includes(requestedClassification)) {
        throw new BadRequestException(
          'Safeguarding funding classification must be owner investment, customer funds, or bank prefunding',
        );
      }
      fundingClassification = requestedClassification;
    } else if (requestedClassification && requestedClassification !== 'NOT_APPLICABLE') {
      throw new BadRequestException(
        'Funding classification applies only to safeguarding movements',
      );
    }
    const currency = String(body.currency || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException('A three-letter currency is required');
    }
    const amount = String(body.amount ?? '').trim().replace(/,/g, '');
    if (!/^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      throw new BadRequestException('Movement amount must be positive with no more than two decimals');
    }
    const reference = String(body.reference || '').trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._/-]{2,99}$/.test(reference)) {
      throw new BadRequestException('Reference must contain 3-100 letters, numbers, dots, slashes, underscores, or hyphens');
    }
    const bankName = String(body.bankName || '').trim();
    if (bankName.length < 2 || bankName.length > 160) {
      throw new BadRequestException('Bank name must contain 2-160 characters');
    }
    const bankAccount = String(body.bankAccount || '').trim();
    if (bankAccount.length < 3 || bankAccount.length > 160) {
      throw new BadRequestException('Bank account or IBAN must contain 3-160 characters');
    }
    const valueDate = String(body.valueDate || '').trim();
    const parsedValueDate = new Date(`${valueDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valueDate)
      || Number.isNaN(parsedValueDate.getTime())
      || parsedValueDate.toISOString().slice(0, 10) !== valueDate) {
      throw new BadRequestException('A valid value date in YYYY-MM-DD format is required');
    }
    const evidenceReference = String(body.evidenceReference || '').trim();
    if (evidenceReference.length < 3 || evidenceReference.length > 500) {
      throw new BadRequestException('Evidence URL or document reference must contain 3-500 characters');
    }
    const evidenceDocumentId = String(body.evidenceDocumentId || '').trim();
    if (evidenceDocumentId && !/^\d+$/.test(evidenceDocumentId)) {
      throw new BadRequestException('Invalid bank transaction document');
    }
    const comment = String(body.comment || '').trim();
    if (comment.length < 3 || comment.length > 500) {
      throw new BadRequestException('A movement reason between 3 and 500 characters is required');
    }
    try {
      return await this.dataSource.transaction(async manager => {
        await manager.query(
          `SELECT pg_advisory_xact_lock(hashtext(lower($1)))`,
          [reference],
        );
        let evidenceDocument: Record<string, unknown> | undefined;
        if (evidenceDocumentId) {
          [evidenceDocument] = await manager.query(
            `SELECT id::text,status,uploaded_by AS "uploadedBy"
             FROM public.treasury_documents
             WHERE id=$1::bigint FOR UPDATE`,
            [evidenceDocumentId],
          );
          if (!evidenceDocument || evidenceDocument.status !== 'UPLOADED') {
            throw new ConflictException(
              'The bank transaction document is missing or already attached',
            );
          }
          if (String(evidenceDocument.uploadedBy).trim().toLowerCase()
            !== actor.trim().toLowerCase()) {
            throw new ConflictException(
              'The bank transaction document belongs to another administrator',
            );
          }
        }
        const wallets = await manager.query(
          `SELECT "Wallet_MSISDN"::text AS "walletId","Wallet_Code" AS "walletCode"
           FROM public."SW_TBL_WALLET"
           WHERE owner_type='SYSTEM' AND "Wallet_Code"=$1
             AND upper(currency)=$2 AND "Status"=0
           FOR SHARE`,
          [operation.walletCode, currency],
        );
        if (!wallets.length) {
          throw new NotFoundException(
            `An active ${operation.fundingType.replace(/_/g, ' ').toLowerCase()} wallet is not configured for ${currency}`,
          );
        }
        if (wallets.length > 1) {
          throw new ConflictException(
            `Multiple ${operation.fundingType.replace(/_/g, ' ').toLowerCase()} wallets are configured for ${currency}`,
          );
        }
        const [request] = await manager.query(
          `INSERT INTO public.treasury_funding_requests(
             funding_type,wallet_msisdn,wallet_code,currency,amount,reference,
             maker_id,maker_comment,direction,bank_name,bank_account,value_date,
             evidence_reference,business_purpose,funding_classification
           ) VALUES($1,$2::bigint,$3,$4,$5::numeric,$6,$7,$8,$9,$10,$11,$12::date,$13,$14,$15)
           RETURNING id::text,funding_type AS "fundingType",
                     direction,business_purpose AS "businessPurpose",
                     funding_classification AS "fundingClassification",
                     wallet_msisdn::text AS "walletId",wallet_code AS "walletCode",
                     currency,amount::numeric,reference,status,
                     bank_name AS "bankName",bank_account AS "bankAccount",
                     value_date AS "valueDate",evidence_reference AS "evidenceReference",
                     maker_id AS maker,maker_comment AS "makerComment",
                     created_at AS "createdAt"`,
          [
            operation.fundingType,
            wallets[0].walletId,
            wallets[0].walletCode,
            currency,
            amount,
            reference,
            actor,
            comment,
            operation.direction,
            bankName,
            bankAccount,
            valueDate,
            evidenceReference,
            operation.businessPurpose,
            fundingClassification,
          ],
        );
        if (evidenceDocument) {
          await manager.query(
            `UPDATE public.treasury_documents
             SET treasury_request_id=$2::bigint,status='ATTACHED',
                 attached_at=CURRENT_TIMESTAMP
             WHERE id=$1::bigint AND status='UPLOADED'`,
            [evidenceDocumentId, request.id],
          );
          request.evidenceDocumentId = evidenceDocumentId;
        }
        return request;
      });
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new ConflictException('This bank transaction reference already exists');
      }
      throw error;
    }
  }

  reviewTreasuryFunding(
    id: string,
    action: 'approve' | 'reject',
    comment: string | undefined,
    actor: string,
  ) {
    if (!/^\d+$/.test(id)) throw new BadRequestException('Invalid treasury movement request');
    const checkerComment = String(comment || '').trim();
    if (action === 'reject' && checkerComment.length < 3) {
      throw new BadRequestException('A rejection reason is required');
    }
    return this.dataSource.transaction(async manager => {
      const [request] = await manager.query(
        `SELECT * FROM public.treasury_funding_requests
         WHERE id=$1::bigint FOR UPDATE`,
        [id],
      );
      if (!request) throw new NotFoundException('Treasury movement request was not found');
      if (request.status !== 'PENDING') {
        throw new ConflictException(`Treasury movement request is already ${request.status}`);
      }
      if (String(request.maker_id).trim().toLowerCase() === actor.trim().toLowerCase()) {
        throw new BadRequestException('Maker cannot approve or reject their own treasury movement');
      }
      if (action === 'reject') {
        const rejectedResult = await manager.query(
          `UPDATE public.treasury_funding_requests
           SET status='REJECTED',checker_id=$2,checker_comment=$3,
               decided_at=CURRENT_TIMESTAMP
           WHERE id=$1::bigint
           RETURNING id::text,status,checker_id AS checker,
                     checker_comment AS "checkerComment",decided_at AS "decidedAt"`,
          [id, actor, checkerComment],
        );
        const rejected = this.firstReturnedRow(rejectedResult);
        return rejected;
      }
      const [wallet] = await manager.query(
        `SELECT "Wallet_MSISDN"::text AS "walletId",owner_msisdn::text AS "ownerMsisdn",
                "Wallet_Code" AS "walletCode","Amount"::numeric AS balance,
                currency,"Status" AS status,wallet_purpose AS purpose
         FROM public."SW_TBL_WALLET"
         WHERE "Wallet_MSISDN"=$1::bigint FOR UPDATE`,
        [request.wallet_msisdn],
      );
      if (!wallet || Number(wallet.status) !== 0) {
        throw new ConflictException('The target system wallet is not active');
      }
      const direction = request.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT';
      const safeguardingContra = {
        OWNER_INVESTMENT: {
          walletCode: 116,
          category: 'OWNER_CAPITAL',
          accountPrefix: 'OWNER_CAPITAL',
          creditDescription: 'Owner capital investment',
          debitDescription: 'Owner capital reduction',
        },
        CUSTOMER_FUNDS: {
          walletCode: 117,
          category: 'CUSTOMER_FUNDS_LIABILITY',
          accountPrefix: 'CUSTOMER_FUNDS',
          creditDescription: 'Customer safeguarding funds liability',
          debitDescription: 'Customer safeguarding funds reduction',
        },
        BANK_PREFUNDING: {
          walletCode: 115,
          category: 'BANK_PREFUNDING',
          accountPrefix: 'BANK_PREFUNDING',
          creditDescription: 'Bank or partner prefunding liability',
          debitDescription: 'Bank or partner prefunding reduction',
        },
      } as const;
      if (id.length > 17) {
        throw new Error('Treasury request identifier exceeds the accounting namespace');
      }
      const treasuryTransactionId = `-7${id.padStart(17, '0')}`;
      if (direction === 'DEBIT' && Number(wallet.balance) < Number(request.amount)) {
        throw new ConflictException(
          `Insufficient ${request.funding_type.replace(/_/g, ' ').toLowerCase()} balance`,
        );
      }
      const previous = { ...wallet };
      const fundedResult = await manager.query(
        `UPDATE public."SW_TBL_WALLET"
         SET "Balance_Before"="Amount",
             "Amount"="Amount"+CASE WHEN $4='CREDIT' THEN $2::numeric ELSE -$2::numeric END,
             "Last_Transaction_ID"=$5::bigint,
             "Last_Transaction_Amount"=$2::numeric,
             "Modified_By"=$3,"Modified_Date"=CURRENT_TIMESTAMP
         WHERE "Wallet_MSISDN"=$1::bigint
           AND ($4='CREDIT' OR "Amount">=$2::numeric)
         RETURNING "Wallet_MSISDN"::text AS "walletId",
                   "Amount"::numeric AS "balance",currency`,
        [request.wallet_msisdn, request.amount, actor, direction, treasuryTransactionId],
      );
      const funded = this.firstReturnedRow(fundedResult);
      if (!funded) {
        throw new ConflictException(
          `Insufficient ${request.funding_type.replace(/_/g, ' ').toLowerCase()} balance`,
        );
      }
      const fundedBalance = funded.balance ?? funded.Amount;
      if (fundedBalance === undefined || fundedBalance === null) {
        throw new Error('Treasury wallet update did not return its resulting balance');
      }
      let accountingJournalId: string | null = null;
      if (request.funding_type === 'SAFEGUARDING') {
        const classification = String(request.funding_classification || 'BANK_PREFUNDING')
          .toUpperCase() as keyof typeof safeguardingContra;
        const contra = safeguardingContra[classification];
        if (!contra) {
          throw new ConflictException('The safeguarding funding classification is invalid');
        }
        const sourceWallets = await manager.query(
          `SELECT "Wallet_MSISDN"::text AS "walletId","Amount"::numeric AS balance
           FROM public."SW_TBL_WALLET"
           WHERE owner_type='SYSTEM' AND "Wallet_Code"=$2
             AND upper(currency)=upper($1) AND "Status"=0
           FOR UPDATE`,
          [request.currency, contra.walletCode],
        );
        if (sourceWallets.length !== 1) {
          throw new ConflictException(
            `Exactly one ${classification.replace(/_/g, ' ').toLowerCase()} control account is required for ${request.currency}`,
          );
        }
        const sourceWallet = sourceWallets[0];
        if (direction === 'DEBIT' && Number(sourceWallet.balance) < Number(request.amount)) {
          throw new ConflictException(
            `Insufficient ${classification.replace(/_/g, ' ').toLowerCase()} balance for ${request.currency}`,
          );
        }
        const fundingSourceResult = await manager.query(
          `UPDATE public."SW_TBL_WALLET"
           SET "Balance_Before"="Amount",
               "Amount"="Amount"+CASE WHEN $4='CREDIT' THEN $2::numeric ELSE -$2::numeric END,
               "Last_Transaction_ID"=$5::bigint,
               "Last_Transaction_Amount"=$2::numeric,
               "Modified_By"=$3,"Modified_Date"=CURRENT_TIMESTAMP
           WHERE "Wallet_MSISDN"=$1::bigint
             AND ($4='CREDIT' OR "Amount">=$2::numeric)
           RETURNING "Amount"::numeric AS "balance"`,
          [
            sourceWallet.walletId,
            request.amount,
            actor,
            direction,
            treasuryTransactionId,
          ],
        );
        const fundingSource = this.firstReturnedRow(fundingSourceResult);
        const fundingSourceBalance = fundingSource?.balance ?? fundingSource?.Amount;
        if (fundingSourceBalance === undefined || fundingSourceBalance === null) {
          throw new Error('Treasury funding source update did not return its resulting balance');
        }
        const [journal] = await manager.query(
          `INSERT INTO public.sw_tbl_accounting_journal(
             transactionid,mode,action,leg,status,keyword,reference,currency,
             payload,payload_hash,completed_at,business_date,reporting_entity)
           VALUES(
             $1::bigint,'DIRECT','POST',1,'COMPLETED','TREASURY_SAFEGUARDING',
             $2,$3,$4::jsonb,md5($4::text),CURRENT_TIMESTAMP,$5::date,'FINIFY_UK')
           RETURNING id::text`,
          [
            treasuryTransactionId,
            request.reference,
            request.currency,
            JSON.stringify({
              treasuryRequestId: id,
              fundingType: request.funding_type,
              fundingClassification: classification,
              direction,
              businessPurpose: request.business_purpose,
              bankName: request.bank_name,
              bankAccount: request.bank_account,
              valueDate: request.value_date,
              evidenceReference: request.evidence_reference,
            }),
            request.value_date,
          ],
        );
        accountingJournalId = journal.id;
        await manager.query(
          `INSERT INTO public.sw_tbl_accounting_entry(
             transactionid,"Debit","Credit",entrydate,accounttype,accountnumber,
             journal_id,line_number,account_code,currency,description,
             balance_before,balance_after,metadata)
           VALUES
           ($1::bigint,
             CASE WHEN $8='CREDIT' THEN $2::numeric ELSE 0 END,
             CASE WHEN $8='DEBIT' THEN $2::numeric ELSE 0 END,
             CURRENT_TIMESTAMP,
             (SELECT id FROM public.sw_tbl_accounting_category
              WHERE accountname='SAFEGUARDING_ASSET'),
             $3::bigint,$4::bigint,1,$5,$6,
             CASE WHEN $8='CREDIT'
               THEN 'Bank safeguarding funding'
               ELSE 'Bank safeguarding withdrawal' END,
             $7::numeric,$9::numeric,
             jsonb_build_object('treasuryRequestId',$10::bigint,'direction',$8)),
           ($1::bigint,
             CASE WHEN $8='DEBIT' THEN $2::numeric ELSE 0 END,
             CASE WHEN $8='CREDIT' THEN $2::numeric ELSE 0 END,
             CURRENT_TIMESTAMP,
             (SELECT id FROM public.sw_tbl_accounting_category
              WHERE accountname=$15),
             $11::bigint,$4::bigint,2,$12,$6,
             CASE WHEN $8='CREDIT' THEN $16 ELSE $17 END,
             $13::numeric,$14::numeric,
             jsonb_build_object('treasuryRequestId',$10::bigint,'direction',$8))`,
          [
            treasuryTransactionId,
            request.amount,
            request.wallet_msisdn,
            accountingJournalId,
            `SAFEGUARDING:${request.wallet_msisdn}`,
            request.currency,
            wallet.balance,
            direction,
            fundedBalance,
            id,
            sourceWallet.walletId,
            `${contra.accountPrefix}:${sourceWallet.walletId}`,
            sourceWallet.balance,
            fundingSourceBalance,
            contra.category,
            contra.creditDescription,
            contra.debitDescription,
          ],
        );
      }
      await manager.query(
        `UPDATE public.treasury_funding_requests
         SET status='APPROVED',checker_id=$2,checker_comment=$3,
             wallet_balance_before=$4::numeric,wallet_balance_after=$5::numeric,
             accounting_journal_id=$6::bigint,
             decided_at=CURRENT_TIMESTAMP
         WHERE id=$1::bigint`,
        [
          id,
          actor,
          checkerComment || null,
          wallet.balance,
          fundedBalance,
          accountingJournalId,
        ],
      );
      await manager.query(
        `INSERT INTO public.sw_tbl_wallet_operation_audit(
           wallet_msisdn,owner_msisdn,operation,previous_state,new_state,reason,
           actor_type,actor_id,correlation_id
         ) VALUES(
           $1::bigint,$2::bigint,$8,$3::jsonb,$4::jsonb,$5,
           'ADMIN',$6,$7
         )`,
        [
          request.wallet_msisdn,
          wallet.ownerMsisdn,
          JSON.stringify(previous),
          JSON.stringify({ ...previous, balance: fundedBalance }),
          JSON.stringify({
            reason: request.maker_comment,
            bankName: request.bank_name,
            bankAccount: request.bank_account,
            valueDate: request.value_date,
            evidenceReference: request.evidence_reference,
            businessPurpose: request.business_purpose,
            fundingClassification: request.funding_classification,
          }),
          actor,
          request.reference,
          direction === 'CREDIT' ? 'TREASURY_FUNDING' : 'TREASURY_WITHDRAWAL',
        ],
      );
      return {
        id,
        status: 'APPROVED',
        fundingType: request.funding_type,
        direction,
        businessPurpose: request.business_purpose,
        fundingClassification: request.funding_classification,
        reference: request.reference,
        amount: request.amount,
        wallet: { ...funded, balance: fundedBalance },
        accountingJournalId,
        checker: actor,
      };
    });
  }

  async customers(query: {
    page?: string;
    limit?: string;
    search?: string;
    status?: string;
    category?: string;
  }) {
    const page = this.positiveInteger(query.page, 1, 1, 100000);
    const limit = this.positiveInteger(query.limit, 25, 1, 200);
    const conditions = ['1=1'];
    const values: unknown[] = [];
    const add = (clause: string, value: unknown) => {
      values.push(value);
      conditions.push(clause.replace('?', `$${values.length}`));
    };
    if (query.search?.trim()) {
      const search = query.search.trim();
      values.push(search);
      const parameter = `$${values.length}`;
      if (/^\d+$/.test(search)) {
        conditions.push(`profile."MSISDN"::text LIKE ${parameter}||'%'`);
      } else {
        conditions.push(
          `(lower(COALESCE(profile."First_Name",'')||' '||COALESCE(profile."Last_Name",''))
              LIKE '%'||lower(${parameter})||'%'
            OR lower(COALESCE(profile."Email",''))
              LIKE '%'||lower(${parameter})||'%')`,
        );
      }
    }
    if (query.status !== undefined && query.status !== '') {
      add('profile."Status"=?::smallint', Number(query.status));
    }
    if (query.category?.trim()) {
      values.push(query.category.trim());
      conditions.push(
        `upper(COALESCE((
          SELECT score.customer_category
          FROM public.credit_scored_customers score
          WHERE score.profile_msisdn=profile."MSISDN"
          ORDER BY score.updated_at DESC,score._id DESC LIMIT 1
        ),''))=upper($${values.length})`,
      );
    }
    const where = conditions.join(' AND ');
    const [countRows] = await this.dataSource.query(
      `SELECT count(*)::int AS count
       FROM public."SW_TBL_PROFILE_CUST" profile
       WHERE ${where}`,
      values,
    );
    const offset = (page - 1) * limit;
    const rows = await this.dataSource.query(
      `WITH page_profiles AS (
         SELECT profile.*
         FROM public."SW_TBL_PROFILE_CUST" profile
         WHERE ${where}
         ORDER BY profile."Created_Date" DESC NULLS LAST,profile."MSISDN" DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}
       )
       SELECT profile."MSISDN"::text AS "customerId",
              concat_ws(' ',profile."First_Name",profile."Last_Name") AS name,
              profile."First_Name" AS "firstName",profile."Last_Name" AS "lastName",
              profile."Email" AS email,profile."ID_Number" AS "idNumber",
              profile."ID_Type" AS "idType",
              profile."KYC_Status" AS "kycStatus",profile."Status" AS status,
              profile."Gender" AS gender,profile."DOB" AS dob,profile."Address" AS address,
              profile."KYC_Case_ID" AS "kycCaseId",
              profile."KYC_Verified_Date" AS "kycVerifiedAt",
              profile."KYC_Verified_By" AS "kycVerifiedBy",
              EXISTS(
                SELECT 1 FROM public."SW_TBL_WALLET" required_wallet
                JOIN public."SW_TBL_WALLET_TYPE" required_type
                  ON required_type."Wallet_ID"=required_wallet."Wallet_Code"
                WHERE required_wallet.owner_type='CUSTOMER'
                  AND required_wallet.owner_msisdn=profile."MSISDN"
                  AND required_type."Is_Kyc_Needed"
              ) AS "kycRequired",
              EXISTS(
                SELECT 1 FROM kyc.cases linked_case
                WHERE linked_case.customer_msisdn=profile."MSISDN"
              ) AS "kycDataConnected",
              profile."Created_Date" AS "createdAt",
              scored.credit_score AS "creditScore",scored.customer_category AS category,
              scored.credit_limit AS "creditLimit",scored.current_credit_limit AS "availableLimit",
              scored.max_instalment AS "maxInstalment",scored.current_dpd AS "currentDpd",
              COALESCE(wallets.count,0)::int AS "walletCount",
              COALESCE(wallets.balance,0)::numeric AS "walletBalance",
              COALESCE(wallets.balances,'[]'::jsonb) AS "walletBalances"
       FROM page_profiles profile
       LEFT JOIN LATERAL (
         SELECT score.* FROM public.credit_scored_customers score
         WHERE score.profile_msisdn=profile."MSISDN"
         ORDER BY score.updated_at DESC,score._id DESC LIMIT 1
       ) scored ON true
       LEFT JOIN LATERAL (
         SELECT sum(grouped.count)::int AS count,
                sum(grouped.balance)::numeric AS balance,
                jsonb_agg(
                  jsonb_build_object(
                    'currency',grouped.currency,
                    'walletCount',grouped.count,
                    'balance',grouped.balance
                  ) ORDER BY grouped.currency
                ) AS balances
         FROM (
           SELECT upper(wallet.currency) AS currency,count(*)::int AS count,
                  sum(wallet."Amount"::numeric) AS balance
           FROM public."SW_TBL_WALLET" wallet
           WHERE wallet.owner_type='CUSTOMER'
             AND wallet.owner_msisdn=profile."MSISDN"
           GROUP BY upper(wallet.currency)
         ) grouped
       ) wallets ON true
       ORDER BY profile."Created_Date" DESC NULLS LAST,profile."MSISDN" DESC`,
      [...values, limit, offset],
    );
    return { data: rows, totalRecords: Number(countRows?.count || 0), page, limit };
  }

  async customer(customerId: string) {
    this.assertIdentifier(customerId);
    const [profile] = await this.dataSource.query(
      `SELECT profile."MSISDN"::text AS "customerId",
              concat_ws(' ',profile."First_Name",profile."Last_Name") AS name,
              profile."First_Name" AS "firstName",profile."Last_Name" AS "lastName",
              profile."Email" AS email,profile."ID_Number" AS "idNumber",
              profile."ID_Type" AS "idType",
              profile."KYC_Status" AS "kycStatus",profile."Status" AS status,
              profile."Gender" AS gender,profile."DOB" AS dob,profile."Address" AS address,
              profile."KYC_Case_ID" AS "kycCaseId",
              profile."KYC_Verified_Date" AS "kycVerifiedAt",
              profile."KYC_Verified_By" AS "kycVerifiedBy",
              EXISTS(
                SELECT 1 FROM public."SW_TBL_WALLET" required_wallet
                JOIN public."SW_TBL_WALLET_TYPE" required_type
                  ON required_type."Wallet_ID"=required_wallet."Wallet_Code"
                WHERE required_wallet.owner_type='CUSTOMER'
                  AND required_wallet.owner_msisdn=profile."MSISDN"
                  AND required_type."Is_Kyc_Needed"
              ) AS "kycRequired",
              EXISTS(
                SELECT 1 FROM kyc.cases linked_case
                WHERE linked_case.customer_msisdn=profile."MSISDN"
              ) AS "kycDataConnected",
              profile."Created_Date" AS "createdAt",
              scored.credit_score AS "creditScore",scored.customer_category AS category,
              scored.credit_limit AS "creditLimit",
              scored.current_credit_limit AS "availableLimit",
              scored.max_instalment AS "maxInstalment",
              scored.current_dpd AS "currentDpd",
              COALESCE(wallets.count,0)::int AS "walletCount",
              COALESCE(wallets.balance,0)::numeric AS "walletBalance",
              COALESCE(wallets.balances,'[]'::jsonb) AS "walletBalances"
       FROM public."SW_TBL_PROFILE_CUST" profile
       LEFT JOIN LATERAL (
         SELECT score.* FROM public.credit_scored_customers score
         WHERE score.profile_msisdn=profile."MSISDN"
         ORDER BY score.updated_at DESC,score._id DESC LIMIT 1
       ) scored ON true
       LEFT JOIN LATERAL (
         SELECT sum(grouped.count)::int AS count,
                sum(grouped.balance)::numeric AS balance,
                jsonb_agg(
                  jsonb_build_object(
                    'currency',grouped.currency,
                    'walletCount',grouped.count,
                    'balance',grouped.balance
                  ) ORDER BY grouped.currency
                ) AS balances
         FROM (
           SELECT upper(wallet.currency) AS currency,count(*)::int AS count,
                  sum(wallet."Amount"::numeric) AS balance
           FROM public."SW_TBL_WALLET" wallet
           WHERE wallet.owner_type='CUSTOMER'
             AND wallet.owner_msisdn=profile."MSISDN"
           GROUP BY upper(wallet.currency)
         ) grouped
       ) wallets ON true
       WHERE profile."MSISDN"=$1::bigint`,
      [customerId],
    );
    if (!profile) throw new NotFoundException('Customer profile was not found');
    const [wallets, decisions, openingRows, kycRows] = await Promise.all([
      this.dataSource.query(
        `SELECT wallet."Wallet_MSISDN"::text AS "walletId",
                wallet."Account_code"::text AS "accountCode",
                wallet."Wallet_Code" AS "walletCode",
                wallet.owner_msisdn::text AS "ownerMsisdn",
                wallet.owner_type AS "ownerType",
                type."Wallet_Name" AS "walletName",
                wallet."Amount"::numeric AS balance,wallet.currency,
                wallet."Status" AS status,
                wallet.is_default AS "isDefault",
                wallet.wallet_purpose AS purpose,
                wallet.iban,wallet.swift_bic AS "swiftBic",
                wallet."Created_Date" AS "createdAt"
         FROM public."SW_TBL_WALLET" wallet
         LEFT JOIN public."SW_TBL_WALLET_TYPE" type
           ON type."Wallet_ID"=wallet."Wallet_Code"
         WHERE wallet.owner_type='CUSTOMER'
           AND wallet.owner_msisdn=$1::bigint
         ORDER BY wallet.is_default DESC,wallet."Created_Date" DESC`,
        [customerId],
      ),
      this.dataSource.query(
        `SELECT id::text,application_id AS "applicationId",product_id AS "productId",
                outcome,final_limit AS "finalLimit",reason_code AS "reasonCode",
                created_at AS "createdAt"
         FROM public.credit_rule_executions
         WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 20`,
        [customerId],
      ).catch(() => []),
      this.dataSource.query(
        `SELECT request.id,request.status,request.wallet_code AS "walletCode",
                type."Wallet_Name" AS "walletName",request.currency,
                request.kyc_required AS "kycRequired",request.kyc_case_id AS "kycCaseId",
                request.wallet_msisdn::text AS "walletId",request.created_at AS "createdAt",
                request.completed_at AS "completedAt"
         FROM public.customer_account_opening_requests request
         LEFT JOIN public."SW_TBL_WALLET_TYPE" type ON type."Wallet_ID"=request.wallet_code
         WHERE request.customer_msisdn=$1::bigint`,
        [customerId],
      ).catch(() => []),
      this.dataSource.query(
        `SELECT cases.id,cases.status,cases.document_type AS "documentType",
                cases.issuing_country AS "issuingCountry",
                cases.system_recommendation AS "systemRecommendation",
                cases.face_match_score::numeric AS "faceMatchScore",
                cases.aml_match AS "amlMatch",
                cases.extracted_data-'rawText' AS "extractedData",
                cases.screening_summary AS "screeningSummary",
                cases.assigned_reviewer AS "assignedReviewer",
                cases.final_reason AS "finalReason",
                cases.created_by AS "createdBy",cases.reviewed_by AS "reviewedBy",
                cases.created_at AS "createdAt",cases.updated_at AS "updatedAt",
                cases.reviewed_at AS "reviewedAt",
                COALESCE(documents.count,0)::int AS "documentCount",
                COALESCE(documents.roles,'[]'::jsonb) AS "documentRoles"
         FROM kyc.cases cases
         LEFT JOIN LATERAL (
           SELECT count(*)::int AS count,
                  jsonb_agg(DISTINCT document_role) AS roles
           FROM kyc.documents
           WHERE case_id=cases.id AND deleted_at IS NULL
         ) documents ON true
         WHERE cases.customer_msisdn=$1::bigint
         ORDER BY cases.created_at DESC LIMIT 20`,
        [customerId],
      ).catch(() => []),
    ]);
    return {
      profile,
      wallets,
      decisions,
      accountOpening: openingRows[0] || null,
      latestKycCase: kycRows[0] || null,
      kycCases: kycRows,
    };
  }

  async changeCustomerStatus(
    customerId: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'CLOSED',
    reason: string,
    actor: string,
  ) {
    this.assertIdentifier(customerId);
    const states = { ACTIVE: 0, SUSPENDED: 1, BLOCKED: 2, CLOSED: 6 };
    if (!(status in states)) throw new BadRequestException('Unsupported customer status');
    if (!reason?.trim()) throw new BadRequestException('A reason is required');
    return this.dataSource.transaction(async manager => {
      const [profile] = await manager.query(
        `SELECT "Status" AS status FROM public."SW_TBL_PROFILE_CUST"
         WHERE "MSISDN"=$1::bigint FOR UPDATE`,
        [customerId],
      );
      if (!profile) throw new NotFoundException('Customer profile was not found');
      const nextStatus = states[status];
      await manager.query(
        `UPDATE public."SW_TBL_PROFILE_CUST"
         SET "Status"=$2,"Modified_By"=$3,"Modified_Date"=CURRENT_TIMESTAMP
         WHERE "MSISDN"=$1::bigint`,
        [customerId, nextStatus, actor],
      );
      await manager.query(
        `INSERT INTO public.customer_profile_operation_audit
          (customer_msisdn,operation,previous_state,new_state,reason,actor_id)
         VALUES($1::bigint,'STATUS_CHANGE',$2,$3,$4,$5)`,
        [customerId, JSON.stringify({ status: profile.status }), JSON.stringify({ status: nextStatus }), reason.trim(), actor],
      );
      return { customerId, status: nextStatus };
    });
  }

  async updateCustomer(
    customerId: string,
    body: Record<string, unknown>,
    actor: string,
  ) {
    this.assertIdentifier(customerId);
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const email = String(body.email || '').trim();
    const address = String(body.address || '').trim();
    if (!firstName) throw new BadRequestException('First name is required');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Email address is invalid');
    }
    return this.dataSource.transaction(async manager => {
      const [current] = await manager.query(
        `SELECT "First_Name" AS "firstName","Last_Name" AS "lastName",
                "Email" AS email,"Address" AS address,"KYC_Status" AS "kycStatus"
         FROM public."SW_TBL_PROFILE_CUST" WHERE "MSISDN"=$1::bigint FOR UPDATE`,
        [customerId],
      );
      if (!current) throw new NotFoundException('Customer profile was not found');
      if (body.kycStatus !== undefined && Number(body.kycStatus) !== Number(current.kycStatus)) {
        throw new BadRequestException('KYC status is managed by the KYC review workflow');
      }
      const next = {
        firstName,
        lastName: lastName || null,
        email: email || null,
        address: address || null,
        kycStatus: Number(current.kycStatus),
      };
      await manager.query(
        `UPDATE public."SW_TBL_PROFILE_CUST" SET
           "First_Name"=$2,"Last_Name"=$3,"Email"=$4,"Address"=$5,"KYC_Status"=$6,
           "Modified_By"=$7,"Modified_Date"=CURRENT_TIMESTAMP
         WHERE "MSISDN"=$1::bigint`,
        [customerId, next.firstName, next.lastName, next.email, next.address, next.kycStatus, actor],
      );
      await manager.query(
        `INSERT INTO public.customer_profile_operation_audit
          (customer_msisdn,operation,previous_state,new_state,reason,actor_id)
         VALUES($1::bigint,'PROFILE_UPDATE',$2,$3,'Profile edited in Finify Command',$4)`,
        [customerId, JSON.stringify(current), JSON.stringify(next), actor],
      );
      return { customerId, ...next };
    });
  }

  async transactions(query: Record<string, string>) {
    const page = this.positiveInteger(query.page, 1, 1, 100000);
    const limit = this.positiveInteger(query.limit, 50, 1, 200);
    const conditions = ['1=1'];
    const values: unknown[] = [];
    const add = (clause: string, value: unknown) => {
      values.push(value);
      conditions.push(clause.replace('?', `$${values.length}`));
    };
    const search = String(query.search || '').trim();
    if (search.length > 100) {
      throw new BadRequestException('Transaction search must not exceed 100 characters');
    }
    if (search) {
      values.push(search);
      const parameter = `$${values.length}`;
      conditions.push(
        `(request."Transaction_ID"::text LIKE ${parameter}||'%'
          OR request."Source_Wallet_ID"::text LIKE ${parameter}||'%'
          OR request."Dest_Wallet_ID"::text LIKE ${parameter}||'%'
          OR lower(COALESCE(request."Reference_ID",'')||' '||COALESCE(request."TRNID",''))
             LIKE '%'||lower(${parameter})||'%')`,
      );
    }
    if (query.status?.trim()) {
      const status = Number(query.status);
      if (!Number.isInteger(status) || status < 1 || status > 6) {
        throw new BadRequestException('Transaction status must be between 1 and 6');
      }
      add('request."Transaction_Status"=?::bigint', status);
    }
    if (query.keyword?.trim()) {
      add('upper(request."Keyword")=upper(?)', query.keyword.trim());
    }
    if (query.currency?.trim()) {
      const currency = query.currency.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) {
        throw new BadRequestException('Transaction currency must be a three-letter code');
      }
      add('upper(request."Currency")=?', currency);
    }
    if (query.dateFrom?.trim()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(query.dateFrom)) {
        throw new BadRequestException('Invalid transaction start date');
      }
      add('COALESCE(request."TransactionDate",request."Created_Date")>=?::date', query.dateFrom);
    }
    if (query.dateTo?.trim()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(query.dateTo)) {
        throw new BadRequestException('Invalid transaction end date');
      }
      add('COALESCE(request."TransactionDate",request."Created_Date")<?::date+1', query.dateTo);
    }
    const where = conditions.join(' AND ');
    const [countRow] = await this.dataSource.query(
      `SELECT count(*)::int AS count
       FROM public."SW_TBL_TRANSACTION_REQUEST" request
       WHERE ${where}`,
      values,
    );
    const offset = (page - 1) * limit;
    const rows = await this.dataSource.query(
      `SELECT request."Transaction_ID"::text AS "transactionId",
              request."TRNID" AS "transactionCode",
              request."Keyword" AS keyword,
              request."Source_Wallet_ID"::text AS "sourceWalletId",
              request."Dest_Wallet_ID"::text AS "destinationWalletId",
              request."Amount"::numeric AS amount,
              request."Currency" AS currency,
              request."Transaction_Fee"::numeric AS fee,
              request."Transaction_Comm"::numeric AS commission,
              request."Transaction_Status"::int AS "statusCode",
              CASE request."Transaction_Status"
                WHEN 1 THEN 'INITIATED'
                WHEN 2 THEN 'SUBMITTED'
                WHEN 3 THEN 'FAILED'
                WHEN 4 THEN 'RESERVED'
                WHEN 5 THEN 'COMPLETED'
                WHEN 6 THEN 'REVERSED'
                ELSE 'UNKNOWN'
              END AS status,
              request."Reference_ID" AS reference,
              request.remarks,
              COALESCE(request."TransactionDate",request."Created_Date") AS "transactionDate",
              journal.status AS "journalStatus",journal.mode AS "journalMode",
              aml.status AS "amlStatus"
       FROM public."SW_TBL_TRANSACTION_REQUEST" request
       LEFT JOIN LATERAL (
         SELECT row.status,row.mode
         FROM public.sw_tbl_accounting_journal row
         WHERE row.transactionid=request."Transaction_ID"
         ORDER BY row.id DESC LIMIT 1
       ) journal ON true
       LEFT JOIN public.sw_tbl_aml_transaction_reservation aml
         ON aml.transactionid=request."Transaction_ID"
       WHERE ${where}
       ORDER BY COALESCE(request."TransactionDate",request."Created_Date") DESC NULLS LAST,
                request."Transaction_ID" DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );
    return {
      data: rows,
      totalRecords: Number(countRow?.count || 0),
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(Number(countRow?.count || 0) / limit)),
    };
  }

  async transaction(transactionId: string) {
    if (!/^\d{8,24}$/.test(transactionId)) {
      throw new BadRequestException('Invalid transaction identifier');
    }
    const [transaction] = await this.dataSource.query(
      `SELECT request."Transaction_ID"::text AS "transactionId",
              request."TRNID" AS "transactionCode",request."Keyword" AS keyword,
              request."Source_Wallet_ID"::text AS "sourceWalletId",
              request."Dest_Wallet_ID"::text AS "destinationWalletId",
              request."Amount"::numeric AS amount,request."Currency" AS currency,
              request."Transaction_Fee"::numeric AS fee,
              request."Transaction_Comm"::numeric AS commission,
              request."Transaction_Status"::int AS "statusCode",
              CASE request."Transaction_Status"
                WHEN 1 THEN 'INITIATED' WHEN 2 THEN 'SUBMITTED'
                WHEN 3 THEN 'FAILED' WHEN 4 THEN 'RESERVED'
                WHEN 5 THEN 'COMPLETED' WHEN 6 THEN 'REVERSED'
                ELSE 'UNKNOWN'
              END AS status,
              request."Reference_ID" AS reference,request.remarks,
              request."Fee_Payer"::text AS "feePayer",
              request."Commission_Receiver"::text AS "commissionReceiver",
              request."Dest_Wallet_Fullname" AS "destinationName",
              request."Created_Date" AS "createdAt",
              request."TransactionDate" AS "transactionDate"
       FROM public."SW_TBL_TRANSACTION_REQUEST" request
       WHERE request."Transaction_ID"=$1::bigint`,
      [transactionId],
    );
    if (!transaction) throw new NotFoundException('Transaction was not found');
    const [details, journals, entries, amlRows, disputes, refundRows] = await Promise.all([
      this.dataSource.query(
        `SELECT "Row_ID"::text AS id,"Journal_ID"::text AS "journalId",
                "Transaction_Action" AS action,"Transaction_Leg" AS leg,
                "Type_Of_Transaction" AS type,"Amount"::numeric AS amount,
                "Source_Amount"::numeric AS "sourceAmount",
                "Dest_Amount"::numeric AS "destinationAmount",
                "Source_Wallet_ID"::text AS "sourceWalletId",
                "Dest_Wallet_ID"::text AS "destinationWalletId",
                "Source_Balance_After"::numeric AS "sourceBalanceAfter",
                "Dest_Balance_After"::numeric AS "destinationBalanceAfter",
                "Status" AS status
         FROM public."SW_TBL_TRANSACTION_DETAILS"
         WHERE "Transaction_ID"=$1::bigint ORDER BY "Row_ID"`,
        [transactionId],
      ),
      this.dataSource.query(
        `SELECT id::text,mode,action,leg,status,keyword,reference,currency,
                error_message AS "errorMessage",created_at AS "createdAt",
                completed_at AS "completedAt"
         FROM public.sw_tbl_accounting_journal
         WHERE transactionid=$1::bigint ORDER BY id`,
        [transactionId],
      ),
      this.dataSource.query(
        `SELECT id::text,journal_id::text AS "journalId",line_number AS "lineNumber",
                accountnumber::text AS "accountNumber",account_code AS "accountCode",
                "Debit"::numeric AS debit,"Credit"::numeric AS credit,currency,
                description,balance_before::numeric AS "balanceBefore",
                balance_after::numeric AS "balanceAfter",entrydate AS "entryDate"
         FROM public.sw_tbl_accounting_entry
         WHERE transactionid=$1::bigint ORDER BY journal_id,line_number`,
        [transactionId],
      ),
      this.dataSource.query(
        `SELECT wallet_msisdn::text AS "walletId",wallet_code AS "walletCode",
                keyword,amount::numeric,status,reserved_at AS "reservedAt",
                finalized_at AS "finalizedAt",last_error AS "lastError"
         FROM public.sw_tbl_aml_transaction_reservation
         WHERE transactionid=$1::bigint`,
        [transactionId],
      ),
      this.dataSource.query(
        `SELECT id::text,dispute_reference AS reference,reason,status,
                requested_by AS "requestedBy",created_at AS "createdAt",
                completed_at AS "completedAt"
         FROM public.sw_tbl_transaction_dispute
         WHERE transactionid=$1::bigint ORDER BY id DESC`,
        [transactionId],
      ),
      this.dataSource.query(
        `SELECT original_transaction_id::text AS "originalTransactionId",
                refund_transaction_id::text AS "refundTransactionId",
                refund_reference AS "refundReference",reason,
                requested_by AS "requestedBy",status,
                journal_id::text AS "journalId",created_at AS "createdAt",
                completed_at AS "completedAt"
         FROM public.sw_tbl_merchant_refund
         WHERE original_transaction_id=$1::bigint
            OR refund_transaction_id=$1::bigint
         LIMIT 1`,
        [transactionId],
      ),
    ]);
    return {
      transaction,
      details,
      journals,
      entries,
      aml: amlRows[0] || null,
      disputes,
      refund: refundRows[0] || null,
    };
  }

  listCharges() {
    return this.charges.listCharges();
  }

  getCharge(id: number) {
    return this.charges.getCharge(id);
  }

  createCharge(body: Record<string, unknown>, actor: string) {
    return this.charges.createCharge({ ...body, maker: actor } as never);
  }

  createChargeDetail(id: number, body: Record<string, unknown>, actor: string) {
    return this.charges.createDetail({ ...body, chargeId: id, maker: actor } as never);
  }

  approveCharge(id: number, actor: string) {
    return this.charges.approveCharge(id, actor);
  }

  deactivateCharge(id: number, actor: string) {
    return this.charges.deactivateCharge(id, actor);
  }

  listCommissions() {
    return this.commissions.listCommissions();
  }

  getCommission(id: number) {
    return this.commissions.getCommission(id);
  }

  createCommission(body: Record<string, unknown>, actor: string) {
    return this.commissions.createCommission({ ...body, maker: actor } as never);
  }

  createCommissionDetail(id: number, body: Record<string, unknown>, actor: string) {
    return this.commissions.createDetail({ ...body, commissionId: id, maker: actor } as never);
  }

  approveCommission(id: number, actor: string) {
    return this.commissions.approveCommission(id, actor);
  }

  deactivateCommission(id: number, actor: string) {
    return this.commissions.deactivateCommission(id, actor);
  }

  async amlCases(query: { status?: string; limit?: string }) {
    const limit = this.positiveInteger(query.limit, 100, 1, 200);
    const values: unknown[] = [];
    const where = query.status ? (values.push(query.status.toUpperCase()), 'WHERE status=$1') : '';
    values.push(limit);
    return this.dataSource.query(
      `SELECT id::text,reservation_id::text AS "reservationId",
              customer_msisdn::text AS "customerId",source_wallet::text AS "sourceWallet",
              reason_code AS "reasonCode",summary,risk_level AS "riskLevel",status,
              assigned_to AS "assignedTo",resolution,created_by AS "createdBy",
              created_at AS "createdAt",updated_at AS "updatedAt"
       FROM public.aml_cases ${where}
       ORDER BY CASE risk_level WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
                created_at DESC LIMIT $${values.length}`,
      values,
    );
  }

  async createAmlCase(body: Record<string, unknown>, actor: string) {
    if (!body.reasonCode || !body.summary) {
      throw new BadRequestException('reasonCode and summary are required');
    }
    const [row] = await this.dataSource.query(
      `INSERT INTO public.aml_cases(
         reservation_id,customer_msisdn,source_wallet,reason_code,summary,risk_level,
         status,assigned_to,created_by)
       VALUES($1::bigint,$2::bigint,$3::bigint,$4,$5,$6,'OPEN',$7,$8)
       RETURNING id::text,status,risk_level AS "riskLevel",created_at AS "createdAt"`,
      [
        body.reservationId || null, body.customerId || null, body.sourceWallet || null,
        String(body.reasonCode), String(body.summary),
        String(body.riskLevel || 'MEDIUM').toUpperCase(), body.assignedTo || null, actor,
      ],
    );
    return row;
  }

  async updateAmlCase(id: string, body: Record<string, unknown>, actor: string) {
    const status = String(body.status || '').toUpperCase();
    if (!['OPEN', 'IN_REVIEW', 'CLEARED', 'ESCALATED', 'CLOSED'].includes(status)) {
      throw new BadRequestException('A valid AML case status is required');
    }
    const resolved = ['CLEARED', 'CLOSED'].includes(status);
    const [row] = await this.dataSource.query(
      `UPDATE public.aml_cases SET status=$2,assigned_to=COALESCE($3,assigned_to),
         resolution=COALESCE($4,resolution),updated_at=CURRENT_TIMESTAMP,
         resolved_by=CASE WHEN $5 THEN $6 ELSE resolved_by END,
         resolved_at=CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE resolved_at END
       WHERE id=$1::bigint
       RETURNING id::text,status,assigned_to AS "assignedTo",resolution,updated_at AS "updatedAt"`,
      [id, status, body.assignedTo || null, body.resolution || null, resolved, actor],
    );
    if (!row) throw new NotFoundException('AML case was not found');
    return row;
  }

  async amlActivity(query: { page?: string; limit?: string; status?: string; search?: string }) {
    const page = this.positiveInteger(query.page, 1, 1, 100000);
    const limit = this.positiveInteger(query.limit, 25, 1, 200);
    const conditions = ['1=1'];
    const values: unknown[] = [];
    const add = (clause: string, value: unknown) => {
      values.push(value);
      conditions.push(clause.replace('?', `$${values.length}`));
    };
    if (query.status?.trim()) add('reservation.status=?', query.status.trim().toUpperCase());
    if (query.search?.trim()) {
      add(
        `(reservation.transactionid::text ILIKE '%'||?||'%' OR
          reservation.wallet_msisdn::text ILIKE '%'||$${values.length + 1}||'%')`,
        query.search.trim(),
      );
    }
    const where = conditions.join(' AND ');
    const [count] = await this.dataSource.query(
      `SELECT count(*)::int AS count FROM public.sw_tbl_aml_transaction_reservation reservation WHERE ${where}`,
      values,
    );
    const offset = (page - 1) * limit;
    const rows = await this.dataSource.query(
      `SELECT reservation.transactionid::text AS id,reservation.transactionid::text AS "transactionId",
              reservation.wallet_msisdn::text AS "sourceWallet",
              reservation.wallet_code AS "walletCode",reservation.keyword,
              reservation.amount::numeric,reservation.status,
              reservation.reserved_at AS "createdAt",reservation.finalized_at AS "updatedAt",
              aml_case.id::text AS "caseId",aml_case.status AS "caseStatus",
              aml_case.risk_level AS "riskLevel"
       FROM public.sw_tbl_aml_transaction_reservation reservation
       LEFT JOIN public.aml_cases aml_case ON aml_case.reservation_id=reservation.transactionid
       WHERE ${where}
       ORDER BY reservation.reserved_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );
    return { data: rows, totalRecords: Number(count?.count || 0), page, limit };
  }

  async proxy(
    upstream: Upstream,
    path: string,
    method: string,
    query: Record<string, unknown>,
    body: unknown,
    actor: string,
  ) {
    const cleanPath = path.replace(/^\/+/, '');
    if (cleanPath.includes('..')) throw new BadRequestException('Invalid integration path');
    const base = upstream === 'credit'
      ? this.config.get<string>('CREDIT_RULE_SERVICE_URL') || 'http://127.0.0.1:5005'
      : upstream === 'accounting'
        ? this.config.get<string>('ACCOUNTING_SERVICE_URL') || 'http://127.0.0.1:5004'
        : this.config.get<string>('KYC_SERVICE_URL') || 'http://127.0.0.1:5006';
    const url = new URL(cleanPath, `${base.replace(/\/+$/, '')}/`);
    Object.entries(query || {}).forEach(([key, value]) => {
      if (Array.isArray(value)) value.forEach(item => url.searchParams.append(key, String(item)));
      else if (value !== undefined) url.searchParams.set(key, String(value));
    });
    const headers: Record<string, string> = { accept: 'application/json' };
    if (upstream === 'credit') {
      const key = this.config.get<string>('CREDIT_RULE_ADMIN_API_KEY');
      if (key) headers['x-api-key'] = key;
      headers['x-actor-id'] = actor;
    } else if (upstream === 'accounting') {
      const key = this.config.get<string>('ACCOUNTING_ADMIN_API_KEY');
      if (key) headers['x-admin-api-key'] = key;
    } else {
      const key = this.config.get<string>('KYC_ADMIN_API_KEY');
      if (key) headers['x-admin-api-key'] = key;
      headers['x-actor-id'] = actor;
    }
    const hasBody = !['GET', 'HEAD'].includes(method.toUpperCase()) && body !== undefined;
    if (hasBody) headers['content-type'] = 'application/json';
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: hasBody ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(upstream === 'kyc' ? 120000 : 30000),
      });
    } catch {
      throw new HttpException(`${upstream} service is unavailable`, 503);
    }
    const text = await response.text();
    let payload: unknown = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text }; }
    if (!response.ok) throw new HttpException(payload, response.status);
    return payload;
  }

  async proxyKycDocument(
    caseId: string,
    role: string,
    file: Express.Multer.File | undefined,
    actor: string,
  ) {
    if (!/^[0-9a-f-]{36}$/i.test(caseId)) throw new BadRequestException('Invalid KYC identifier');
    if (!file) throw new BadRequestException('Document file is required');
    if (!['ID_FRONT', 'ID_BACK', 'PASSPORT', 'SELFIE'].includes(role)) {
      throw new BadRequestException('Unsupported KYC document role');
    }
    const base = this.config.get<string>('KYC_SERVICE_URL') || 'http://127.0.0.1:5006';
    const form = new FormData();
    form.set('role', role);
    form.set(
      'file',
      new Blob([Uint8Array.from(file.buffer)], { type: file.mimetype }),
      file.originalname,
    );
    const headers: Record<string, string> = { accept: 'application/json', 'x-actor-id': actor };
    const key = this.config.get<string>('KYC_ADMIN_API_KEY');
    if (key) headers['x-admin-api-key'] = key;
    let response: Response;
    try {
      response = await fetch(`${base.replace(/\/+$/, '')}/cases/${caseId}/documents`, {
        method: 'POST',
        headers,
        body: form,
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new HttpException('kyc service is unavailable', 503);
    }
    const text = await response.text();
    let payload: unknown = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text }; }
    if (!response.ok) throw new HttpException(payload, response.status);
    return payload;
  }

  async proxyKycSanctionFile(
    file: Express.Multer.File | undefined,
    listName: string,
    mode: string,
    actor: string,
  ) {
    if (!file) throw new BadRequestException('CSV file is required');
    const base = this.config.get<string>('KYC_SERVICE_URL') || 'http://127.0.0.1:5006';
    const form = new FormData();
    form.set('listName', String(listName || ''));
    form.set('mode', String(mode || 'REPLACE'));
    form.set(
      'file',
      new Blob([Uint8Array.from(file.buffer)], { type: file.mimetype || 'text/csv' }),
      file.originalname,
    );
    const headers: Record<string, string> = { accept: 'application/json', 'x-actor-id': actor };
    const key = this.config.get<string>('KYC_ADMIN_API_KEY');
    if (key) headers['x-admin-api-key'] = key;
    let response: Response;
    try {
      response = await fetch(`${base.replace(/\/+$/, '')}/sanctions/upload`, {
        method: 'POST',
        headers,
        body: form,
        signal: AbortSignal.timeout(120000),
      });
    } catch {
      throw new HttpException('kyc service is unavailable', 503);
    }
    const text = await response.text();
    let payload: unknown = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text }; }
    if (!response.ok) throw new HttpException(payload, response.status);
    return payload;
  }

  private positiveInteger(value: string | undefined, fallback: number, min: number, max: number) {
    const parsed = value ? Number(value) : fallback;
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw new BadRequestException(`Value must be an integer between ${min} and ${max}`);
    }
    return parsed;
  }

  private firstReturnedRow(result: any) {
    if (!Array.isArray(result)) return undefined;
    return Array.isArray(result[0]) ? result[0][0] : result[0];
  }

  private assertIdentifier(value: string) {
    if (!/^[0-9]{8,20}$/.test(value)) throw new BadRequestException('Invalid customer identifier');
  }

  private async checkHttp(
    id: string,
    label: string,
    detail: string,
    category: string,
    url: string,
    headers: Record<string, string> = {},
    includeMetadata = true,
  ) {
    const started = Date.now();
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(3500),
      });
      const text = await response.text();
      let payload: any = null;
      try { payload = text ? JSON.parse(text) : null; } catch {}
      const operational = response.ok;
      return {
        id,
        label,
        detail,
        category,
        state: operational ? 'operational' : 'degraded',
        latency: Date.now() - started,
        message: operational
          ? String(payload?.status || 'HTTP endpoint responding')
          : String(payload?.message || payload?.status || `HTTP ${response.status}`),
        metadata: includeMetadata && payload && typeof payload === 'object' ? payload : undefined,
      };
    } catch (error) {
      return {
        id,
        label,
        detail,
        category,
        state: 'degraded',
        latency: Date.now() - started,
        message: error instanceof Error ? error.message : 'Service unavailable',
      };
    }
  }

  private async checkDatabase() {
    const started = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return {
        id: 'postgres',
        label: 'PostgreSQL',
        detail: 'Primary operational data store',
        category: 'DEPENDENCY',
        state: 'operational',
        latency: Date.now() - started,
        message: 'Database query succeeded',
      };
    } catch (error) {
      return {
        id: 'postgres',
        label: 'PostgreSQL',
        detail: 'Primary operational data store',
        category: 'DEPENDENCY',
        state: 'degraded',
        latency: Date.now() - started,
        message: error instanceof Error ? error.message : 'Database unavailable',
      };
    }
  }

  private async checkRedis() {
    const started = Date.now();
    try {
      const response = await this.cache.getClient().ping();
      return {
        id: 'redis',
        label: 'Redis',
        detail: 'Configuration cache and coordination',
        category: 'DEPENDENCY',
        state: response === 'PONG' ? 'operational' : 'degraded',
        latency: Date.now() - started,
        message: response === 'PONG' ? 'Cache ping succeeded' : `Unexpected ping response: ${response}`,
      };
    } catch (error) {
      return {
        id: 'redis',
        label: 'Redis',
        detail: 'Configuration cache and coordination',
        category: 'DEPENDENCY',
        state: 'degraded',
        latency: Date.now() - started,
        message: error instanceof Error ? error.message : 'Cache unavailable',
      };
    }
  }

  private async checkKafka() {
    const started = Date.now();
    const configured = this.config.get<string>('KAFKA_BROKERS') || '127.0.0.1:9092';
    let broker = configured;
    try {
      if (process.env.IS_CRD_PLAIN !== 'true') broker = decrypt(configured);
    } catch {}
    const firstBroker = String(broker).split(',')[0].trim();
    const separator = firstBroker.lastIndexOf(':');
    const host = separator > 0 ? firstBroker.slice(0, separator) : firstBroker;
    const port = separator > 0 ? Number(firstBroker.slice(separator + 1)) : 9092;
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = connect({ host, port });
        const timeout = setTimeout(() => {
          socket.destroy();
          reject(new Error('Kafka connection timed out'));
        }, 3500);
        socket.once('connect', () => {
          clearTimeout(timeout);
          socket.end();
          resolve();
        });
        socket.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      return {
        id: 'kafka',
        label: 'Kafka',
        detail: 'Transaction event streaming',
        category: 'DEPENDENCY',
        state: 'operational',
        latency: Date.now() - started,
        message: 'Broker connection succeeded',
      };
    } catch (error) {
      return {
        id: 'kafka',
        label: 'Kafka',
        detail: 'Transaction event streaming',
        category: 'DEPENDENCY',
        state: 'degraded',
        latency: Date.now() - started,
        message: error instanceof Error ? error.message : 'Broker unavailable',
      };
    }
  }
}
