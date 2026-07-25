const test = require('node:test');
const assert = require('node:assert/strict');
const { EodCloseService } = require('../dist/eod/eod-close.service');

test('calls the atomic EOD procedure and returns its structured result', async () => {
  const expected = {
    success: true,
    status_code: 'DRY_RUN_PASSED',
    run_status: 'VALIDATED',
    batch_id: '1',
    run_id: '2',
    total_debit: '10.00',
    total_credit: '10.00',
    journal_count: '1',
    entry_count: '2',
    wallet_count: '3',
    master_balance: '100.00',
    safeguarded_liability: '100.00',
    safeguarding_variance: '0.00',
    exception_count: '0',
  };
  const calls = [];
  const dataSource = { query: async (sql, args) => { calls.push({ sql, args }); return [expected]; } };
  const logger = { info() {}, error() {} };
  const service = new EodCloseService(dataSource, logger);
  const result = await service.execute({
    businessDate: '2026-07-25',
    currency: 'gbp',
    reportingEntity: 'FINIFY_UK',
    requestedBy: 'tester',
    dryRun: true,
    correlationId: 'test-1',
  });
  assert.equal(result, expected);
  assert.match(calls[0].sql, /sw_proc_accounting_close_eod/);
  assert.deepEqual(calls[0].args.slice(0, 5), ['2026-07-25', 'GBP', 'FINIFY_UK', 'tester', true]);
});
