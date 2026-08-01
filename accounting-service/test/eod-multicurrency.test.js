const test = require('node:test');
const assert = require('node:assert/strict');
const { EodOrchestrationService } = require('../dist/eod/eod-orchestration.service');

const silentLog = { info() {}, error() {} };

test('all-currency validation is partial when a currency in use is not configured', async () => {
  const updates = [];
  const service = new EodOrchestrationService(
    {
      currencyUniverse: async () => [
        { currency: 'GBP', configured: true },
        { currency: 'UGX', configured: false },
      ],
    },
    {},
    {},
    { query: async (sql, values) => { updates.push({ sql, values }); } },
    silentLog,
  );
  service.runOne = async input => ({
    status: 'READY',
    readyForClose: true,
    currency: input.currency,
  });

  const result = await service.runAll({
    businessDate: '2026-07-31',
    reportingEntity: 'FINIFY_UK',
    requestedBy: 'tester',
    dryRun: true,
  });

  assert.equal(result.status, 'PARTIAL');
  assert.deepEqual(result.summary, { expected: 2, successful: 1, blocked: 1, failed: 0 });
  assert.equal(result.currencies[1].error, 'ACCOUNTING_CONFIGURATION_MISSING');
  assert.equal(updates[0].values[2], 'PARTIAL');
});

test('all-currency close is completed only when every expected currency closes', async () => {
  const service = new EodOrchestrationService(
    {
      currencyUniverse: async () => [
        { currency: 'GBP', configured: true },
        { currency: 'UGX', configured: true },
        { currency: 'USD', configured: true },
      ],
    },
    {},
    {},
    { query: async () => undefined },
    silentLog,
  );
  service.runOne = async () => ({ status: 'CLOSED', readyForClose: true });

  const result = await service.runAll({
    businessDate: '2026-07-31',
    reportingEntity: 'FINIFY_UK',
    requestedBy: 'tester',
    dryRun: false,
  });

  assert.equal(result.status, 'COMPLETED');
  assert.deepEqual(result.summary, { expected: 3, successful: 3, blocked: 0, failed: 0 });
  assert.ok(result.currencies.every(currency => currency.status === 'CLOSED'));
});
