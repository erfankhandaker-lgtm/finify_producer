import { ForbiddenException } from '@nestjs/common';
import { TransactionService } from './transaction.service';

jest.mock('../../config/winstonLog', () => ({
  winstonLog: { log: jest.fn() },
}));

describe('Transaction security regression', () => {
  const authenticatedMsisdn = '447700920001';
  const ownedWallet = '447700920001';
  const destinationWallet = '447700910001';
  const transactionId = '178570000000001';

  const transaction = {
    transactionId: undefined as any,
    amount: 100,
    pin: '1234',
    keyword: 'PMNT',
    sourceAccount: ownedWallet,
    destinationAccount: destinationWallet,
    mobileNumber: authenticatedMsisdn,
    referenceId: 'SECURITY-REGRESSION-1',
    currency: 'UGX',
  };

  let keywordService: any;
  let users: any;
  let passwordService: any;
  let processTransactionService: any;
  let transactionRequestService: any;
  let walletDetails: any;
  let chargeService: any;
  let commissionService: any;
  let amlTransactionService: any;
  let service: TransactionService;

  const successfulKeywordResponse = () => ({
    ResponseCode: 200,
    AMLCHECK: [{ code: 100, msg: 'AML pre-check passed' }],
    keywordExists: {
      keyword: 'PMNT',
      chargeable: 'Y',
      commissionable: 'Y',
      kcIdLookup: 'S',
      kcmIdLookup: 'D',
      isSystemKeyword: false,
    },
  });

  beforeEach(() => {
    keywordService = { checkkeyword: jest.fn().mockResolvedValue(successfulKeywordResponse()) };
    users = {
      findOne: jest.fn(({ where }: any) => Promise.resolve(
        where.MSISDN === ownedWallet
          ? { MSISDN: ownedWallet, Wallet_Code: 103, Amount: '1000.00', Full_Name: 'Test Customer' }
          : { MSISDN: destinationWallet, Wallet_Code: 201, Amount: '500.00', Full_Name: 'Test Merchant' },
      )),
    };
    passwordService = { PINVerify: jest.fn().mockResolvedValue({ Passwordmatch: true, AccountStatus: 0 }) };
    processTransactionService = { sendTransaction: jest.fn().mockResolvedValue(undefined) };
    transactionRequestService = {
      assertWalletOwned: jest.fn().mockResolvedValue({ walletMsisdn: ownedWallet }),
      create: jest.fn().mockResolvedValue({
        transectionId: transactionId,
        ID: `PMNT-${transactionId}`,
        currency: 'UGX',
      }),
      update: jest.fn().mockResolvedValue(undefined),
      findOneForOwner: jest.fn(),
      findAllPaginatedForOwner: jest.fn(),
    };
    walletDetails = { findOne: jest.fn() };
    chargeService = {
      calculate: jest.fn().mockResolvedValue({
        chargeId: 10,
        chargeDetailId: 11,
        payer: 'S',
        chargeAmount: '2.00',
        sourceDebitAmount: '102.00',
        destinationCreditAmount: '100.00',
        chargeWallet: {
          walletMsisdn: '9800000113', walletCode: 113, creditAmount: '2.00',
        },
      }),
    };
    commissionService = {
      calculate: jest.fn().mockResolvedValue({
        commissionId: 20,
        commissionDetailId: 21,
        receiver: 'D',
        commissionAmount: '1.00',
        sourceCommissionCredit: '0.00',
        destinationCommissionCredit: '1.00',
        commissionWallet: {
          walletMsisdn: '9800000114', walletCode: 114, debitAmount: '1.00',
        },
      }),
    };
    amlTransactionService = {
      reserve: jest.fn().mockResolvedValue({
        success: true,
        statusCode: 'RESERVED',
        statusMessage: 'AML limits reserved',
        reservationStatus: 'PENDING',
        walletCode: 103,
      }),
      release: jest.fn().mockResolvedValue(undefined),
    };

    service = new TransactionService(
      keywordService,
      users,
      passwordService,
      processTransactionService,
      transactionRequestService,
      walletDetails,
      chargeService,
      commissionService,
      amlTransactionService,
    );
  });

  it('rejects a spoofed identity before wallet lookup or transaction creation', async () => {
    await expect(service.transactionprocess(
      { ...transaction, mobileNumber: '447700999999' },
      authenticatedMsisdn,
    )).rejects.toThrow(ForbiddenException);

    expect(transactionRequestService.assertWalletOwned).not.toHaveBeenCalled();
    expect(transactionRequestService.create).not.toHaveBeenCalled();
    expect(amlTransactionService.reserve).not.toHaveBeenCalled();
    expect(processTransactionService.sendTransaction).not.toHaveBeenCalled();
  });

  it('rejects an unowned source wallet before creating or checking a transaction', async () => {
    transactionRequestService.assertWalletOwned.mockRejectedValueOnce(
      new ForbiddenException('Wallet is not owned by the authenticated account'),
    );

    await expect(service.transactionprocess(
      { ...transaction, sourceAccount: '447700999998' },
      authenticatedMsisdn,
    )).rejects.toThrow('Wallet is not owned');

    expect(transactionRequestService.create).not.toHaveBeenCalled();
    expect(keywordService.checkkeyword).not.toHaveBeenCalled();
    expect(passwordService.PINVerify).not.toHaveBeenCalled();
    expect(amlTransactionService.reserve).not.toHaveBeenCalled();
    expect(processTransactionService.sendTransaction).not.toHaveBeenCalled();
  });

  it('fails closed when the AML pre-check rejects and never verifies or posts', async () => {
    keywordService.checkkeyword.mockResolvedValueOnce({
      ResponseCode: 200,
      AMLCHECK: [{ code: 980, msg: 'Daily AML amount exceeded' }],
      keywordExists: successfulKeywordResponse().keywordExists,
    });

    await expect(service.transactionprocess(transaction, authenticatedMsisdn)).resolves.toEqual({
      Responsecode: 980,
      ResponseDescription: 'Daily AML amount exceeded',
      TransactionID: transactionId,
    });

    expect(transactionRequestService.update).toHaveBeenCalledWith(expect.objectContaining({
      transactionId,
      transactionStatus: BigInt(3),
    }));
    expect(passwordService.PINVerify).not.toHaveBeenCalled();
    expect(chargeService.calculate).not.toHaveBeenCalled();
    expect(commissionService.calculate).not.toHaveBeenCalled();
    expect(amlTransactionService.reserve).not.toHaveBeenCalled();
    expect(processTransactionService.sendTransaction).not.toHaveBeenCalled();
  });

  it('fails closed when AML reservation rejects after PIN and pricing checks', async () => {
    amlTransactionService.reserve.mockResolvedValueOnce({
      success: false,
      statusCode: 'MONTHLY_AMOUNT_EXCEEDED',
      statusMessage: 'Monthly AML amount exceeded',
      reservationStatus: 'REJECTED',
      walletCode: 103,
    });

    await expect(service.transactionprocess(transaction, authenticatedMsisdn)).resolves.toEqual({
      Responsecode: 980,
      ResponseDescription: 'Monthly AML amount exceeded',
      AMLCode: 'MONTHLY_AMOUNT_EXCEEDED',
      TransactionID: transactionId,
    });

    expect(passwordService.PINVerify).toHaveBeenCalledWith('1234', authenticatedMsisdn);
    expect(chargeService.calculate).toHaveBeenCalledTimes(1);
    expect(commissionService.calculate).toHaveBeenCalledTimes(1);
    expect(transactionRequestService.update).toHaveBeenLastCalledWith(expect.objectContaining({
      transactionStatus: BigInt(3),
    }));
    expect(processTransactionService.sendTransaction).not.toHaveBeenCalled();
  });

  it('runs ownership, AML, PIN, charge, commission and dispatch for an approved transaction', async () => {
    await expect(service.transactionprocess(transaction, authenticatedMsisdn)).resolves.toEqual({
      Responsecode: 200,
      ResponseDescription: 'Transaction submitted successfully',
      TransactionID: transactionId,
    });

    expect(transactionRequestService.assertWalletOwned).toHaveBeenCalledWith(
      authenticatedMsisdn,
      ownedWallet,
    );
    expect(passwordService.PINVerify).toHaveBeenCalledWith('1234', authenticatedMsisdn);
    expect(chargeService.calculate).toHaveBeenCalledWith(expect.objectContaining({
      transactionId,
      keyword: 'PMNT',
      walletId: 103,
      sourceWalletType: 103,
      destinationWalletType: 201,
      currency: 'UGX',
      amount: '100',
    }));
    expect(commissionService.calculate).toHaveBeenCalledWith(expect.objectContaining({
      transactionId,
      walletId: 201,
      currency: 'UGX',
    }));
    expect(amlTransactionService.reserve).toHaveBeenCalledWith({
      transactionId,
      sourceWallet: ownedWallet,
      keyword: 'PMNT',
      amount: 100,
    });
    expect(transactionRequestService.update).toHaveBeenCalledWith(expect.objectContaining({
      transactionId,
      feePayer: ownedWallet,
      commissionReceiver: destinationWallet,
      transactionFee: '2.00',
      transactionCommission: '1.00',
      transactionStatus: BigInt(2),
    }));
    expect(processTransactionService.sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        Source: ownedWallet,
        Destination: destinationWallet,
        Amount: 100,
        Currency: 'UGX',
        CHARGEAMOUNT: '2.00',
        COMMISSIONAMOUNT: '1.00',
        SourceDebitAmount: '102.00',
        DestinationCreditAmount: '100.00',
        AMLReservation: { status: 'PENDING', walletCode: 103 },
      }),
      'PMNT',
    );

    const order = (mock: jest.Mock) => mock.mock.invocationCallOrder[0];
    expect(order(transactionRequestService.assertWalletOwned)).toBeLessThan(order(transactionRequestService.create));
    expect(order(transactionRequestService.create)).toBeLessThan(order(keywordService.checkkeyword));
    expect(order(keywordService.checkkeyword)).toBeLessThan(order(passwordService.PINVerify));
    expect(order(passwordService.PINVerify)).toBeLessThan(order(amlTransactionService.reserve));
    expect(order(amlTransactionService.reserve)).toBeLessThan(order(processTransactionService.sendTransaction));
  });

  it('releases the AML reservation and marks the request failed when dispatch fails', async () => {
    processTransactionService.sendTransaction.mockRejectedValueOnce(new Error('Kafka unavailable'));

    await expect(service.transactionprocess(transaction, authenticatedMsisdn))
      .rejects.toThrow('Kafka unavailable');

    expect(amlTransactionService.release).toHaveBeenCalledWith(transactionId);
    expect(transactionRequestService.update).toHaveBeenLastCalledWith(expect.objectContaining({
      transactionId,
      transactionStatus: BigInt(3),
    }));
  });
});
