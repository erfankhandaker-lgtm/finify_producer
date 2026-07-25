const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretMerchantConfirmation } = require('../dist/transactions/merchant-confirmation.js');

test('accepts an explicit approved response', () => {
  assert.deepEqual(
    interpretMerchantConfirmation(200, { approved: true, code: '00', message: 'accepted' }),
    { decision: 'APPROVED', code: '00', message: 'accepted' },
  );
});

test('accepts a nested confirmation status', () => {
  assert.equal(
    interpretMerchantConfirmation(200, { data: { status: 'CONFIRMED' } }).decision,
    'APPROVED',
  );
});

test('recognizes an explicit merchant rejection', () => {
  assert.equal(
    interpretMerchantConfirmation(422, { status: 'DECLINED', message: 'order rejected' }).decision,
    'REJECTED',
  );
});

test('keeps timeouts and ambiguous success responses unknown', () => {
  assert.equal(interpretMerchantConfirmation(504, {}).decision, 'UNKNOWN');
  assert.equal(interpretMerchantConfirmation(200, { message: 'received' }).decision, 'UNKNOWN');
});
