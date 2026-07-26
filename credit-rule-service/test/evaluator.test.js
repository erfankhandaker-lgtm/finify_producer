const assert = require('node:assert/strict');
const test = require('node:test');
const { ConditionEngineService } = require('../dist/credit-rules/condition-engine.service');
const { CreditRuleEvaluatorService } = require('../dist/credit-rules/credit-rule-evaluator.service');

function makeHarness(rules, sourceValues = {}) {
  const state = { final: null, steps: [], sourceQueries: 0 };
  const master = {
    id: '21',
    rule_code: 'RETAIL_STANDARD',
    version: 3,
    name: 'Retail standard',
    customer_category: 'PRIME',
    product_id: 'CASH-1',
    currency: 'GBP',
    minimum_score: '600',
    maximum_score: '900',
    base_limit: '0',
    minimum_limit: '100',
    maximum_limit: '5000',
    default_outcome: 'REJECTED',
    auto_approval_enabled: true,
    default_repayment_option_ids: [],
    score_provider_id: null,
    status: 'ACTIVE',
    effective_from: null,
    effective_to: null,
    created_by: 'maker'
  };
  const dataSource = {
    async query(sql, params = []) {
      const text = sql.replace(/\s+/g, ' ');
      if (text.includes('INSERT INTO public.credit_rule_executions(')) return [];
      if (text.includes('FROM public.credit_score_providers')) return [];
      if (text.includes('FROM public.credit_master_rules WHERE')) return [master];
      if (text.includes('FROM public.credit_rules') && text.includes('ORDER BY priority,id')) return rules;
      if (text.includes('INSERT INTO public.credit_rule_execution_steps')) {
        state.steps.push({
          ruleId: params[1],
          conditionResult: params[6],
          action: JSON.parse(params[7]),
          limitAfter: params[9],
          outcomeAfter: params[10],
          error: params[12]
        });
        return [];
      }
      if (text.startsWith('SELECT') && text.includes('"public"."customer_metrics"')) {
        state.sourceQueries += 1;
        const column = text.includes('"current_dpd"') ? 'current_dpd' : 'avg_high_cash_flow';
        const value = sourceValues[column];
        if (value instanceof Error) throw value;
        return [{ value }];
      }
      if (text.includes('UPDATE public.credit_rule_executions SET') && text.includes('allocated_limit=$2')) {
        state.final = {
          allocatedLimit: params[1],
          availableLimit: params[2],
          repaymentOptions: JSON.parse(params[3]),
          outcome: params[4],
          reasons: JSON.parse(params[5])
        };
        return [];
      }
      if (text.includes('UPDATE public.credit_rule_executions SET')) return [];
      if (text.includes('FROM public.credit_rule_executions WHERE id=')) {
        return [{
          id: params[0],
          outcome: state.final?.outcome,
          allocatedLimit: state.final?.allocatedLimit,
          availableLimit: state.final?.availableLimit,
          eligibleRepaymentOptionIds: state.final?.repaymentOptions,
          reasonCodes: state.final?.reasons
        }];
      }
      if (text.includes('FROM public.credit_rule_execution_steps step')) return state.steps;
      throw new Error(`Unexpected SQL in test: ${text}`);
    }
  };
  const http = { readPath: (object, path) => path.split('.').reduce((v, key) => v?.[key], object) };
  return {
    state,
    evaluator: new CreditRuleEvaluatorService(dataSource, new ConditionEngineService(), http)
  };
}

function rule(overrides) {
  return {
    id: '1',
    master_rule_id: '21',
    name: 'Rule',
    description: null,
    priority: 10,
    exclusive_group: null,
    source_type: 'AI_RESULT',
    ai_result_field: 'score',
    schema_name: null,
    table_name: null,
    lookup_column: null,
    value_column: null,
    read_mode: null,
    order_by_column: null,
    http_integration_id: null,
    response_path: null,
    data_type: 'DECIMAL',
    condition_json: { operator: 'GREATER_THAN_OR_EQUAL', value: 600 },
    action_on_match: { type: 'CONTINUE' },
    action_on_no_match: { type: 'REJECT', reasonCode: 'SCORE_TOO_LOW' },
    source_failure_action: { type: 'MANUAL_REVIEW', reasonCode: 'SOURCE_FAILED' },
    stop_on_match: false,
    stop_on_no_match: true,
    is_active: true,
    ...overrides
  };
}

