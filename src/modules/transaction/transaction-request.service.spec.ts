import { BadRequestException } from '@nestjs/common';
import { TransactionRequestService } from './transaction-request.service';

describe('TransactionRequestService currency controls', () => {
  const transactionRepository: any = {
    create: jest.fn(value => value),
    save: jest.fn(async value => value),
  };
  const entryRepository: any = {};
  const walletRepository: any = { findOne: jest.fn() };
  const service = new TransactionRequestService(
    transactionRepository,
    entryRepository,
    walletRepository,
  );
  const request: any = {
    amount: 10,
    keyword: 'PMNT',
    sourceAccount: '447340815480',
    destinationAccount: '441727123374',
    mobileNumber: '447340815480',
    pin: '445566',
  };

  beforeEach(() => jest.clearAllMocks());

  it('derives and persists the currency from matching wallets', async () => {
    walletRepository.findOne
      .mockResolvedValueOnce({ walletMsisdn: request.sourceAccount, status: 0, currency: 'GBP' })
      .mockResolvedValueOnce({ walletMsisdn: request.destinationAccount, status: 0, currency: 'GBP' });
    const result = await service.create(request);
    expect(result.currency).toBe('GBP');
    expect(transactionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'GBP' }),
    );
  });

  it('blocks a normal transfer when wallet currencies differ', async () => {
    walletRepository.findOne
      .mockResolvedValueOnce({ walletMsisdn: request.sourceAccount, status: 0, currency: 'GBP' })
      .mockResolvedValueOnce({ walletMsisdn: request.destinationAccount, status: 0, currency: 'USD' });
    await expect(service.create(request)).rejects.toBeInstanceOf(BadRequestException);
    expect(transactionRepository.save).not.toHaveBeenCalled();
  });
});
