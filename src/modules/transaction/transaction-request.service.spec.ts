import { BadRequestException, ForbiddenException } from '@nestjs/common';
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

  it('persists the client transaction reference', async () => {
    walletRepository.findOne
      .mockResolvedValueOnce({ walletMsisdn: request.sourceAccount, status: 0, currency: 'UGX' })
      .mockResolvedValueOnce({ walletMsisdn: request.destinationAccount, status: 0, currency: 'UGX' });
    await service.create({ ...request, referenceId: ' RETAILER-ORDER-1001 ' });
    expect(transactionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: 'RETAILER-ORDER-1001' }),
    );
  });

  it('blocks a normal transfer when wallet currencies differ', async () => {
    walletRepository.findOne
      .mockResolvedValueOnce({ walletMsisdn: request.sourceAccount, status: 0, currency: 'GBP' })
      .mockResolvedValueOnce({ walletMsisdn: request.destinationAccount, status: 0, currency: 'USD' });
    await expect(service.create(request)).rejects.toBeInstanceOf(BadRequestException);
    expect(transactionRepository.save).not.toHaveBeenCalled();
  });

  it('allows access only when the wallet belongs to the authenticated identity', async () => {
    walletRepository.findOne.mockResolvedValueOnce({
      walletMsisdn: request.sourceAccount,
      ownerMsisdn: request.mobileNumber,
    });
    await expect(service.assertWalletOwned(request.mobileNumber, request.sourceAccount))
      .resolves.toEqual(expect.objectContaining({ walletMsisdn: request.sourceAccount }));
    expect(walletRepository.findOne).toHaveBeenCalledWith({
      where: { walletMsisdn: request.sourceAccount, ownerMsisdn: request.mobileNumber },
    });
  });

  it('rejects a wallet owned by another identity', async () => {
    walletRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.assertWalletOwned(request.mobileNumber, '999999999999'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
