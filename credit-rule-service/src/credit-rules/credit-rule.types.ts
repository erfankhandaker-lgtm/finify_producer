export type SourceType = 'AI_RESULT' | 'DECISION_INPUT' | 'POSTGRES' | 'HTTP_API';
export type DataType = 'STRING' | 'DECIMAL' | 'INTEGER' | 'BOOLEAN' | 'DATE' | 'DATETIME';
export type ReadMode = 'SINGLE' | 'LATEST' | 'SUM' | 'AVERAGE' | 'COUNT' | 'MINIMUM' | 'MAXIMUM' | 'EXISTS';
export type DecisionOutcome =
  | 'PROCESSING'
  | 'AUTO_APPROVED'
  | 'COUNTER_OFFER'
  | 'MANUAL_REVIEW'
  | 'REJECTED'
  | 'RESCORE_REQUIRED'
  | 'NO_MASTER_RULE'
  | 'DATA_SOURCE_UNAVAILABLE';

export interface ConditionLeaf {
  field?: string;
  dataType?: DataType;
  operator:
    | 'EQUALS'
    | 'NOT_EQUALS'
    | 'GREATER_THAN'
    | 'GREATER_THAN_OR_EQUAL'
    | 'LESS_THAN'
    | 'LESS_THAN_OR_EQUAL'
    | 'BETWEEN'
    | 'RANGE'
    | 'IN'
    | 'NOT_IN'
    | 'IS_NULL'
    | 'IS_NOT_NULL';
  value?: unknown;
  values?: unknown[];
  lowerValue?: unknown;
  upperValue?: unknown;
  lowerInclusive?: boolean;
  upperInclusive?: boolean;
}

export interface ConditionGroup {
  all?: ConditionNode[];
  any?: ConditionNode[];
  not?: ConditionNode;
}

export type ConditionNode = ConditionLeaf | ConditionGroup;

export type RuleActionType =
  | 'CONTINUE'
  | 'REJECT'
  | 'MANUAL_REVIEW'
  | 'SET_LIMIT_FIXED'
  | 'SET_LIMIT_FROM_VALUE'
  | 'SET_LIMIT_FROM_VALUE_MULTIPLIER'
  | 'ADD_LIMIT_FIXED'
  | 'SUBTRACT_LIMIT_FIXED'
  | 'CAP_LIMIT_FIXED'
  | 'CAP_LIMIT_FROM_VALUE_MULTIPLIER'
  | 'SET_CREDIT_OFFER'
  | 'SET_LIMIT_FROM_INPUT_MULTIPLIER';

export interface RuleAction {
  type: RuleActionType;
  value?: number;
  multiplier?: number;
  limit?: number;
  repaymentOptionIds?: string[];
  reasonCode?: string;
  reasonMessage?: string;
  inputField?: string;
  floor?: number;
  cap?: number;
}

export interface HttpIntegrationRow {
  id: string;
  code: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  url_template: string;
  request_template: Record<string, unknown> | null;
  auth_type: 'NONE' | 'API_KEY' | 'BEARER';
  auth_header: string | null;
  auth_secret_env: string | null;
  timeout_ms: number;
  cache_ttl_seconds: number;
  is_active: boolean;
}

export interface ScoreProviderRow {
  id: string;
  code: string;
  name: string;
  http_integration_id: string;
  score_response_path: string;
  category_response_path: string;
  model_id_response_path: string | null;
  model_version_response_path: string | null;
  reference_response_path: string | null;
  scored_at_response_path: string | null;
  score_min: string | null;
  score_max: string | null;
  validity_minutes: number;
  is_default: boolean;
  is_active: boolean;
  provider_mode?: 'HTTP' | 'SUBMITTED';
}

export interface MasterRuleRow {
  id: string;
  rule_code: string;
  version: number;
  name: string;
  customer_category: string;
  product_id: string;
  currency: string | null;
  minimum_score: string | null;
  maximum_score: string | null;
  base_limit: string;
  minimum_limit: string;
  maximum_limit: string;
  default_outcome: 'REJECTED' | 'MANUAL_REVIEW';
  auto_approval_enabled: boolean;
  default_repayment_option_ids: string[];
  score_provider_id: string | null;
  status: string;
  effective_from: string | null;
  effective_to: string | null;
  created_by: string;
}

export interface CreditRuleRow {
  id: string;
  master_rule_id: string;
  name: string;
  description: string | null;
  priority: number;
  exclusive_group: string | null;
  source_type: SourceType;
  ai_result_field: string | null;
  schema_name: string | null;
  table_name: string | null;
  lookup_column: string | null;
  value_column: string | null;
  read_mode: ReadMode | null;
  order_by_column: string | null;
  http_integration_id: string | null;
  response_path: string | null;
  data_type: DataType;
  condition_json: ConditionNode;
  action_on_match: RuleAction;
  action_on_no_match: RuleAction;
  source_failure_action: RuleAction;
  stop_on_match: boolean;
  stop_on_no_match: boolean;
  is_active: boolean;
}

export interface AiResult {
  score: number;
  category: string;
  modelId?: string;
  modelVersion?: string;
  scoredAt?: string;
  expiresAt?: string;
  referenceId?: string;
}

export interface EvaluationContext {
  executionId: string;
  customerId: string;
  applicationId?: string;
  productId: string;
  currency?: string;
  requestedAmount: number;
  existingExposure: number;
  pendingReservations: number;
  aiResult: AiResult;
  simulation: boolean;
  currentLimit: number;
  outcome: DecisionOutcome;
  reasonCodes: string[];
  repaymentOptionIds: string[];
  matchedExclusiveGroups: Set<string>;
  decisionInputs: Record<string, unknown>;
}
