import { ForbiddenException } from '@nestjs/common';
import { ReferenceDataService } from './reference-data.service';

const actor = (sub: string, username: string) => ({
  sub, sid: `session-${sub}`, username, roles: ['super_admin'],
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
});
