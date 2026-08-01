import { PricingFlowService } from './pricing-flow.service';

const definition = {
  trigger: { keyword: 'PMNT', currency: 'UGX' },
  route: { sourceWalletType: 1, destinationWalletType: 2 },
  condition: { minimumAmount: 100, maximumAmount: 10000 },
  charge: {
    mode: 'FLEXIBLE',
    type: 'PERCENTAGE',
    value: 2.5,
    minimum: 10,
    maximum: 500,
    payer: 'S',
    ranges: [
      {
        minimumAmount: 100,
        maximumAmount: 10000,
        type: 'PERCENTAGE',
        value: 2.5,
        minimum: 10,
        maximum: 500,
      },
    ],
  },
  commission: { enabled: true, type: 'PERCENTAGE', value: 0.5, minimum: 1, maximum: 100, receiver: 'D' },
  settlement: { chargeWalletType: 113, commissionWalletType: 114 },
};

describe('PricingFlowService', () => {
  const service = new PricingFlowService({ query: jest.fn() } as any);

  it('normalizes legacy selectors and supports multiple keywords and wallet types', () => {
    const legacy = service.validateDefinition(definition);
    expect(legacy.trigger).toMatchObject({
      keyword: 'PMNT',
      keywords: ['PMNT'],
    });
    expect(legacy.route).toMatchObject({
      sourceWalletType: 1,
      sourceWalletTypes: [1],
      destinationWalletType: 2,
      destinationWalletTypes: [2],
    });

    const multiple = service.validateDefinition({
      ...definition,
      trigger: {
        keyword: 'IGNORED_LEGACY_VALUE',
        keywords: ['PMNT', 'CASH', 'PMNT'],
        currency: 'UGX',
      },
      route: {
        sourceWalletType: 99,
        sourceWalletTypes: [1, 3, 1],
        destinationWalletType: 98,
        destinationWalletTypes: [2, 4, 2],
      },
    });
    expect(multiple.trigger).toMatchObject({
      keyword: 'PMNT',
      keywords: ['PMNT', 'CASH'],
    });
    expect(multiple.route).toMatchObject({
      sourceWalletType: 1,
      sourceWalletTypes: [1, 3],
      destinationWalletType: 2,
      destinationWalletTypes: [2, 4],
    });
    expect(
      service.validateDefinition(JSON.parse(JSON.stringify(multiple))),
    ).toEqual(multiple);
  });

  it('confirms matching routes and rejects non-matching simulation routes', () => {
    const configured = {
      ...definition,
      trigger: {
        keyword: 'PMNT',
        keywords: ['PMNT', 'CASH'],
        currency: 'UGX',
      },
      route: {
        sourceWalletType: 1,
        sourceWalletTypes: [1, 3],
        destinationWalletType: 2,
        destinationWalletTypes: [2, 4],
      },
    };

    expect(service.simulate(configured, 1000, 3, 4)).toMatchObject({
      matched: true,
      routeMatched: true,
      sourceWalletType: 3,
      destinationWalletType: 4,
      sourceDebitAmount: '1025.00',
      destinationCreditAmount: '1000.00',
    });
    const rejected = service.simulate(configured, 1000, 3, 9);
    expect(rejected).toMatchObject({
      matched: false,
      routeMatched: false,
      sourceWalletType: 3,
      destinationWalletType: 9,
      chargeAmount: '0.00',
      commissionAmount: '0.00',
      sourceDebitAmount: '0.00',
      destinationCreditAmount: '0.00',
    });
    expect(rejected.trace.find((step) => step.node === 'WALLET_ROUTE')).toMatchObject({
      status: 'FAILED',
    });
  });

  it('persists and reloads all selected keywords and wallet routes', async () => {
    const multiDefinition = service.validateDefinition({
      ...definition,
      trigger: {
        keyword: 'PMNT',
        keywords: ['PMNT', 'CASH'],
        currency: 'UGX',
      },
      route: {
        sourceWalletType: 1,
        sourceWalletTypes: [1, 3],
        destinationWalletType: 2,
        destinationWalletTypes: [2, 4],
      },
    });
    let storedDefinition: unknown;
    const manager = {
      query: jest.fn(async (sql: string, parameters: unknown[]) => {
        if (sql.includes('COALESCE(max(version)')) return [{ version: 1 }];
        if (sql.includes('INSERT INTO public.pricing_rule_flows(')) {
          storedDefinition = JSON.parse(String(parameters[8]));
          return [{ id: '91' }];
        }
        if (sql.includes('FROM public.pricing_rule_flows')) {
          return [
            {
              id: '91',
              ruleCode: 'MULTI_ROUTE',
              version: 1,
              name: 'Multi-route rule',
              keyword: 'PMNT',
              sourceWalletType: 1,
              destinationWalletType: 2,
              currency: 'UGX',
              priority: 100,
              status: 'DRAFT',
              definition: storedDefinition,
              createdBy: 'maker',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
        }
        return [];
      }),
    };
    const roundTripService = new PricingFlowService({
      transaction: (callback: (value: typeof manager) => unknown) =>
        callback(manager),
    } as any);

    const created = await roundTripService.create(
      {
        ruleCode: 'MULTI_ROUTE',
        name: 'Multi-route rule',
        priority: 100,
        definition: multiDefinition,
      },
      'maker',
    );

    expect(created.definition.trigger.keywords).toEqual(['PMNT', 'CASH']);
    expect(created.definition.route.sourceWalletTypes).toEqual([1, 3]);
    expect(created.definition.route.destinationWalletTypes).toEqual([2, 4]);
  });

  it('uses source and destination wallet types in active runtime lookup', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const lookupService = new PricingFlowService({ query } as any);

    await lookupService.findActive('PMNT', 103, 'UGX', 111);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("destinationWalletTypes"),
      ['PMNT', 103, 'UGX', 111],
    );
  });

  it('simulates a matched visual pricing flow', () => {
    expect(service.simulate(definition, '1000')).toMatchObject({
      matched: true,
      chargeAmount: '25.00',
      commissionAmount: '5.00',
      sourceDebitAmount: '1025.00',
      destinationCreditAmount: '1000.00',
      chargePayer: 'S',
      commissionReceiver: 'D',
    });
  });

  it('skips a flexible charge but still matches independent fixed commission', () => {
    const result = service.simulate(definition, '50');
    expect(result).toMatchObject({
      matched: true,
      chargeAmount: '0.00',
      commissionAmount: '1.00',
    });
    expect(result.trace.find((step) => step.node === 'COMMISSION')).toMatchObject({
      status: 'PASSED',
    });
    expect(result.trace.find((step) => step.node === 'SETTLEMENT')).toMatchObject({
      status: 'PASSED',
    });
  });

  it('applies a fixed charge without checking transaction amount ranges', () => {
    const fixed = {
      ...definition,
      charge: {
        mode: 'FIXED',
        type: 'FIXED',
        value: 750,
        payer: 'S',
        ranges: [],
      },
    };
    expect(service.simulate(fixed, '50')).toMatchObject({
      matched: true,
      chargeAmount: '750.00',
      chargeCalculationType: 'FIXED',
      chargeCalculationValue: 750,
    });
  });

  it('selects the matching flexible range calculation', () => {
    const flexible = {
      ...definition,
      charge: {
        ...definition.charge,
        ranges: [
          { minimumAmount: 0, maximumAmount: 999, type: 'FIXED', value: 100 },
          { minimumAmount: 1000, maximumAmount: 5000, type: 'PERCENTAGE', value: 3 },
        ],
      },
    };
    expect(service.simulate(flexible, '2000')).toMatchObject({
      matched: true,
      chargeAmount: '60.00',
      chargeCalculationType: 'PERCENTAGE',
      chargeCalculationValue: 3,
      matchedChargeRange: { index: 1, minimumAmount: 1000, maximumAmount: 5000 },
    });
  });

  it('supports one-to-one and many-to-one range connections for charge and commission', () => {
    const connected = {
      ...definition,
      charge: {
        ...definition.charge,
        calculations: [
          { id: 'shared-charge', name: 'Shared charge', type: 'FIXED', value: 25 },
          { id: 'high-charge', name: 'High-value charge', type: 'PERCENTAGE', value: 2 },
        ],
        defaultCalculationId: 'shared-charge',
        ranges: [
          {
            id: 'low',
            minimumAmount: 0,
            maximumAmount: 1000,
            chargeCalculationId: 'shared-charge',
            commissionCalculationId: 'shared-commission',
          },
          {
            id: 'medium',
            minimumAmount: 1000.01,
            maximumAmount: 2000,
            chargeCalculationId: 'shared-charge',
            commissionCalculationId: 'shared-commission',
          },
          {
            id: 'high',
            minimumAmount: 2000.01,
            maximumAmount: 10000,
            chargeCalculationId: 'high-charge',
            commissionCalculationId: 'high-commission',
          },
        ],
      },
      commission: {
        ...definition.commission,
        mode: 'RANGE_LINKED',
        calculations: [
          { id: 'shared-commission', name: 'Shared commission', type: 'FIXED', value: 3 },
          { id: 'high-commission', name: 'High-value commission', type: 'PERCENTAGE', value: 1 },
        ],
        defaultCalculationId: 'shared-commission',
      },
    };

    expect(service.simulate(connected, 500)).toMatchObject({
      chargeAmount: '25.00',
      commissionAmount: '3.00',
      chargeCalculationId: 'shared-charge',
      commissionCalculationId: 'shared-commission',
    });
    expect(service.simulate(connected, 1500)).toMatchObject({
      chargeCalculationId: 'shared-charge',
      commissionCalculationId: 'shared-commission',
    });
    expect(service.simulate(connected, 3000)).toMatchObject({
      chargeAmount: '60.00',
      commissionAmount: '30.00',
      chargeCalculationId: 'high-charge',
      commissionCalculationId: 'high-commission',
    });
  });

  it('evaluates independent charge and commission amount ranges', () => {
    const independent = {
      ...definition,
      charge: {
        ...definition.charge,
        enabled: true,
        calculations: [
          { id: 'charge-low', name: 'Low charge', type: 'FIXED', value: 25 },
        ],
        defaultCalculationId: 'charge-low',
        ranges: [
          {
            id: 'charge-low-range',
            minimumAmount: 0,
            maximumAmount: 1000,
            chargeCalculationId: 'charge-low',
          },
        ],
      },
      commission: {
        ...definition.commission,
        enabled: true,
        mode: 'FLEXIBLE',
        calculations: [
          {
            id: 'commission-high',
            name: 'High commission',
            type: 'PERCENTAGE',
            value: 1,
          },
        ],
        defaultCalculationId: 'commission-high',
        ranges: [
          {
            id: 'commission-high-range',
            minimumAmount: 1000.01,
            maximumAmount: 10000,
            commissionCalculationId: 'commission-high',
          },
        ],
      },
    };

    expect(service.simulate(independent, 500)).toMatchObject({
      chargeAmount: '25.00',
      commissionAmount: '0.00',
      matchedChargeRange: { id: 'charge-low-range' },
      matchedCommissionRange: undefined,
    });
    expect(service.simulate(independent, 2000)).toMatchObject({
      chargeAmount: '0.00',
      commissionAmount: '20.00',
      matchedChargeRange: undefined,
      matchedCommissionRange: { id: 'commission-high-range' },
    });
  });

  it('supports charge-only and commission-only pricing flows', () => {
    const commissionOnly = {
      ...definition,
      charge: { ...definition.charge, enabled: false },
      commission: { ...definition.commission, enabled: true },
    };
    expect(service.simulate(commissionOnly, 1000)).toMatchObject({
      chargeAmount: '0.00',
      commissionAmount: '5.00',
    });

    const chargeOnly = {
      ...definition,
      charge: {
        mode: 'FIXED',
        type: 'FIXED',
        value: 50,
        enabled: true,
        payer: 'S',
        ranges: [],
      },
      commission: { ...definition.commission, enabled: false },
    };
    expect(service.simulate(chargeOnly, 1000)).toMatchObject({
      chargeAmount: '50.00',
      commissionAmount: '0.00',
    });
  });

  it('rejects a pricing flow with both lanes disabled', () => {
    expect(() =>
      service.validateDefinition({
        ...definition,
        charge: { ...definition.charge, enabled: false },
        commission: { ...definition.commission, enabled: false },
      }),
    ).toThrow('At least one of charge or commission must be enabled');
  });

  it('rejects overlapping flexible ranges', () => {
    expect(() => service.validateDefinition({
      ...definition,
      charge: {
        ...definition.charge,
        ranges: [
          { minimumAmount: 0, maximumAmount: 1000, type: 'FIXED', value: 100 },
          { minimumAmount: 1000, maximumAmount: 5000, type: 'FIXED', value: 200 },
        ],
      },
    })).toThrow('Flexible charge ranges cannot overlap');
  });

  it('rejects an unsafe percentage', () => {
    expect(() => service.validateDefinition({
      ...definition,
      charge: { ...definition.charge, value: 101 },
    })).toThrow('Charge percentage cannot exceed 100');
  });
});
