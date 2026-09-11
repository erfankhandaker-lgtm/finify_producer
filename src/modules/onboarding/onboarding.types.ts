export type JourneyVersionStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'ACTIVE'
  | 'REJECTED'
  | 'RETIRED';

export type JourneyNodeType =
  | 'START'
  | 'END'
  | 'PHONE_CAPTURE'
  | 'OTP_VERIFICATION'
  | 'PIN_SETUP'
  | 'CONSENT'
  | 'FORM'
  | 'KYC'
  | 'WALLET_ALLOCATION'
  | 'CREDIT_SCORE'
  | 'CREDIT_POLICY'
  | 'LIMIT_ALLOCATION'
  | 'DECISION'
  | 'CHANNEL_HANDOFF'
  | 'MANUAL_REVIEW';

export interface JourneyScopeInput {
  countryCode: string;
  channelCode: string;
  customerType: string;
  priority: number;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export interface JourneyNodeInput {
  key: string;
  type: JourneyNodeType;
  name: string;
  configuration: Record<string, unknown>;
  position: { x: number; y: number };
  entry?: boolean;
}

export interface JourneyTransitionInput {
  from: string;
  to: string;
  outcome: string;
  priority: number;
  condition?: Record<string, unknown>;
}

export interface JourneyGraphInput {
  scopes: JourneyScopeInput[];
  nodes: JourneyNodeInput[];
  transitions: JourneyTransitionInput[];
}

export interface JourneyValidationIssue {
  severity: 'ERROR' | 'WARNING';
  code: string;
  message: string;
  nodeKey?: string;
}

export interface JourneyValidationResult {
  valid: boolean;
  issues: JourneyValidationIssue[];
}
