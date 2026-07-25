const test = require('node:test');
const assert = require('node:assert/strict');
const { AmlSummaryService } = require('../dist/transactions/aml-summary.service');

test('finalizes a completed AML reservation', async () => {
  const service = new AmlSummaryService({ query: async () => [{
    success: true, status_code: 'COMPLETED', status_message: 'ok', reservation_status: 'COMPLETED',
  }] });
  const result = await service.finalize('10', 'COMPLETED');
  assert.equal(result.success, true);
  assert.equal(result.statusCode, 'COMPLETED');
});

test('allows old and system-keyword messages without a reservation', async () => {
  const service = new AmlSummaryService({ query: async () => [{
    success: false, status_code: 'RESERVATION_NOT_FOUND', status_message: 'missing', reservation_status: null,
  }] });
  const result = await service.finalize('10', 'COMPLETED');
  assert.equal(result.success, false);
  assert.equal(result.statusCode, 'RESERVATION_NOT_FOUND');
});

test('throws when AML finalization is inconsistent', async () => {
  const service = new AmlSummaryService({ query: async () => [{
    success: false, status_code: 'INVALID_STATE', status_message: 'bad', reservation_status: 'RELEASED',
  }] });
  await assert.rejects(() => service.finalize('10', 'COMPLETED'), /AML completed failed/);
});
