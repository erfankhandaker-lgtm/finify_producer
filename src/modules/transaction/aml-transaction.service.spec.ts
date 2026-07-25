import { AmlTransactionService } from './aml-transaction.service';

describe('AmlTransactionService', () => {
  it('maps an AML reservation result', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{
      success: true, status_code: 'RESERVED', status_message: 'ok', transaction_id: '10',
      reservation_status: 'PENDING', wallet_code: 103, daily_amount_used: '100.00',
      daily_transaction_used: '1', monthly_amount_used: '100.00', monthly_transaction_used: '1',
    }]) };
    const service = new AmlTransactionService(dataSource as any);

    await expect(service.reserve({ transactionId: '10', sourceWallet: '447700000001', keyword: 'PMNT', amount: 100 }))
      .resolves.toMatchObject({ success: true, statusCode: 'RESERVED', walletCode: 103, dailyTransactionUsed: 1 });
  });

  it('releases a pending reservation idempotently', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{
      success: true, status_code: 'ALREADY_RELEASED', status_message: 'ok', reservation_status: 'RELEASED',
    }]) };
    const service = new AmlTransactionService(dataSource as any);

    await expect(service.release('10')).resolves.toBeUndefined();
  });

  it('fails closed when release returns an invalid state', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{
      success: false, status_code: 'INVALID_STATE', status_message: 'bad', reservation_status: 'COMPLETED',
    }]) };
    const service = new AmlTransactionService(dataSource as any);

    await expect(service.release('10')).rejects.toThrow('AML release failed');
  });
});
