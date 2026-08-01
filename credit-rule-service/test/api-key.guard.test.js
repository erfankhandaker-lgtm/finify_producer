const assert = require('node:assert/strict');
const test = require('node:test');
const { UnauthorizedException } = require('@nestjs/common');
const { AdminApiKeyGuard, EvaluationApiKeyGuard } = require('../dist/common/api-key.guard');

function config(values) {
  return {
    get(key) {
      return values[key];
    }
  };
}

function context(apiKey) {
  return {
    switchToHttp() {
      return {
        getRequest() {
          return {
            header(name) {
              return name === 'x-api-key' ? apiKey : undefined;
            }
          };
        }
      };
    }
  };
}

test('admin guard permits an unconfigured key only outside production', () => {
  const guard = new AdminApiKeyGuard(config({ NODE_ENV: 'development' }));
  assert.equal(guard.canActivate(context()), true);
});

test('admin guard enforces its configured key', () => {
  const guard = new AdminApiKeyGuard(config({
    NODE_ENV: 'production',
    CREDIT_RULE_ADMIN_API_KEY: 'admin-secret'
  }));
  assert.equal(guard.canActivate(context('admin-secret')), true);
  assert.throws(() => guard.canActivate(context('wrong')), UnauthorizedException);
});

test('evaluation guard uses a separate configured key', () => {
  const guard = new EvaluationApiKeyGuard(config({
    NODE_ENV: 'production',
    CREDIT_RULE_EVALUATION_API_KEY: 'evaluation-secret'
  }));
  assert.equal(guard.canActivate(context('evaluation-secret')), true);
  assert.throws(() => guard.canActivate(context('admin-secret')), UnauthorizedException);
});
