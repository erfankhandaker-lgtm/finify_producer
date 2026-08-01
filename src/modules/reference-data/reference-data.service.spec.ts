import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ReferenceDataService } from './reference-data.service';

const actor = (sub: string, username: string, roles = ['operations_admin']) => ({
  sub, sid: `session-${sub}`, username, roles,
  permissions: ['reference_data.read', 'reference_data.make', 'reference_data.check'],
  type: 'admin_access' as const,
});

describe('ReferenceDataService maker/checker', () => {
  const request = {
    id: '1', resource_type: 'KEYWORD', resource_key: 'TST01', action: 'CREATE', status: 'PENDING',
    base_snapshot: null,
    proposed_snapshot: {
      keyword: 'TST01', keywordDescription: 'Test', keywordScope: 'M', isFinancial: true,
      chargeable: 'N', kcIdLookup: null, commissionable: 'N', kcmIdLookup: null,
      minimumTranAmount: 1, involvedParty: null, applyTds: false, isRewardApplicable: false,
      isSystemKeyword: false, serviceStatus: true, vatSource: 'D', vatId: 1,
      keywordDescriptionLocal: null, isCategoryService: false, priority: null,
      reverseKeyword: null, isActive: true,
    },
    maker_user_id: '10', maker_username: 'maker', maker_comment: null,
    checker_user_id: null, checker_username: null, checker_comment: null,
    created_at: new Date(), decided_at: null,
  };

  it('blocks the maker from approving their own request', async () => {
    const runner = {
      manager: {}, connect: jest.fn(), startTransaction: jest.fn(),
      query: jest.fn().mockResolvedValue([request]), rollbackTransaction: jest.fn(),
      commitTransaction: jest.fn(), release: jest.fn(),
    };
    const service = new ReferenceDataService(
      { createQueryRunner: () => runner } as any,
      {} as any,
    );

    await expect(service.approve('1', undefined, actor('10', 'maker'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(runner.rollbackTransaction).toHaveBeenCalled();
    expect(runner.commitTransaction).not.toHaveBeenCalled();
  });

  it('allows a different checker to atomically create the approved live record', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM public.reference_data_change_requests') && sql.includes('FOR UPDATE')) return [request];
      if (sql.includes('jsonb_build_object') && sql.includes('SW_TBL_KEYWORD')) return [];
      if (sql.includes('INSERT INTO public."SW_TBL_KEYWORD"')) return [];
      if (sql.includes("SET status='APPROVED'")) return [{ ...request, status: 'APPROVED', checker_user_id: '11', checker_username: 'checker' }];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const runner = {
      manager: { query }, connect: jest.fn(), startTransaction: jest.fn(), query,
      rollbackTransaction: jest.fn(), commitTransaction: jest.fn(), release: jest.fn(),
    };
    const cache = { setEx: jest.fn() };
    const service = new ReferenceDataService(
      { createQueryRunner: () => runner } as any,
      cache as any,
    );

    await expect(service.approve('1', 'looks good', actor('11', 'checker'))).resolves.toMatchObject({
      status: 'APPROVED', checkerUsername: 'checker',
    });
    expect(runner.commitTransaction).toHaveBeenCalled();
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
    expect(cache.setEx).toHaveBeenCalledTimes(3);
  });

  it('allows a Super Admin to approve their own governed request', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return [request];
      if (sql.includes('jsonb_build_object') && sql.includes('SW_TBL_KEYWORD')) return [];
      if (sql.includes('INSERT INTO public."SW_TBL_KEYWORD"')) return [];
      if (sql.includes("SET status='APPROVED'")) {
        return [{ ...request, status: 'APPROVED', checker_user_id: '10', checker_username: 'maker' }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const runner = {
      manager: { query }, connect: jest.fn(), startTransaction: jest.fn(), query,
      rollbackTransaction: jest.fn(), commitTransaction: jest.fn(), release: jest.fn(),
    };
    const service = new ReferenceDataService(
      { createQueryRunner: () => runner } as any,
      { setEx: jest.fn() } as any,
    );

    await expect(
      service.approve('1', 'super-admin override', actor('10', 'maker', ['super_admin'])),
    ).resolves.toMatchObject({ status: 'APPROVED' });
    expect(runner.commitTransaction).toHaveBeenCalled();
  });

  it('simulates AML checks in transaction evaluation order without writing data', async () => {
    const dataSource = {
      manager: {
        query: jest.fn().mockResolvedValue([{ wallet_exists: true, keyword_exists: true }]),
      },
    };
    const service = new ReferenceDataService(dataSource as any, {} as any);

    await expect(service.simulateAmlConfiguration({
      walletCode: 103,
      keyword: 'SEND',
      maxTransactionAmount: 5000,
      dailyMaxAmount: 25000,
      dailyTransactionCount: 25,
      monthlyMaxAmount: 250000,
      monthlyTransactionCount: 250,
      transactionAmount: 4000,
      dailyAmountUsed: 22000,
      dailyTransactionUsed: 3,
      monthlyAmountUsed: 50000,
      monthlyTransactionUsed: 20,
    })).resolves.toMatchObject({
      success: false,
      decision: 'BLOCK',
      statusCode: 'AML_DAILY_AMOUNT_EXCEEDED',
      projectedUsage: { dailyAmount: 26000, dailyTransactionCount: 4 },
      readOnly: true,
    });
    expect(dataSource.manager.query).toHaveBeenCalledTimes(1);
  });

  it('rejects an update when the identical AML rule already exists', async () => {
    const snapshot = {
      rowId: 1,
      walletCode: 103,
      keyword: 'SEND',
      maxTransactionAmount: 5000,
      dailyMaxAmount: 25000,
      dailyTransactionCount: 25,
      monthlyMaxAmount: 250000,
      monthlyTransactionCount: 250,
      isActive: true,
    };
    const snapshotQuery = jest.fn().mockResolvedValue([{ snapshot }]);
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('pg_advisory_xact_lock')) return [];
        if (sql.includes('jsonb_build_object')) return [{ snapshot }];
        if (sql.includes('AS same')) return [{ same: true }];
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };
    const dataSource = {
      manager: { query: snapshotQuery },
      transaction: (callback: (value: typeof manager) => unknown) => callback(manager),
    };
    const service = new ReferenceDataService(dataSource as any, {} as any);

    await expect(service.updateAmlConfiguration('103' as unknown as number, 'SEND', {
      maxTransactionAmount: 5000,
      dailyMaxAmount: 25000,
      dailyTransactionCount: 25,
      monthlyMaxAmount: 250000,
      monthlyTransactionCount: 250,
      isActive: true,
    }, actor('10', 'maker'))).rejects.toBeInstanceOf(ConflictException);
  });

  it('queues wallet-type creation with boolean KYC state', async () => {
    const manager = {
      query: jest.fn(async (sql: string, parameters?: unknown[]) => {
        if (sql.includes('pg_advisory_xact_lock')) return [];
        if (sql.includes('jsonb_build_object') && sql.includes('SW_TBL_WALLET_TYPE')) return [];
        if (sql.includes('SELECT id FROM public.reference_data_change_requests')) return [];
        if (sql.includes('INSERT INTO public.reference_data_change_requests')) {
          return [{
            id: '22',
            resource_type: 'WALLET_TYPE',
            resource_key: '9901',
            action: 'CREATE',
            status: 'PENDING',
            base_snapshot: null,
            proposed_snapshot: JSON.parse(String(parameters?.[4])),
            maker_user_id: '10',
            maker_username: 'maker',
            maker_comment: null,
            checker_user_id: null,
            checker_username: null,
            checker_comment: null,
            created_at: new Date(),
            decided_at: null,
          }];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };
    const service = new ReferenceDataService({
      transaction: (callback: (value: typeof manager) => unknown) => callback(manager),
    } as any, {} as any);

    await expect(service.createWalletType({
      walletId: 9901,
      walletName: 'Test wallet',
      isKycNeeded: false,
      status: true,
    }, actor('10', 'maker'))).resolves.toMatchObject({
      resourceType: 'WALLET_TYPE',
      resourceKey: '9901',
      proposedSnapshot: { isKycNeeded: false, status: true },
    });
  });
});
