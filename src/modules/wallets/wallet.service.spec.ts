import { ConflictException } from '@nestjs/common';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  it('creates an additional customer wallet with zero balance and audit history', async () => {
    const queries: string[] = [];
    const manager = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('SW_TBL_PROFILE_CUST')) return [{ MSISDN: '447700900123', status: 0 }];
        if (sql.includes('SW_TBL_WALLET_TYPE')) return [{ Wallet_ID: 215, Wallet_Name: 'saving', Wallet_Type: 100 }];
        if (sql.includes('already has')) return [];
        if (sql.includes(`"Wallet_Code"=$2`) && sql.includes(`"Status"<>6`)) return [];
        if (sql.includes(`wallet_purpose='CUSTOMER_MAIN'`)) return [{ Wallet_MSISDN: '447700900123' }];
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
});
