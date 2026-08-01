const test = require('node:test');
const assert = require('node:assert/strict');
const { HealthController } = require('../dist/health.controller');

test('reports healthy only when Kafka has joined its consumer group', () => {
  const response = { statusCode: 0, status(code) { this.statusCode = code; } };
  const controller = new HealthController({
    health: () => ({
      ready: true,
      status: 'connected',
      topics: ['PMNT'],
      lastGroupJoinAt: '2026-07-27T00:00:00.000Z',
      lastError: null,
    }),
  });
  const result = controller.health(response);
  assert.equal(response.statusCode, 200);
  assert.equal(result.status, 'ok');
  assert.equal(result.kafka.ready, true);
});

test('reports 503 while Kafka is disconnected', () => {
  const response = { statusCode: 0, status(code) { this.statusCode = code; } };
  const controller = new HealthController({
    health: () => ({
      ready: false,
      status: 'disconnected',
      topics: ['PMNT'],
      lastGroupJoinAt: null,
      lastError: 'Failed to find group coordinator',
    }),
  });
  const result = controller.health(response);
  assert.equal(response.statusCode, 503);
  assert.equal(result.status, 'degraded');
  assert.equal(result.kafka.ready, false);
});
