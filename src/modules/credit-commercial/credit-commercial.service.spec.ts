import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreditCommercialService } from './credit-commercial.service';

describe('CreditCommercialService', () => {
  const query = jest.fn();
  const service = new CreditCommercialService({ query } as unknown as DataSource);

  beforeEach(() => query.mockReset());

  it('saves the complete graph through one database function call', async () => {
    query.mockResolvedValue([{ configuration: { id: 'binding-1', revision: 4 } }]);
    const dto = { expectedRevision: 3 } as never;
    await expect(service.update('00000000-0000-4000-8000-000000000001', dto, 'maker'))
      .resolves.toEqual({ id: 'binding-1', revision: 4 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('apply_credit_commercial_configuration');
  });

  it('runs a lifecycle change through one database function call', async () => {
    query.mockResolvedValue([{ configuration: { status: 'PENDING_APPROVAL', revision: 5 } }]);
    await expect(service.transition(
      '00000000-0000-4000-8000-000000000001',4,'SUBMIT','maker',
    )).resolves.toMatchObject({ status: 'PENDING_APPROVAL' });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('transition_credit_commercial_configuration');
  });

  it('maps optimistic revision failures to conflict responses', async () => {
    query.mockRejectedValue(Object.assign(new Error('configuration changed'), { code: '40001' }));
    await expect(service.transition(
      '00000000-0000-4000-8000-000000000001',2,'SUBMIT','maker',
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps relational validation failures to bad requests', async () => {
    query.mockRejectedValue(Object.assign(new Error('active bank required'), { code: '23503' }));
    await expect(service.create({ code: 'TEST' } as never, 'maker'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('calculates fee projections without mutating configuration', async () => {
    query.mockResolvedValue([{ configuration: {
      processingFeeType: 'PERCENT',processingFeeValue: 1,
      lateFeeType: 'PERCENT',lateFeeValue: 2,
      earlySettlementAllowed: true,earlySettlementFeeType: 'FLAT',earlySettlementFeeValue: 0,
    } }]);
    const result = await service.simulate({
      productId: 'UGA_RETAIL_CREDIT',countryCode: 'UGA',currency: 'UGX',channel: 'APP',
      environmentScope: 'TEST',principal: 400000,
    });
    expect(result).toMatchObject({
      matched: true,projection: { principal: 400000,processingFee: 4000,lateFee: 8000,earlySettlementFee: 0 },
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
