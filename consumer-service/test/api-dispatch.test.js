const test = require('node:test');
const assert = require('node:assert/strict');
const { FieldMappingService } = require('../dist/transactions/field-mapping.service.js');
const { IntegrationSecretService } = require('../dist/transactions/integration-secret.service.js');
const { MerchantDispatchService } = require('../dist/transactions/merchant-dispatch.service.js');

test('logs in, maps tagged API fields, uses bearer token and interprets response', async (t) => {
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    requests.push({ url: String(url), authorization: init.headers.Authorization, body: JSON.parse(init.body) });
    return String(url).endsWith('/login')
      ? new Response(JSON.stringify({ data: { token: 'merchant-token', expiresIn: 300 } }), { status: 200 })
      : new Response(JSON.stringify({ result: { status: 'ACCEPTED', reference: 'EXT-100' } }), { status: 200 });
  };
  t.after(() => { global.fetch = originalFetch; });
  const configService = { get: (key, fallback) => key === 'INTEGRATION_SECRET_KEY'
    ? 'unit-test-integration-secret-key-32-characters' : fallback };
  const secrets = new IntegrationSecretService(configService);
  const dispatch = new MerchantDispatchService(
    new FieldMappingService(),
    secrets,
    { publish: async () => { throw new Error('Kafka should not be used'); } },
    configService,
  );
  const config = {
    id: '1', merchantMsisdn: '447700000001', merchantType: 'Special', channel: 'API', version: 3, active: true,
    apiUrl: 'https://merchant.example.test/payments', apiMethod: 'POST', kafkaTopic: null,
    kafkaMessageKeySource: null, timeoutMs: 5000, maxRetries: 1, callbackAuthType: 'NONE', callbackSecretCiphertext: null,
    requestMapping: [
      { source: 'message.TransactionId', target: 'payment.id', required: true },
      { source: 'message.Amount', target: 'payment.amount', type: 'decimal' },
    ],
    responseMapping: {
      decisionPath: 'result.status', approvedValues: ['ACCEPTED'], rejectedValues: ['REJECTED'],
      externalReferencePath: 'result.reference',
    },
    auth: {
      type: 'LOGIN_BEARER', loginUrl: 'https://merchant.example.test/login', loginMethod: 'POST',
      loginMapping: [
        { source: 'secret.username', target: 'username' },
        { source: 'secret.password', target: 'password' },
      ],
      loginHeaders: {}, tokenPath: 'data.token', expiresInPath: 'data.expiresIn', tokenPrefix: 'Bearer',
      finalHeader: 'Authorization', secretsCiphertext: secrets.encryptObject({ username: 'merchant', password: 'pin' }),
    },
  };
  const result = await dispatch.dispatch(config, { TransactionId: '100', Amount: '25.5' },
    { transactionId: '100' }, 'correlation-100', 'idempotency-100');

  assert.equal(result.decision, 'APPROVED');
  assert.equal(result.externalReference, 'EXT-100');
  assert.deepEqual(requests[0].body, { username: 'merchant', password: 'pin' });
  assert.equal(requests[1].authorization, 'Bearer merchant-token');
  assert.equal(requests[1].body.payment.amount, '25.50');
  assert.equal(requests[1].body._finify.correlationId, 'correlation-100');
});
