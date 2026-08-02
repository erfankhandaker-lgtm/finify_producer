'use strict';

const baseUrl = String(process.env.GATEWAY_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
const origin = process.env.GATEWAY_TEST_ORIGIN || 'http://localhost:3100';

async function check(name, path, expectedStatus, init = {}, assertion) {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (response.status !== expectedStatus) {
    const body = await response.text();
    throw new Error(`${name}: expected HTTP ${expectedStatus}, received ${response.status}: ${body.slice(0, 200)}`);
  }
  if (!response.headers.get('x-request-id')) {
    throw new Error(`${name}: Kong did not return X-Request-ID`);
  }
  if (assertion) assertion(response);
  console.log(`PASS ${name} (${response.status})`);
}

async function main() {
  await check('gateway health route', '/finify/hello', 204);
  await check('admin authentication boundary', '/finify/admin/operations/system-pulse', 401);
  await check('legacy user route blocked', '/finify/finifyapi/encrypt', 404, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: 'gateway-check' }),
  });
  await check('legacy registration route blocked', '/finify/registration/getaccount', 404, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ Mobile_Number: 1 }),
  });
  await check('database-password diagnostic removed', '/finify/hello/db-password', 404);
  await check('merchant callback read blocked', '/v1/merchant-confirmations/test', 404);
  await check('browser preflight', '/finify/admin/auth/login', 204, {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  }, (response) => {
    if (response.headers.get('access-control-allow-origin') !== origin) {
      throw new Error('browser preflight: configured origin was not accepted');
    }
  });
}

main().catch((error) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

