'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const collection = JSON.parse(fs.readFileSync(
  path.join(root, 'postman/Finify-Customer-Onboarding.postman_collection.json'),
  'utf8',
));
const environment = JSON.parse(fs.readFileSync(
  path.join(root, 'postman/Finify-Customer-Onboarding-Local.postman_environment.json'),
  'utf8',
));

function walk(items) {
  return items.flatMap((item) => item.request ? [item] : walk(item.item || []));
}

const requests = walk(collection.item || []);
const routes = requests.map((item) => `${item.request.method} ${item.request.url}`);
const required = [
  'POST {{baseUrl}}/api/v1/onboarding/instances',
  'GET {{baseUrl}}/api/v1/onboarding/instances/resume?token={{onboardingResumeToken}}',
  'POST {{baseUrl}}/api/v1/onboarding/instances/{{onboardingInstanceId}}/steps',
  'POST {{baseUrl}}/api/v1/onboarding/instances/{{onboardingInstanceId}}/handoffs',
  'POST {{baseUrl}}/api/v1/onboarding/handoffs/consume',
];
for (const route of required) {
  if (!routes.includes(route)) throw new Error(`Missing onboarding request: ${route}`);
}
const stepRequests = requests.filter((item) => item.request.url.includes('/steps'));
for (const item of stepRequests) {
  const headers = new Map(item.request.header.map((header) => [header.key.toLowerCase(), header.value]));
  if (!headers.has('x-onboarding-resume-token')) throw new Error(`${item.name} lacks the resume-token header`);
  if (!headers.has('idempotency-key')) throw new Error(`${item.name} lacks the idempotency header`);
}
const environmentValues = Object.fromEntries(environment.values.map((item) => [item.key, item.value]));
if (environmentValues.tenantId) throw new Error('The exported environment must not contain a tenant identifier');
if (!String(environmentValues.baseUrl).startsWith('http://localhost:8080/finify')) {
  throw new Error('The local environment must use Kong rather than a private service port');
}
const serialized = JSON.stringify({ collection, environment });
for (const forbidden of ['finify_local_password','ADMIN_JWT_SECRET','ONBOARDING_PII_ENCRYPTION_KEY','ONBOARDING_HANDOFF_SIGNING_KEY']) {
  if (serialized.includes(forbidden)) throw new Error(`Export contains forbidden secret material: ${forbidden}`);
}
console.log(`Validated ${requests.length} onboarding requests, required headers and secret-safe environment defaults.`);
