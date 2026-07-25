const test = require('node:test');
const assert = require('node:assert/strict');
const { FieldMappingService } = require('../dist/transactions/field-mapping.service.js');

test('maps selectable fields to tagged nested body, headers, query and path', () => {
  const mapper = new FieldMappingService();
  const result = mapper.map([
    { source: 'message.TransactionId', target: 'payment.id', location: 'body', required: true },
    { source: 'message.Amount', target: 'amount', type: 'decimal' },
    { source: 'secret.clientId', target: 'x-client-id', location: 'header' },
    { source: 'system.correlationId', target: 'correlation', location: 'query' },
    { source: 'message.Destination', target: 'merchantId', location: 'path' },
  ], {
    message: { TransactionId: '123', Amount: '10.5', Destination: '447700000001' },
    transaction: {},
    system: { correlationId: 'abc' },
    secret: { clientId: 'finify' },
  });

  assert.deepEqual(result, {
    body: { payment: { id: '123' }, amount: '10.50' },
    headers: { 'x-client-id': 'finify' },
    query: { correlation: 'abc' },
    path: { merchantId: '447700000001' },
  });
});

test('rejects a missing required source', () => {
  const mapper = new FieldMappingService();
  assert.throws(() => mapper.map([
    { source: 'message.TransactionId', target: 'id', required: true },
  ], { message: {}, transaction: {}, system: {}, secret: {} }), /has no value/);
});
