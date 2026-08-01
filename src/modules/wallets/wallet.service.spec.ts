import { ConflictException, ForbiddenException } from '@nestjs/common';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  it('creates an additional customer wallet with zero balance and audit history', async () => {
    const queries: string[] = [];
    const manager = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('SW_TBL_PROFILE_CUST')) return [{ MSISDN: '447700900123', status: 0 }];
        if (sql.includes('sw_tbl_accounting_configuration')) return [{ exists: 1 }];
        if (sql.includes('FROM public."SW_TBL_WALLET_TYPE"')) return [{ Wallet_ID: 215, Wallet_Name: 'saving', Wallet_Type: 100 }];
        if (sql.includes('already has')) return [];
        if (sql.includes(`"Wallet_Code"=$2`) && sql.includes(`"Status"<>6`)) return [];
        if (sql.includes(`wallet_purpose='CUSTOMER_MAIN'`)) return [{ walletId: '447700900123' }];
        if (sql.includes(`type."Wallet_Type"=100`)) return [{ walletId: '447700900123' }];
        if (sql.includes('INSERT INTO public."SW_TBL_WALLET"')) {
          return [{ walletId: '990000000001', accountCode: 'uuid', walletCode: 215,
            balance: '0', currency: 'GBP', status: 0, isDefault: false, purpose: 'CUSTOMER_ADDITIONAL' }];
        }
        return [];
      }),
    };
    const dataSource = { transaction: (work: any) => work(manager) } as any;
    const result = await new WalletService(dataSource).createAdditional(
      '447700900123', { walletCode: 215, currency: 'GBP' },
    );
    expect(result.walletId).toBe('990000000001');
    expect(queries.some(sql => sql.includes('sw_tbl_wallet_operation_audit'))).toBe(true);
  });

  it('does not allow the customer main wallet to be closed', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => sql.includes('FOR UPDATE')
        ? [{ walletId: '447700900123', ownerMsisdn: '447700900123', status: 0,
          isDefault: false, currency: 'GBP', purpose: 'CUSTOMER_MAIN' }]
        : []),
    };
    const service = new WalletService({ transaction: (work: any) => work(manager) } as any);
    await expect(service.changeStatus('447700900123',
      { status: 'CLOSED', reason: 'test' }, 'admin')).rejects.toBeInstanceOf(ConflictException);
  });

  it('withholds a default wallet when its wallet type requires KYC', async () => {
    const queries: string[] = [];
    const manager = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('FROM public."SW_TBL_PROFILE_CUST"') && sql.includes('FOR UPDATE')) return [];
        if (sql.includes('sw_tbl_accounting_configuration')) return [{ exists: 1 }];
        if (sql.includes('FROM public."SW_TBL_WALLET_TYPE"')) {
          return [{ walletCode: 215, walletName: 'Verified account', isKycNeeded: true }];
        }
        if (sql.includes('WHERE "Wallet_MSISDN"=$1')) return [];
        if (sql.includes('FROM kyc.cases')) return [];
        if (sql.includes('customer_account_opening_requests')) {
          return [{ id: 'opening-id', status: 'PENDING_KYC', walletCode: 215,
            currency: 'GBP', kycRequired: true }];
        }
        return [];
      }),
    };
    const service = new WalletService({ transaction: (work: any) => work(manager) } as any);
    const result = await service.createCustomer({
      msisdn: '447700900124', firstName: 'Kyc', defaultCurrency: 'GBP', walletCode: 215,
    }, 'maker');
    expect(result.wallet).toBeNull();
    expect(result.accountOpening.status).toBe('PENDING_KYC');
    expect(queries.some(sql => sql.includes('INSERT INTO public."SW_TBL_WALLET"'))).toBe(false);
  });

  it('blocks an additional KYC wallet until the customer has an approved case', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SW_TBL_PROFILE_CUST')) return [{ MSISDN: '447700900123', status: 0 }];
        if (sql.includes('sw_tbl_accounting_configuration')) return [{ exists: 1 }];
        if (sql.includes('FROM public."SW_TBL_WALLET_TYPE"')) {
          return [{ Wallet_ID: 215, Wallet_Name: 'Verified account', Wallet_Type: 100, isKycNeeded: true }];
        }
        if (sql.includes('FROM kyc.cases')) return [];
        return [];
      }),
    };
    const service = new WalletService({ transaction: (work: any) => work(manager) } as any);
    await expect(service.createAdditional('447700900123', {
      walletCode: 215, currency: 'GBP',
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('completes a pending account opening after approved KYC', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM public."SW_TBL_PROFILE_CUST"') && sql.includes('FOR UPDATE')) {
          return [{ customerId: '447700900125', firstName: 'Approved', kycStatus: 1, status: 0 }];
        }
        if (sql.includes('FROM public.customer_account_opening_requests') && sql.includes('FOR UPDATE')) {
          return [{ id: '03400000-0000-4000-8000-000000000002', walletCode: 215,
            currency: 'GBP', iban: null, swiftBic: null, kycRequired: true, status: 'READY_TO_OPEN' }];
        }
        if (sql.includes('FROM public."SW_TBL_WALLET_TYPE"')) {
          return [{ walletName: 'Verified account', isKycNeeded: true }];
        }
        if (sql.includes('FROM kyc.cases')) return [{ id: '03400000-0000-4000-8000-000000000003' }];
        if (sql.includes('sw_tbl_accounting_configuration')) return [{ exists: 1 }];
        if (sql.includes('WHERE "Wallet_MSISDN"=$1')) return [];
        if (sql.includes('INSERT INTO public."SW_TBL_WALLET"')) {
          return [{ walletId: '447700900125', walletCode: 215, currency: 'GBP', balance: '0', status: 0 }];
        }
        return [];
      }),
    };
    const service = new WalletService({ transaction: (work: any) => work(manager) } as any);
    await expect(service.completeCustomerAccountOpening('447700900125', 'checker'))
      .resolves.toMatchObject({ wallet: { walletId: '447700900125' } });
  });

  it('normalizes nested UPDATE RETURNING results for wallet routing', async () => {
    const manager = {
      query: jest.fn()
        .mockResolvedValueOnce([{
          walletId: '447700900123',
          ownerMsisdn: '447700900123',
          currency: 'GBP',
          iban: null,
          swiftBic: null,
          status: 0,
        }])
        .mockResolvedValueOnce([[{
          walletId: '447700900123',
          ownerMsisdn: '447700900123',
          currency: 'GBP',
          iban: 'GB82WEST12345698765432',
          swiftBic: 'NWBKGB2L',
        }], 1])
        .mockResolvedValueOnce([]),
    };
    const service = new WalletService({
      query: jest.fn().mockResolvedValue([{ ownerMsisdn: '447700900123' }]),
      transaction: (work: any) => work(manager),
    } as any);
    await expect(service.updateRoutingForAdmin('447700900123', {
      iban: 'GB82 WEST 1234 5698 7654 32',
      swiftBic: 'NWBKGB2L',
    }, 'admin')).resolves.toMatchObject({
      walletId: '447700900123',
      iban: 'GB82WEST12345698765432',
      swiftBic: 'NWBKGB2L',
    });
  });
});
