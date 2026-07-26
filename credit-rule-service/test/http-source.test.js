const assert = require('node:assert/strict');
const test = require('node:test');
const { BadRequestException } = require('@nestjs/common');
const { HttpSourceService } = require('../dist/credit-rules/http-source.service');

const config = (values = {}) => ({
  get(key, fallback) {
    return key in values ? values[key] : fallback;
  }
});

test('reads exact nested response paths', () => {
  const service = new HttpSourceService(config());
  const payload = { bureau: { loans: { total: 2, status: 'CURRENT' } } };
  assert.equal(service.readPath(payload, 'bureau.loans.total'), 2);
  assert.equal(service.readPath(payload, 'bureau.loans.status'), 'CURRENT');
  assert.equal(service.readPath(payload, 'bureau.missing.value'), undefined);
});

test('enforces HTTPS and the configured hostname allowlist', () => {
  const service = new HttpSourceService(config({
    CREDIT_RULE_HTTP_ALLOWED_HOSTS: 'score.example.com,bureau.example.com'
  }));
  service.validateUrlTemplate('https://score.example.com/v1/customer/{{customerId}}');
  assert.throws(
    () => service.validateUrlTemplate('http://score.example.com/v1/customer/{{customerId}}'),
    BadRequestException
  );
  assert.throws(
    () => service.validateUrlTemplate('https://unapproved.example.com/check'),
    BadRequestException
  );
});
