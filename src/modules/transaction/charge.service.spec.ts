import { ChargeService } from './charge.service';

const repository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(value => value),
  exists: jest.fn(),
  delete: jest.fn(),
});

describe('ChargeService', () => {
  const charges = repository();
  const details = repository();
  const mappings = repository();
  const keywordCharges = repository();
  const wallets = repository();
  const walletTypes = repository();
  const cacheData = new Map<string, string>();
  const cache = {
    get: jest.fn((key: string) => Promise.resolve(cacheData.get(key) || null)),
    setEx: jest.fn((key: string, _ttl: number, value: string) => { cacheData.set(key, value); return Promise.resolve('OK'); }),
    del: jest.fn((key: string) => { cacheData.delete(key); return Promise.resolve(1); }),
    delByPattern: jest.fn((pattern: string) => {
      const prefix = pattern.replace('*', '');
      for (const key of [...cacheData.keys()]) if (key.startsWith(prefix)) cacheData.delete(key);
      return Promise.resolve(1);
    }),
  };
  const service = new ChargeService(charges as any, details as any, mappings as any, keywordCharges as any, wallets as any, walletTypes as any, cache as any);

  beforeEach(() => {
    jest.clearAllMocks();
    cacheData.clear();
    wallets.find.mockResolvedValue([{ walletMsisdn: '9800000113', walletCode: 113 }]);
    walletTypes.findOne.mockResolvedValue({ walletId: 113, walletName: 'Charge Wallet', walletDetails: 'Charge_Wallet' });
  });

  it('calculates a flat charge paid by the source', async () => {
    keywordCharges.find.mockResolvedValueOnce([{ keywordChargeId: 2, chargeId: 10, payer: 'S' }]);
    mappings.find.mockResolvedValue([{ keywordChargeId: 2, status: 1 }]);
    charges.findOne.mockResolvedValue({ chargeId: 10, chargeType: 0, status: 1, expiryOn: null, defaultChargeId: null });
    details.find.mockResolvedValue([{ rowId: 5, chargeId: 10, chargeType: 'Flat', chargeValue: '12.50' }]);

    await expect(service.calculate({ transactionId: 'tx-1', keyword: 'PMNT', walletId: 2, amount: '1000.00' })).resolves.toMatchObject({
      chargeAmount: '12.50',
      sourceDebitAmount: '1012.50',
      destinationCreditAmount: '1000.00',
      payer: 'S',
      chargeWallet: { walletMsisdn: '9800000113', walletCode: 113, creditAmount: '12.50' },
    });
  });

  it('calculates and caps a percentage charge paid by the destination', async () => {
    keywordCharges.find.mockResolvedValueOnce([{ keywordChargeId: 3, chargeId: 11, payer: 'D' }]);
    mappings.find.mockResolvedValue([{ keywordChargeId: 3, status: 1 }]);
    charges.findOne.mockResolvedValue({ chargeId: 11, chargeType: 1, status: 1, expiryOn: null, defaultChargeId: null });
    details.find.mockResolvedValue([{ rowId: 6, chargeId: 11, chargeType: 'Percentage', chargeValue: '10', startRange: '0', endRange: '10000', minCharge: '5', maxCharge: '50' }]);

    await expect(service.calculate({ transactionId: 'tx-2', keyword: 'SEND', walletId: 3, amount: '1000.00' })).resolves.toMatchObject({
      chargeAmount: '50.00',
      sourceDebitAmount: '1000.00',
      destinationCreditAmount: '950.00',
      payer: 'D',
    });
  });

  it('rejects overlapping flexible ranges', async () => {
    keywordCharges.find.mockResolvedValueOnce([{ keywordChargeId: 4, chargeId: 12, payer: 'S' }]);
    mappings.find.mockResolvedValue([{ keywordChargeId: 4, status: 1 }]);
    charges.findOne.mockResolvedValue({ chargeId: 12, chargeType: 1, status: 1, expiryOn: null, defaultChargeId: null });
    details.find.mockResolvedValue([
      { rowId: 7, chargeId: 12, chargeType: 'Flat', chargeValue: '1', startRange: '0', endRange: '1000' },
      { rowId: 8, chargeId: 12, chargeType: 'Flat', chargeValue: '2', startRange: '500', endRange: '1500' },
    ]);

    await expect(service.calculate({ transactionId: 'tx-3', keyword: 'SEND', walletId: 4, amount: '750' })).rejects.toThrow('Overlapping charge ranges');
  });

  it('does not delete an active charge', async () => {
    charges.findOne.mockResolvedValue({ chargeId: 20, status: 1 });
    await expect(service.deleteCharge(20)).rejects.toThrow('Active charge cannot be deleted');
    expect(charges.delete).not.toHaveBeenCalled();
  });

  it('reuses cached charge configuration', async () => {
    keywordCharges.find.mockResolvedValue([{ keywordChargeId: 2, chargeId: 10, payer: 'S' }]);
    mappings.find.mockResolvedValue([{ keywordChargeId: 2, status: 1 }]);
    charges.findOne.mockResolvedValue({ chargeId: 10, chargeType: 0, status: 1, expiryOn: null, defaultChargeId: null });
    details.find.mockResolvedValue([{ rowId: 5, chargeId: 10, chargeType: 'Flat', chargeValue: '10.00' }]);

    await service.calculate({ transactionId: 'tx-cache-1', keyword: 'PMNT', walletId: 2, amount: '100' });
    await service.calculate({ transactionId: 'tx-cache-2', keyword: 'PMNT', walletId: 2, amount: '200' });

    expect(keywordCharges.find).toHaveBeenCalledTimes(1);
    expect(details.find).toHaveBeenCalledTimes(1);
  });

  it('coalesces simultaneous cold-cache configuration loads', async () => {
    keywordCharges.find.mockResolvedValue([{ keywordChargeId: 2, chargeId: 10, payer: 'S' }]);
    mappings.find.mockResolvedValue([{ keywordChargeId: 2, status: 1 }]);
    charges.findOne.mockResolvedValue({ chargeId: 10, chargeType: 0, status: 1, expiryOn: null, defaultChargeId: null });
    details.find.mockResolvedValue([{ rowId: 5, chargeId: 10, chargeType: 'Flat', chargeValue: '10.00' }]);

    await Promise.all(Array.from({ length: 5 }, (_, index) => service.calculate({
      transactionId: `tx-flight-${index}`,
      keyword: 'PMNT',
      walletId: 2,
      amount: '100',
    })));

    expect(keywordCharges.find).toHaveBeenCalledTimes(1);
    expect(details.find).toHaveBeenCalledTimes(1);
  });
});
