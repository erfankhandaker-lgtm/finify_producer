export type PricingCalculationType = 'FIXED' | 'PERCENTAGE';
export type PricingParty = 'S' | 'D';

export interface PricingAmountRule {
  type: PricingCalculationType;
  value: number;
  minimum?: number;
  maximum?: number;
}

export interface PricingCalculation extends PricingAmountRule {
  id: string;
  name: string;
}

export interface PricingChargeRange {
  id: string;
  minimumAmount: number;
  maximumAmount?: number;
  chargeCalculationId: string;
}

export interface PricingCommissionRange {
  id: string;
  minimumAmount: number;
  maximumAmount?: number;
  commissionCalculationId: string;
}

export interface PricingFlowDefinition {
  trigger: {
    keyword: string;
    keywords: string[];
    currency: string;
  };
  route: {
    sourceWalletType: number;
    sourceWalletTypes: number[];
    destinationWalletType?: number;
    destinationWalletTypes: number[];
  };
  condition: {
    minimumAmount: number;
    maximumAmount?: number;
  };
  charge: PricingAmountRule & {
    enabled: boolean;
    mode: 'FIXED' | 'FLEXIBLE';
    payer: PricingParty;
    calculations: PricingCalculation[];
    defaultCalculationId: string;
    ranges: PricingChargeRange[];
  };
  commission: PricingAmountRule & {
    enabled: boolean;
    mode: 'FIXED' | 'FLEXIBLE';
    receiver: PricingParty;
    calculations: PricingCalculation[];
    defaultCalculationId: string;
    ranges: PricingCommissionRange[];
  };
  settlement: {
    chargeWalletType: number;
    commissionWalletType: number;
  };
}

export interface PricingFlowRecord {
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
  createdAt: Date;
  updatedAt: Date;
}

export interface PricingSimulation {
  matched: boolean;
  routeMatched: boolean;
  sourceWalletType?: number;
  destinationWalletType?: number;
  transactionAmount: string;
  chargeAmount: string;
  commissionAmount: string;
  sourceDebitAmount: string;
  destinationCreditAmount: string;
  chargePayer: PricingParty;
  commissionReceiver: PricingParty;
  chargeCalculationType: PricingCalculationType;
  chargeCalculationValue: number;
  chargeCalculationId: string;
  commissionCalculationType?: PricingCalculationType;
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
  trace: Array<{ node: string; status: 'PASSED' | 'SKIPPED' | 'FAILED'; detail: string }>;
}
