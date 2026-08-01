export type FlowNodeId =
  | 'trigger'
  | 'route'
  | 'condition'
  | 'charge'
  | 'commission'
  | 'settlement';

export type CalculationType = 'FIXED' | 'PERCENTAGE';
export type Party = 'S' | 'D';

export type PricingCalculation = {
  id: string;
  name: string;
  type: CalculationType;
  value: number;
  minimum?: number;
  maximum?: number;
};

export type ChargeRange = {
  id: string;
  minimumAmount: number;
  maximumAmount?: number;
  chargeCalculationId: string;
};

export type CommissionRange = {
  id: string;
  minimumAmount: number;
  maximumAmount?: number;
  commissionCalculationId: string;
};

export type PricingFlowDefinition = {
  trigger: { keyword: string; keywords: string[]; currency: string };
  route: {
    sourceWalletType: number;
    sourceWalletTypes: number[];
    destinationWalletType?: number;
    destinationWalletTypes: number[];
  };
  condition: { minimumAmount: number; maximumAmount?: number };
  charge: {
    enabled: boolean;
    mode: 'FIXED' | 'FLEXIBLE';
    type: CalculationType;
    value: number;
    minimum?: number;
    maximum?: number;
    payer: Party;
    calculations: PricingCalculation[];
    defaultCalculationId: string;
    ranges: ChargeRange[];
  };
  commission: {
    enabled: boolean;
    mode: 'FIXED' | 'FLEXIBLE';
    type: CalculationType;
    value: number;
    minimum?: number;
    maximum?: number;
    receiver: Party;
    calculations: PricingCalculation[];
    defaultCalculationId: string;
    ranges: CommissionRange[];
  };
  settlement: { chargeWalletType: number; commissionWalletType: number };
};

export type PricingFlowRecord = {
  id: string;
  ruleCode: string;
  version: number;
  name: string;
  keyword: string;
  sourceWalletType: number;
  destinationWalletType?: number;
  currency: string;
  priority: number;
  status: string;
  definition: PricingFlowDefinition;
  createdBy: string;
  modifiedBy?: string;
  approvedBy?: string;
  updatedAt: string;
};

export type PricingSimulation = {
  matched: boolean;
  routeMatched: boolean;
  sourceWalletType?: number;
  destinationWalletType?: number;
  transactionAmount: string;
  chargeAmount: string;
  commissionAmount: string;
  sourceDebitAmount: string;
  destinationCreditAmount: string;
  chargePayer: Party;
  commissionReceiver: Party;
  chargeCalculationType: CalculationType;
  chargeCalculationValue: number;
  chargeCalculationId: string;
  commissionCalculationType?: CalculationType;
  commissionCalculationValue?: number;
  commissionCalculationId?: string;
  matchedChargeRange?: {
    id: string;
    index: number;
    minimumAmount: number;
    maximumAmount?: number;
    chargeCalculationId: string;
  };
  matchedCommissionRange?: {
    id: string;
    index: number;
    minimumAmount: number;
    maximumAmount?: number;
    commissionCalculationId: string;
  };
  currency: string;
  trace: Array<{
    node: string;
    status: 'PASSED' | 'SKIPPED' | 'FAILED';
    detail: string;
  }>;
};

export const blankPricingFlow = (): PricingFlowDefinition => ({
  trigger: { keyword: 'PMNT', keywords: ['PMNT'], currency: 'UGX' },
  route: {
    sourceWalletType: 1,
    sourceWalletTypes: [1],
    destinationWalletType: 2,
    destinationWalletTypes: [2],
  },
  condition: { minimumAmount: 0, maximumAmount: 10000000 },
  charge: {
    enabled: true,
    mode: 'FLEXIBLE',
    type: 'PERCENTAGE',
    value: 2.5,
    minimum: 500,
    maximum: 25000,
    payer: 'S',
    calculations: [
      {
        id: 'charge-standard',
        name: 'Standard fixed charge',
        type: 'FIXED',
        value: 500,
      },
      {
        id: 'charge-percentage',
        name: 'Percentage charge',
        type: 'PERCENTAGE',
        value: 2.5,
        minimum: 500,
        maximum: 25000,
      },
    ],
    defaultCalculationId: 'charge-standard',
    ranges: [
      {
        id: 'amount-range-1',
        minimumAmount: 0,
        maximumAmount: 100000,
        chargeCalculationId: 'charge-standard',
      },
      {
        id: 'amount-range-2',
        minimumAmount: 100000.01,
        maximumAmount: 10000000,
        chargeCalculationId: 'charge-percentage',
      },
    ],
  },
  commission: {
    enabled: true,
    mode: 'FIXED',
    type: 'PERCENTAGE',
    value: 0.5,
    minimum: 100,
    maximum: 5000,
    receiver: 'D',
    calculations: [
      {
        id: 'commission-standard',
        name: 'Standard commission',
        type: 'PERCENTAGE',
        value: 0.5,
        minimum: 100,
        maximum: 5000,
      },
    ],
    defaultCalculationId: 'commission-standard',
    ranges: [
      {
        id: 'commission-range-1',
        minimumAmount: 0,
        maximumAmount: 10000000,
        commissionCalculationId: 'commission-standard',
      },
    ],
  },
  settlement: { chargeWalletType: 113, commissionWalletType: 114 },
});

export const flowNodeOrder: FlowNodeId[] = [
  'trigger',
  'route',
  'condition',
  'charge',
  'commission',
  'settlement',
];