const request = {
  customerId: 'customer-1',
  applicationId: 'application-1',
  productId: 'CASH-1',
  currency: 'GBP',
  requestedAmount: 900,
  existingExposure: 100,
  pendingReservations: 0,
  aiResult: { score: 720, category: 'PRIME' },
  forceRescore: false,
  simulation: false
};

test('allocates a category/product offer and EMI options from a cash-flow range', async () => {
  const rules = [
    rule({ id: '1', priority: 10 }),
    rule({
      id: '2',
      priority: 20,
      name: 'Cash-flow band 50 to 200',
      exclusive_group: 'CASH_FLOW_BAND',
      source_type: 'POSTGRES',
      ai_result_field: null,
      schema_name: 'public',
      table_name: 'customer_metrics',
      lookup_column: 'customer_id',
      value_column: 'avg_high_cash_flow',
      read_mode: 'SINGLE',
      condition_json: {
        operator: 'RANGE',
        lowerValue: 50,
        upperValue: 200,
        lowerInclusive: false,
        upperInclusive: false
      },
      action_on_match: {
        type: 'SET_CREDIT_OFFER',
        limit: 1200,
        repaymentOptionIds: ['EMI-3', 'EMI-6']
      },
      action_on_no_match: { type: 'CONTINUE' }
    })
  ];
  const { evaluator, state } = makeHarness(rules, { avg_high_cash_flow: 125 });
  const result = await evaluator.evaluate(request);
  assert.equal(result.outcome, 'AUTO_APPROVED');
  assert.equal(result.allocatedLimit, 1200);
  assert.equal(result.availableLimit, 1100);
  assert.deepEqual(result.eligibleRepaymentOptionIds, ['EMI-3', 'EMI-6']);
  assert.equal(state.steps.length, 2);
});

test('rejects immediately with a reason when DPD fails and does not run later rules', async () => {
  const rules = [
    rule({
      id: '1',
      priority: 10,
      source_type: 'POSTGRES',
      ai_result_field: null,
      schema_name: 'public',
      table_name: 'customer_metrics',
      lookup_column: 'customer_id',
      value_column: 'current_dpd',
      read_mode: 'SINGLE',
      condition_json: { operator: 'LESS_THAN', value: 2 },
      action_on_match: { type: 'CONTINUE' },
      action_on_no_match: { type: 'REJECT', reasonCode: 'DPD_TOO_HIGH' },
      stop_on_no_match: true
    }),
    rule({ id: '2', priority: 20, action_on_match: { type: 'SET_LIMIT_FIXED', value: 5000 } })
  ];
  const { evaluator, state } = makeHarness(rules, { current_dpd: 3 });
  const result = await evaluator.evaluate(request);
  assert.equal(result.outcome, 'REJECTED');
  assert.deepEqual(result.reasonCodes, ['DPD_TOO_HIGH']);
  assert.equal(state.steps.length, 1);
});

test('routes a source failure to manual review and records the error', async () => {
  const rules = [
    rule({
      source_type: 'POSTGRES',
      ai_result_field: null,
      schema_name: 'public',
      table_name: 'customer_metrics',
      lookup_column: 'customer_id',
      value_column: 'current_dpd',
      read_mode: 'SINGLE',
      source_failure_action: { type: 'MANUAL_REVIEW', reasonCode: 'DPD_SOURCE_UNAVAILABLE' }
    })
  ];
  const { evaluator, state } = makeHarness(rules, { current_dpd: new Error('database offline') });
  const result = await evaluator.evaluate(request);
  assert.equal(result.outcome, 'MANUAL_REVIEW');
  assert.deepEqual(result.reasonCodes, ['DPD_SOURCE_UNAVAILABLE']);
  assert.match(state.steps[0].error, /database offline/);
});
