const assert = require('node:assert/strict');
const test = require('node:test');
const { BadRequestException } = require('@nestjs/common');
const { ConditionEngineService } = require('../dist/credit-rules/condition-engine.service');

test('evaluates open and closed numeric ranges', () => {
  const engine = new ConditionEngineService();
  const open = {
    operator: 'RANGE',
    lowerValue: 50,
    upperValue: 200,
    lowerInclusive: false,
    upperInclusive: false
  };
  assert.equal(engine.evaluate(open, 50, 'DECIMAL'), false);
  assert.equal(engine.evaluate(open, 125, 'DECIMAL'), true);
  assert.equal(engine.evaluate(open, 200, 'DECIMAL'), false);

  const closed = { operator: 'BETWEEN', lowerValue: 50, upperValue: 200 };
  assert.equal(engine.evaluate(closed, 50, 'INTEGER'), true);
  assert.equal(engine.evaluate(closed, 200, 'INTEGER'), true);
});

test('supports nested AND, OR, and NOT groups', () => {
  const engine = new ConditionEngineService();
  const condition = {
    all: [
      { operator: 'GREATER_THAN', value: 50 },
      {
        any: [
          { operator: 'LESS_THAN', value: 100 },
          { not: { operator: 'LESS_THAN_OR_EQUAL', value: 200 } }
        ]
      }
    ]
  };
  engine.validate(condition);
  assert.equal(engine.evaluate(condition, 75, 'DECIMAL'), true);
  assert.equal(engine.evaluate(condition, 150, 'DECIMAL'), false);
  assert.equal(engine.evaluate(condition, 250, 'DECIMAL'), true);
});

test('coerces booleans and dates consistently', () => {
  const engine = new ConditionEngineService();
  assert.equal(engine.evaluate({ operator: 'EQUALS', value: true }, 'yes', 'BOOLEAN'), true);
  assert.equal(
    engine.evaluate({ operator: 'GREATER_THAN', value: '2026-01-01' }, '2026-02-01', 'DATE'),
    true
  );
});

test('evaluates mixed decision-input fields with leaf-specific data types', () => {
  const engine = new ConditionEngineService();
  const condition = {
    all: [
      { field: 'grade', dataType: 'STRING', operator: 'IN', values: ['A', 'B', 'C'] },
      { field: 'dominantCashFlow', dataType: 'DECIMAL', operator: 'GREATER_THAN', value: 300000 },
      { field: 'kycVerified', dataType: 'BOOLEAN', operator: 'EQUALS', value: true }
    ]
  };
  engine.validate(condition);
  assert.equal(engine.evaluate(condition, { grade: 'A', dominantCashFlow: 400000, kycVerified: true }, 'STRING'), true);
  assert.equal(engine.evaluate(condition, { grade: 'D', dominantCashFlow: 400000, kycVerified: true }, 'STRING'), false);
});

test('rejects invalid condition and action definitions', () => {
  const engine = new ConditionEngineService();
  assert.throws(
    () => engine.validate({ operator: 'RANGE', lowerValue: 200, upperValue: 50 }),
    BadRequestException
  );
  assert.throws(
    () => engine.validateAction({ type: 'SET_LIMIT_FIXED' }),
    BadRequestException
  );
  assert.throws(
    () => engine.validateAction({ type: 'SET_CREDIT_OFFER', limit: 1000, repaymentOptionIds: [1] }),
    BadRequestException
  );
});