export function nodeSummary(node: FlowNodeId, definition: PricingFlowDefinition) {
  if (node === 'trigger') {
    return `${definition.trigger.keywords.join(', ')} / ${definition.trigger.currency}`;
  }
  if (node === 'route') {
    return `${definition.route.sourceWalletTypes.join(', ')} → ${
      definition.route.destinationWalletTypes.length
        ? definition.route.destinationWalletTypes.join(', ')
        : 'ANY'
    }`;
  }
  if (node === 'condition') {
    return definition.charge.mode === 'FIXED'
      ? 'BYPASSED / FIXED'
      : `${definition.charge.ranges.length} AMOUNT RANGE${
          definition.charge.ranges.length === 1 ? '' : 'S'
        }`;
  }
  if (node === 'charge') {
    return definition.charge.enabled ? `${definition.charge.mode} / ${
      definition.charge.mode === 'FIXED'
        ? `${definition.charge.calculations.find(
            (calculation) => calculation.id === definition.charge.defaultCalculationId,
          )?.name || 'DEFAULT'}`
        : `${definition.charge.calculations.length} CALCULATIONS`
    }` : 'DISABLED';
  }
  if (node === 'commission') {
    return definition.commission.enabled
      ? `${definition.commission.mode} / ${definition.commission.calculations.length} CALC${
          definition.commission.calculations.length === 1 ? '' : 'S'
        }`
      : 'DISABLED';
  }
  return `${definition.settlement.chargeWalletType} / ${definition.settlement.commissionWalletType}`;
}

export function pricingFlowErrors(definition: PricingFlowDefinition) {
  const errors: string[] = [];
  if (!definition.trigger.keywords.length) errors.push('At least one transaction keyword is required.');
  if (!/^[A-Z]{3,8}$/.test(definition.trigger.currency)) {
    errors.push('Currency must contain 3–8 uppercase letters.');
  }
  if (
    !definition.route.sourceWalletTypes.length ||
    definition.route.sourceWalletTypes.some(
      (walletType) => !Number.isInteger(walletType) || walletType < 1,
    )
  ) {
    errors.push('At least one valid source wallet type is required.');
  }
  if (!['FIXED', 'FLEXIBLE'].includes(definition.charge.mode)) {
    errors.push('Charge mode must be fixed or flexible.');
  }
  if (!['FIXED', 'FLEXIBLE'].includes(definition.commission.mode)) {
    errors.push('Commission mode must be fixed or flexible.');
  }
  if (!definition.charge.enabled && !definition.commission.enabled) {
    errors.push('Enable charge, commission, or both.');
  }
  const calculations = [
    ...definition.charge.calculations.map((rule) => ['Charge', rule] as const),
    ...definition.commission.calculations.map((rule) => ['Commission', rule] as const),
  ];
  for (const [name, rule] of calculations) {
    if (!Number.isFinite(rule.value) || rule.value < 0) errors.push(`${name} value is invalid.`);
    if (rule.type === 'PERCENTAGE' && rule.value > 100) {
      errors.push(`${name} percentage cannot exceed 100.`);
    }
    if (
      rule.minimum !== undefined &&
      rule.maximum !== undefined &&
      rule.maximum < rule.minimum
    ) {
      errors.push(`${name} maximum must be greater than or equal to its minimum.`);
    }
  }
  if (definition.charge.enabled && definition.charge.mode === 'FLEXIBLE') {
    if (!definition.charge.ranges.length) {
      errors.push('Flexible charge requires at least one amount range.');
    }
    const ranges = [...definition.charge.ranges].sort(
      (left, right) => left.minimumAmount - right.minimumAmount,
    );
    ranges.forEach((range, index) => {
      if (range.minimumAmount < 0) errors.push(`Range ${index + 1} minimum cannot be negative.`);
      if (range.maximumAmount !== undefined && range.maximumAmount < range.minimumAmount) {
        errors.push(`Range ${index + 1} maximum is below its minimum.`);
      }
      if (index > 0) {
        const previous = ranges[index - 1];
        if (
          previous.maximumAmount === undefined ||
          range.minimumAmount <= previous.maximumAmount
        ) {
          errors.push('Flexible charge ranges cannot overlap.');
        }
      }
      if (!definition.charge.calculations.some(
        (calculation) => calculation.id === range.chargeCalculationId,
      )) {
        errors.push(`Range ${index + 1} has no valid charge calculation.`);
      }
    });
  }
  if (definition.commission.enabled && definition.commission.mode === 'FLEXIBLE') {
    if (!definition.commission.ranges.length) {
      errors.push('Flexible commission requires at least one amount range.');
    }
    const ranges = [...definition.commission.ranges].sort(
      (left, right) => left.minimumAmount - right.minimumAmount,
    );
    ranges.forEach((range, index) => {
      if (range.minimumAmount < 0) {
        errors.push(`Commission range ${index + 1} minimum cannot be negative.`);
      }
      if (
        range.maximumAmount !== undefined &&
        range.maximumAmount < range.minimumAmount
      ) {
        errors.push(`Commission range ${index + 1} maximum is below its minimum.`);
      }
      if (index > 0) {
        const previous = ranges[index - 1];
        if (
          previous.maximumAmount === undefined ||
          range.minimumAmount <= previous.maximumAmount
        ) {
          errors.push('Flexible commission ranges cannot overlap.');
        }
      }
      if (
        !definition.commission.calculations.some(
          (calculation) =>
            calculation.id === range.commissionCalculationId,
        )
      ) {
        errors.push(
          `Commission range ${index + 1} has no valid calculation.`,
        );
      }
    });
  }
  return errors;
}
