import { CommissionService } from './commission.service';

describe('CommissionService', () => {
  const repository = (overrides: Record<string, unknown> = {}) => ({
    find: jest.fn(),
    findOne: jest.fn(),
    ...overrides,
  }) as any;

  const createService = (options: { receiver: 'S' | 'D'; amountType: 'Flat' | 'Perc' }) => {
    const commission = repository({
      findOne: jest.fn().mockResolvedValue({
        commissionId: 1,
        commissionType: options.amountType === 'Flat' ? 0 : 1,
        expiryOn: null,
        defaultCommissionId: null,
        approvedBy: 'checker',
      }),
    });
    const details = repository({
      find: jest.fn().mockResolvedValue([{
        rowId: 10,
        commissionId: 1,
        commissionType: options.amountType,
        commissionValue: options.amountType === 'Flat' ? '5' : '0.5',
        startRange: '0',
        endRange: '100000',
        minCommission: '5',
        maxCommission: '50',
      }]),
    });
    const mappings = repository({
      find: jest.fn().mockResolvedValue([{ keywordCommissionId: 1, status: 1 }]),
    });
    const keywordCommissions = repository({
      find: jest.fn().mockResolvedValue([{
        rowId: 1,
        keywordCommissionId: 1,
        keyword: 'PMNT',
        commissionId: 1,
        walletId: 1,
        receiver: options.receiver,
        status: 1,
      }]),
    });
    const wallets = repository({
      find: jest.fn().mockResolvedValue([{ walletMsisdn: '9800000114', walletCode: 114 }]),
    });
    const walletTypes = repository({
      findOne: jest.fn().mockResolvedValue({ walletId: 114, walletName: 'Commission Wallet', walletDetails: 'Commission_Wallet' }),
    });
    const cache = { get: jest.fn().mockResolvedValue(null), setEx: jest.fn(), del: jest.fn() };
    return new CommissionService(commission, details, mappings, keywordCommissions, wallets, walletTypes, cache);
  };

  it('credits a fixed commission to the source and debits wallet 114', async () => {
    const result = await createService({ receiver: 'S', amountType: 'Flat' }).calculate({
      transactionId: 'TX-1', keyword: 'PMNT', walletId: 1, amount: '1000',
    });

    expect(result.commissionAmount).toBe('5.00');
    expect(result.sourceCommissionCredit).toBe('5.00');
    expect(result.destinationCommissionCredit).toBe('0.00');
    expect(result.commissionWallet).toMatchObject({ walletCode: 114, debitAmount: '5.00' });
  });

  it('caps a percentage commission and credits the destination', async () => {
    const result = await createService({ receiver: 'D', amountType: 'Perc' }).calculate({
      transactionId: 'TX-2', keyword: 'PMNT', walletId: 1, amount: '20000',
    });

    expect(result.commissionAmount).toBe('50.00');
    expect(result.sourceCommissionCredit).toBe('0.00');
    expect(result.destinationCommissionCredit).toBe('50.00');
    expect(result.commissionWallet.debitAmount).toBe('50.00');
  });
});
