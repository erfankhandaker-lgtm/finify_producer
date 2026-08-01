const test = require('node:test');
const assert = require('node:assert/strict');
const { EodSchedulerService } = require('../dist/eod/eod-scheduler.service');

function scheduler({ periodState, outcomes = [] }) {
  const calls = [];
  const config = {
    get(key, fallback) {
      if (key === 'ACCOUNTING_REPORTING_ENTITY') return 'FINIFY_UK';
      if (key === 'ACCOUNTING_CATCH_UP_MAX_DAYS_PER_TICK') return 31;
      return fallback;
    },
  };
  const configurations = {
    activeCurrencies: async () => [
      { currency: 'GBP', businessTimezone: 'Europe/London', cutoffTime: '00:00:00' },
    ],
  };
  const orchestration = {
    runOne: async input => {
      calls.push(input);
      return outcomes.shift() ?? { status: 'CLOSED' };
    },
  };
  const dataSource = {
    query: async sql => {
      if (sql.includes('UPDATE public.sw_tbl_eod_schedule SET') && sql.includes('RETURNING')) {
        return [{ reportingEntity: 'FINIFY_UK', enabled: true, businessTimezone: 'Europe/London', closureTime: '00:05:00' }];
      }
      if (sql.includes('FROM public.sw_tbl_accounting_period')) return [periodState];
      return [];
    },
  };
  const accountingLog = { info() {}, error() {} };
  return {
    calls,
    service: new EodSchedulerService(config, configurations, orchestration, dataSource, accountingLog),
  };
}

test('catches up every overdue date oldest-first after downtime', async () => {
  const { service, calls } = scheduler({
    periodState: { lastClosed: '2026-07-21', earliestOpen: null },
  });
  const result = await service.runCatchUp(new Date('2026-07-25T00:05:00Z'));
  assert.deepEqual(calls.map(call => call.businessDate), [
    '2026-07-22', '2026-07-23', '2026-07-24',
  ]);
  assert.ok(calls.every(call => call.requestedBy === 'EOD_CATCH_UP_SCHEDULER'));
  assert.equal(result.status, 'COMPLETED');
});

test('stops catch-up when an earlier date is blocked', async () => {
  const { service, calls } = scheduler({
    periodState: { lastClosed: '2026-07-21', earliestOpen: null },
    outcomes: [{ status: 'BLOCKED' }],
  });
  const result = await service.runCatchUp(new Date('2026-07-25T00:05:00Z'));
  assert.deepEqual(calls.map(call => call.businessDate), ['2026-07-22']);
  assert.equal(result.status, 'BLOCKED');
});
