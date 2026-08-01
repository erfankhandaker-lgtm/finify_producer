const assert = require('node:assert/strict');
const test = require('node:test');
const { ApiKeyGuard } = require('../dist/api-key.guard');

function context(key) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-admin-api-key': key } }),
    }),
  };
}

test('KYC API key guard accepts only the configured internal credential', () => {
  const original = process.env.KYC_ADMIN_API_KEY;
  process.env.KYC_ADMIN_API_KEY = 'test-internal-credential';
  try {
    const guard = new ApiKeyGuard();
    assert.equal(guard.canActivate(context('test-internal-credential')), true);
    assert.throws(
      () => guard.canActivate(context('wrong-internal-credential')),
      /Valid KYC service credentials are required/,
    );
  } finally {
    if (original === undefined) delete process.env.KYC_ADMIN_API_KEY;
    else process.env.KYC_ADMIN_API_KEY = original;
  }
});
