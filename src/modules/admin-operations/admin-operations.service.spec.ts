import { AdminOperationsService } from './admin-operations.service';

describe('AdminOperationsService system pulse', () => {
  it('summarizes every application and dependency independently', async () => {
    const service = new AdminOperationsService(
      { query: jest.fn().mockResolvedValue([{ database_key_configured: false, model: 'gpt-5.6-sol' }]) } as any,
      {
        get: jest.fn((key: string) => ({
          CREDIT_RULE_SERVICE_URL: 'http://credit',
          ACCOUNTING_SERVICE_URL: 'http://accounting',
          CONSUMER_SERVICE_URL: 'http://consumer',
          ADMIN_UI_SERVICE_URL: 'http://admin-ui',
          PORTAL_UI_SERVICE_URL: 'http://portal-ui',
          KYC_SERVICE_URL: 'http://kyc',
          KYC_OCR_SERVICE_URL: 'http://kyc-ocr',
          KONG_STATUS_URL: 'http://kong:8100/status',
        })[key]),
      } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(service as any, 'checkHttp').mockImplementation(
      async (id: string, label: string, detail: string, category: string) => ({
        id,
        label,
        detail,
        category,
        state: id === 'consumer' ? 'degraded' : 'operational',
        latency: 4,
        message: id === 'consumer' ? 'Kafka group disconnected' : 'ok',
      }),
    );
    jest.spyOn(service as any, 'checkDatabase').mockResolvedValue({
      id: 'postgres', label: 'PostgreSQL', detail: 'database', category: 'DEPENDENCY',
      state: 'operational', latency: 1, message: 'ok',
    });
    jest.spyOn(service as any, 'checkRedis').mockResolvedValue({
      id: 'redis', label: 'Redis', detail: 'cache', category: 'DEPENDENCY',
      state: 'operational', latency: 1, message: 'ok',
    });
    jest.spyOn(service as any, 'checkKafka').mockResolvedValue({
      id: 'kafka', label: 'Kafka', detail: 'events', category: 'DEPENDENCY',
      state: 'operational', latency: 1, message: 'ok',
    });

    await expect(service.systemPulse()).resolves.toMatchObject({
      status: 'degraded',
      summary: { total: 15, operational: 13, degraded: 2 },
      services: expect.arrayContaining([
        expect.objectContaining({ id: 'producer', state: 'operational' }),
        expect.objectContaining({ id: 'kong', state: 'operational' }),
        expect.objectContaining({ id: 'portal-ui', state: 'operational' }),
        expect.objectContaining({ id: 'consumer', state: 'degraded' }),
        expect.objectContaining({ id: 'mock-merchant', state: 'operational' }),
        expect.objectContaining({ id: 'kyc', state: 'operational' }),
        expect.objectContaining({ id: 'kyc-ocr', state: 'operational' }),
        expect.objectContaining({ id: 'postgres', state: 'operational' }),
        expect.objectContaining({ id: 'redis', state: 'operational' }),
        expect.objectContaining({ id: 'kafka', state: 'operational' }),
        expect.objectContaining({ id: 'minio', state: 'operational' }),
      ]),
    });
  });

  it('returns real command-center totals and sums the visible approval queues', async () => {
    const dataSource = {
      query: jest.fn()
        .mockResolvedValueOnce([{
          customerWallets: 103,
          activeCustomerWallets: 103,
          scoredProfiles: 103,
          scoreRecords: 103,
          creditPolicies: 4,
          activeCreditPolicies: 2,
          referenceDataReviews: 3,
          pricingReviews: 1,
          treasuryFundingReviews: 2,
        }])
        .mockResolvedValueOnce([
          { ownerType: 'CUSTOMER', currency: 'UGX', walletCount: 103, balance: '17290.00' },
          { ownerType: 'MERCHANT', currency: 'UGX', walletCount: 2, balance: '500.00' },
        ])
        .mockResolvedValueOnce([
          { walletId: '9800000110', walletCode: 110, walletName: 'Safeguarding', purpose: 'SAFEGUARDING', balance: '1000000.00', currency: 'USD', status: 0 },
        ]),
    };
    const service = new AdminOperationsService(
      dataSource as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.commandCenterMetrics()).resolves.toMatchObject({
      customerWallets: {
        total: 103,
        active: 103,
        balances: [{ currency: 'UGX', walletCount: 103, balance: '17290.00' }],
      },
      merchantWallets: {
        balances: [{ currency: 'UGX', walletCount: 2, balance: '500.00' }],
      },
      systemWallets: [
        expect.objectContaining({ walletCode: 110, currency: 'USD', balance: '1000000.00' }),
      ],
      scoredProfiles: { total: 103, scoreRecords: 103, linkedBy: 'MSISDN' },
      creditPolicies: { total: 4, active: 2 },
      pendingReviews: {
        total: 6,
        referenceData: 3,
        pricingFlows: 1,
        treasuryFunding: 2,
      },
    });
  });

  it('uses bounded server pagination and prefix search for a large customer registry', async () => {
    const dataSource = {
      query: jest.fn()
        .mockResolvedValueOnce([{ count: 1_000_000 }])
        .mockResolvedValueOnce([]),
    };
    const service = new AdminOperationsService(
      dataSource as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.customers({
      page: '2',
      limit: '50',
      search: '2567',
    })).resolves.toMatchObject({
      totalRecords: 1_000_000,
      page: 2,
      limit: 50,
      data: [],
    });
    expect(dataSource.query.mock.calls[0][0]).toContain(
      `profile."MSISDN"::text LIKE $1||'%'`,
    );
    expect(dataSource.query.mock.calls[0][0]).not.toContain('LEFT JOIN LATERAL');
    expect(dataSource.query.mock.calls[1][0]).toContain('WITH page_profiles AS');
    expect(dataSource.query.mock.calls[1][1]).toEqual(['2567', 50, 50]);
  });

  it('applies an approved treasury request once and writes the wallet audit', async () => {
    const manager = {
      query: jest.fn()
        .mockResolvedValueOnce([{
          id: 7,
          funding_type: 'SAFEGUARDING',
          wallet_msisdn: '9800001110',
          amount: '25.00',
          currency: 'GBP',
          reference: 'TEST-FUND-7',
          direction: 'CREDIT',
          bank_name: 'Test Bank',
          bank_account: 'TEST-ACCOUNT',
          value_date: '2026-07-30',
          evidence_reference: 'TEST-EVIDENCE',
          business_purpose: 'SAFEGUARDING_FUNDING',
          status: 'PENDING',
          maker_id: 'maker',
          maker_comment: 'Development test funding',
        }])
        .mockResolvedValueOnce([{
          walletId: '9800001110',
          ownerMsisdn: '9800001110',
          walletCode: 110,
          balance: '100.00',
          currency: 'GBP',
          status: 0,
          purpose: 'SYSTEM',
        }])
        .mockResolvedValueOnce([[{
          walletId: '9800001110',
          balance: '125.00',
          currency: 'GBP',
        }], 1])
        .mockResolvedValueOnce([{
          walletId: '9800001115',
          balance: '0.00',
        }])
        .mockResolvedValueOnce([[{
          balance: '25.00',
        }], 1])
        .mockResolvedValueOnce([{
          id: '41',
        }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const dataSource = {
      transaction: jest.fn((callback: (value: typeof manager) => unknown) => callback(manager)),
    };
    const service = new AdminOperationsService(
      dataSource as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.reviewTreasuryFunding('7', 'approve', 'Approved', 'checker'),
    ).resolves.toMatchObject({
      id: '7',
      status: 'APPROVED',
      amount: '25.00',
      wallet: { balance: '125.00' },
      accountingJournalId: '41',
      checker: 'checker',
    });
    expect(manager.query).toHaveBeenCalledTimes(9);
    expect(manager.query.mock.calls[2][1][3]).toBe('CREDIT');
    expect(manager.query.mock.calls[8][1][7]).toBe('TREASURY_FUNDING');
  });

  it('classifies a charge collection withdrawal as gross profit', async () => {
    const manager = {
      query: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          walletId: '9800001113',
          walletCode: 113,
        }])
        .mockResolvedValueOnce([{
          id: '9',
          fundingType: 'CHARGE_REVENUE',
          direction: 'DEBIT',
          businessPurpose: 'GROSS_PROFIT_WITHDRAWAL',
          status: 'PENDING',
        }]),
    };
    const dataSource = {
      transaction: jest.fn((callback: (value: typeof manager) => unknown) => callback(manager)),
    };
    const service = new AdminOperationsService(
      dataSource as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.createTreasuryFunding({
      operation: 'WITHDRAW_CHARGE_REVENUE',
      currency: 'UGX',
      amount: '20.00',
      reference: 'BANK-PROFIT-0009',
      bankName: 'Test Bank',
      bankAccount: 'TEST-IBAN-9',
      valueDate: '2026-07-30',
      evidenceReference: 'BANK-STATEMENT-9',
      comment: 'Withdraw realized gross profit',
    }, 'maker')).resolves.toMatchObject({
      id: '9',
      direction: 'DEBIT',
      businessPurpose: 'GROSS_PROFIT_WITHDRAWAL',
    });
    expect(manager.query.mock.calls[1][1]).toEqual([113, 'UGX']);
    expect(manager.query.mock.calls[2][1]).toEqual([
      'CHARGE_REVENUE',
      '9800001113',
      113,
      'UGX',
      '20.00',
      'BANK-PROFIT-0009',
      'maker',
      'Withdraw realized gross profit',
      'DEBIT',
      'Test Bank',
      'TEST-IBAN-9',
      '2026-07-30',
      'BANK-STATEMENT-9',
      'GROSS_PROFIT_WITHDRAWAL',
    ]);
  });

  it('rejects a treasury withdrawal when the wallet balance is insufficient', async () => {
    const manager = {
      query: jest.fn()
        .mockResolvedValueOnce([{
          id: 8,
          funding_type: 'CHARGE_REVENUE',
          wallet_msisdn: '9800001113',
          amount: '125.00',
          reference: 'TEST-WITHDRAW-8',
          direction: 'DEBIT',
          business_purpose: 'GROSS_PROFIT_WITHDRAWAL',
          status: 'PENDING',
          maker_id: 'maker',
          maker_comment: 'Gross profit bank withdrawal',
        }])
        .mockResolvedValueOnce([{
          walletId: '9800001113',
          ownerMsisdn: '9800001113',
          walletCode: 113,
          balance: '100.00',
          currency: 'UGX',
          status: 0,
          purpose: 'SYSTEM',
        }]),
    };
    const dataSource = {
      transaction: jest.fn((callback: (value: typeof manager) => unknown) => callback(manager)),
    };
    const service = new AdminOperationsService(
      dataSource as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.reviewTreasuryFunding('8', 'approve', 'Approved', 'checker'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'Insufficient charge revenue balance',
      }),
    });
    expect(manager.query).toHaveBeenCalledTimes(2);
  });
});
