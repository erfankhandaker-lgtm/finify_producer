'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requestedDecision } = require('../server');

test('approves normal references', () => {
  assert.equal(requestedDecision({ reference: 'E2E-SUCCESS' }), 'APPROVED');
});

test('rejects negative references', () => {
  assert.equal(requestedDecision({ reference: 'E2E-REJECT' }), 'REJECTED');
});

test('supports timeout simulation', () => {
  assert.equal(requestedDecision({ referenceId: 'E2E-TIMEOUT' }), 'TIMEOUT');
});
