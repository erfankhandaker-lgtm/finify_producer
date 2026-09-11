'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const collectionFile = path.join(root, 'postman/Finify-Customer-Onboarding.postman_collection.json');
const environmentFile = path.join(root, 'postman/Finify-Customer-Onboarding-Local.postman_environment.json');

const schema = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
const jsonHeader = { key: 'Content-Type', value: 'application/json', type: 'text' };
const correlationHeader = {
  key: 'X-Correlation-ID',
  value: 'onboarding-{{$guid}}',
  type: 'text',
  description: 'Client-generated trace identifier. Use a new value for each logical operation.',
};

const unwrap = [
  'const body = pm.response.json();',
  'const data = body.payload || body;',
];
const successEnvelopeTests = [
  'pm.test("Response uses the FINIFY envelope", function () {',
  '  const body = pm.response.json();',
  '  pm.expect(body).to.have.property("issuccess");',
  '  pm.expect(body).to.have.property("statusCode");',
  '  pm.expect(body).to.have.property("payload");',
  '});',
];
const captureProgress = [
  ...unwrap,
  'if (data.instanceId) pm.collectionVariables.set("onboardingInstanceId", data.instanceId);',
  'if (data.customerId) pm.collectionVariables.set("onboardingCustomerId", data.customerId);',
  'if (data.resumeToken) pm.collectionVariables.set("onboardingResumeToken", data.resumeToken);',
  'if (data.currentNodeKey) pm.collectionVariables.set("currentNodeKey", data.currentNodeKey);',
  'if (data.currentNodeType) pm.collectionVariables.set("currentNodeType", data.currentNodeType);',
];
const prepareStep = [
  'const currentNodeKey = pm.collectionVariables.get("currentNodeKey");',
  'if (!currentNodeKey) throw new Error("Run Start or resume journey first");',
  'pm.collectionVariables.set("lastStepNodeKey", currentNodeKey);',
  'pm.collectionVariables.set("lastStepIdempotencyKey", `onboarding-${pm.variables.replaceIn("{{$guid}}")}`);',
];

function request(name, method, rawUrl, options = {}) {
  const item = {
    name,
    request: {
      method,
      auth: { type: 'noauth' },
      header: options.headers || [],
      url: rawUrl,
      description: options.description || '',
    },
    response: [],
  };
  if (options.body !== undefined) {
    item.request.body = {
      mode: 'raw',
      raw: JSON.stringify(options.body, null, 2),
      options: { raw: { language: 'json' } },
    };
    if (!item.request.header.some((header) => header.key.toLowerCase() === 'content-type')) {
      item.request.header.unshift(jsonHeader);
    }
  }
  item.event = [];
  if (options.preRequest) {
    item.event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: options.preRequest } });
  }
  item.event.push({
    listen: 'test',
    script: { type: 'text/javascript', exec: options.tests || ['pm.test("Request completed", () => pm.expect(pm.response.code).to.be.below(500));'] },
  });
  return item;
}

function folder(name, description, item) { return { name, description, item }; }

const collection = {
  info: {
    _postman_id: '626d25d0-4d67-4c65-9c35-a7ec22576f68',
    name: 'FINIFY Customer Onboarding Journey API',
    description: [
      'Customer-app collection for the configurable FINIFY onboarding runtime.',
      '',
      'Import the matching local environment, configure tenantId and phoneNumber, then run requests in numeric order.',
      'The resume token is a bearer-like secret: never log, expose or persist it outside secure application storage.',
      'Only START and PHONE_CAPTURE use the generic step endpoint. Verified nodes use dedicated FINIFY services.',
      'See docs/customer-onboarding-api.md for the complete integration contract.',
    ].join('\n'),
    schema,
  },
  variable: [
    { key: 'onboardingInstanceId', value: '', type: 'string' },
    { key: 'onboardingCustomerId', value: '', type: 'string' },
    { key: 'onboardingResumeToken', value: '', type: 'string' },
    { key: 'currentNodeKey', value: '', type: 'string' },
    { key: 'currentNodeType', value: '', type: 'string' },
    { key: 'lastStepNodeKey', value: '', type: 'string' },
    { key: 'lastStepIdempotencyKey', value: '', type: 'string' },
    { key: 'channelHandoffToken', value: '', type: 'string' },
    { key: 'otpCode', value: '', type: 'string' },
    { key: 'consentVersionId', value: '', type: 'string' },
    { key: 'formVersionId', value: '', type: 'string' },
    { key: 'kycCaseId', value: '', type: 'string' },
  ],
  item: [
    folder('00 - Connectivity', 'Gateway availability only; it does not prove an onboarding journey is configured.', [
      request('Gateway readiness', 'GET', '{{baseUrl}}/hello', {
        tests: ['pm.test("Gateway is ready", () => pm.response.to.have.status(204));'],
      }),
    ]),
    folder('01 - Start and resume', 'Creates or resumes the durable pre-auth onboarding instance selected by tenant, country, channel and customer type.', [
      request('Start or resume journey', 'POST', '{{baseUrl}}/api/v1/onboarding/instances', {
        headers: [correlationHeader],
        body: {
          tenantId: '{{tenantId}}',
          countryCode: '{{countryCode}}',
          channelCode: '{{channelCode}}',
          customerType: '{{customerType}}',
          phoneNumber: '{{phoneNumber}}',
        },
        description: 'Returns instanceId and a rotated resumeToken. A matching in-progress journey is resumed instead of duplicated.',
        tests: [
          'pm.test("Journey started or resumed", () => pm.response.to.have.status(201));',
          ...successEnvelopeTests,
          ...captureProgress,
          'pm.test("Runtime identifiers were returned", function () {',
          '  pm.expect(data.instanceId).to.be.a("string").and.not.empty;',
          '  pm.expect(data.customerId).to.be.a("string").and.not.empty;',
          '  pm.expect(data.resumeToken).to.be.a("string").and.have.length.above(19);',
          '  pm.expect(data.currentNodeType).to.eql("START");',
          '});',
        ],
      }),
      request('Resume with token', 'GET', '{{baseUrl}}/api/v1/onboarding/instances/resume?token={{onboardingResumeToken}}', {
        headers: [correlationHeader],
        description: 'Returns the latest durable state. The current API carries the resume token in the query string; suppress URL logging.',
        tests: [
          'pm.test("Journey resumed", () => pm.response.to.have.status(200));',
          ...successEnvelopeTests,
          ...captureProgress,
          'pm.test("Same instance is returned", () => pm.expect(data.instanceId).to.eql(pm.collectionVariables.get("onboardingInstanceId")));',
        ],
      }),
    ]),
    folder('02 - Generic progression', 'Use only for START and PHONE_CAPTURE. Each logical step gets a new idempotency key.', [
      request('Advance START', 'POST', '{{baseUrl}}/api/v1/onboarding/instances/{{onboardingInstanceId}}/steps', {
        headers: [
          correlationHeader,
          { key: 'X-Onboarding-Resume-Token', value: '{{onboardingResumeToken}}', type: 'text' },
          { key: 'Idempotency-Key', value: '{{lastStepIdempotencyKey}}', type: 'text' },
        ],
        preRequest: prepareStep,
        body: { nodeKey: '{{lastStepNodeKey}}', outcome: 'SUCCESS', output: {} },
        tests: [
          'pm.test("START advanced", () => pm.response.to.have.status(201));',
          ...successEnvelopeTests,
          ...captureProgress,
          'pm.test("Request was not a replay", () => pm.expect(data.replayed).to.eql(false));',
        ],
      }),
      request('Replay last step safely', 'POST', '{{baseUrl}}/api/v1/onboarding/instances/{{onboardingInstanceId}}/steps', {
        headers: [
          correlationHeader,
          { key: 'X-Onboarding-Resume-Token', value: '{{onboardingResumeToken}}', type: 'text' },
          { key: 'Idempotency-Key', value: '{{lastStepIdempotencyKey}}', type: 'text' },
        ],
        body: { nodeKey: '{{lastStepNodeKey}}', outcome: 'SUCCESS', output: {} },
        description: 'Same key plus byte-equivalent logical input returns the current state with replayed=true.',
        tests: [
          'pm.test("Replay accepted", () => pm.response.to.have.status(201));',
          ...successEnvelopeTests,
          ...unwrap,
          'pm.test("Replay was recognised", () => pm.expect(data.replayed).to.eql(true));',
        ],
      }),
      request('Advance PHONE_CAPTURE', 'POST', '{{baseUrl}}/api/v1/onboarding/instances/{{onboardingInstanceId}}/steps', {
        headers: [
          correlationHeader,
          { key: 'X-Onboarding-Resume-Token', value: '{{onboardingResumeToken}}', type: 'text' },
          { key: 'Idempotency-Key', value: '{{lastStepIdempotencyKey}}', type: 'text' },
        ],
        preRequest: prepareStep,
        body: { nodeKey: '{{lastStepNodeKey}}', outcome: 'SUCCESS', output: { captured: true } },
        tests: [
          'pm.test("PHONE_CAPTURE advanced", () => pm.response.to.have.status(201));',
          ...successEnvelopeTests,
          ...captureProgress,
        ],
      }),
    ]),
    folder('03 - Safety checks', 'Negative checks. Run deliberately after the matching progression request.', [
      request('Reject reused key with changed input', 'POST', '{{baseUrl}}/api/v1/onboarding/instances/{{onboardingInstanceId}}/steps', {
        headers: [
          correlationHeader,
          { key: 'X-Onboarding-Resume-Token', value: '{{onboardingResumeToken}}', type: 'text' },
          { key: 'Idempotency-Key', value: '{{lastStepIdempotencyKey}}', type: 'text' },
        ],
        body: { nodeKey: '{{lastStepNodeKey}}', outcome: 'SUCCESS', output: { changed: true } },
        tests: ['pm.test("Changed input is rejected", () => pm.response.to.have.status(409));'],
      }),
      request('Reject verified-node bypass', 'POST', '{{baseUrl}}/api/v1/onboarding/instances/{{onboardingInstanceId}}/steps', {
        headers: [
          correlationHeader,
          { key: 'X-Onboarding-Resume-Token', value: '{{onboardingResumeToken}}', type: 'text' },
          { key: 'Idempotency-Key', value: 'boundary-{{$guid}}', type: 'text' },
        ],
        body: { nodeKey: '{{currentNodeKey}}', outcome: 'SUCCESS', output: {} },
        description: 'Expected when currentNodeType is OTP_VERIFICATION, PIN_SETUP, KYC, wallet or credit-related.',
        tests: [
          'pm.test("Dedicated-service boundary is enforced", () => pm.response.to.have.status(409));',
          'pm.test("Error identifies the dedicated service boundary", () => pm.expect(pm.response.json().message).to.include("dedicated verified onboarding service"));',
        ],
      }),
    ]),
    folder('04 - Verified runtime', 'Dedicated customer-safe contracts. Run only when currentNodeType matches the request.', [
      request('Create OTP challenge', 'POST', '{{baseUrl}}/api/v1/onboarding/instances/{{onboardingInstanceId}}/otp/challenges', {
        headers:[{key:'X-Onboarding-Resume-Token',value:'{{onboardingResumeToken}}',type:'text'},{key:'Idempotency-Key',value:'otp-send-{{$guid}}',type:'text'}],body:{},
        tests:['pm.test("OTP challenge created",()=>pm.response.to.have.status(201));',...successEnvelopeTests,...unwrap,'if(data.developmentCode) pm.collectionVariables.set("otpCode",data.developmentCode);'],
      }),
      request('Verify OTP', 'POST', '{{baseUrl}}/api/v1/onboarding/instances/{{onboardingInstanceId}}/otp/verify', {
        headers:[{key:'X-Onboarding-Resume-Token',value:'{{onboardingResumeToken}}',type:'text'},{key:'Idempotency-Key',value:'otp-verify-{{$guid}}',type:'text'}],body:{code:'{{otpCode}}'},tests:['pm.test("OTP verified",()=>pm.response.to.have.status(201));',...captureProgress],
      }),
      request('Create secure PIN', 'POST', '{{baseUrl}}/api/v1/onboarding/instances/{{onboardingInstanceId}}/pin', {
        headers:[{key:'X-Onboarding-Resume-Token',value:'{{onboardingResumeToken}}',type:'text'},{key:'Idempotency-Key',value:'pin-create-{{$guid}}',type:'text'}],body:{pin:'4827',confirmPin:'4827'},tests:['pm.test("PIN created",()=>pm.response.to.have.status(201));',...captureProgress],
      }),
      request('Accept consent version', 'POST', '{{baseUrl}}/api/v1/onboarding/instances/{{onboardingInstanceId}}/consents', {
        headers:[{key:'X-Onboarding-Resume-Token',value:'{{onboardingResumeToken}}',type:'text'},{key:'Idempotency-Key',value:'consent-{{$guid}}',type:'text'}],body:{consentVersionId:'{{consentVersionId}}',accepted:true},tests:['pm.test("Consent recorded",()=>pm.response.to.have.status(201));',...captureProgress],
      }),
      request('Submit configured profile', 'POST', '{{baseUrl}}/api/v1/onboarding/instances/{{onboardingInstanceId}}/profile', {
        headers:[{key:'X-Onboarding-Resume-Token',value:'{{onboardingResumeToken}}',type:'text'},{key:'Idempotency-Key',value:'profile-{{$guid}}',type:'text'}],body:{formVersionId:'{{formVersionId}}',response:{givenName:'Amina',familyName:'Nsubuga',dateOfBirth:'1990-01-01',nationality:'UGA',residentialAddress:'Kampala',occupation:'Trader',sourceOfIncome:'BUSINESS'}},tests:['pm.test("Profile recorded",()=>pm.response.to.have.status(201));',...captureProgress],
      }),
      request('Create linked KYC case', 'POST', '{{baseUrl}}/api/v1/onboarding/instances/{{onboardingInstanceId}}/kyc', {
        headers:[{key:'X-Onboarding-Resume-Token',value:'{{onboardingResumeToken}}',type:'text'},{key:'Idempotency-Key',value:'kyc-create-{{$guid}}',type:'text'}],body:{documentType:'UGANDA_NATIONAL_ID',issuingCountry:'UGA'},tests:['pm.test("KYC case linked",()=>pm.response.to.have.status(201));',...unwrap,'if(data.kycCaseId) pm.collectionVariables.set("kycCaseId",data.kycCaseId);'],
      }),
      request('Get customer-safe KYC status', 'GET', '{{baseUrl}}/api/v1/onboarding/instances/{{onboardingInstanceId}}/kyc', {
        headers:[{key:'X-Onboarding-Resume-Token',value:'{{onboardingResumeToken}}',type:'text'}],tests:['pm.test("KYC status returned",()=>pm.response.to.have.status(200));'],
      }),
      request('Submit KYC verification', 'POST', '{{baseUrl}}/api/v1/onboarding/instances/{{onboardingInstanceId}}/kyc/verify', {
        headers:[{key:'X-Onboarding-Resume-Token',value:'{{onboardingResumeToken}}',type:'text'}],tests:['pm.test("KYC submitted",()=>pm.response.to.have.status(201));'],
      }),
      request('Allocate configured wallet', 'POST', '{{baseUrl}}/api/v1/onboarding/instances/{{onboardingInstanceId}}/wallet', {
        headers:[{key:'X-Onboarding-Resume-Token',value:'{{onboardingResumeToken}}',type:'text'},{key:'Idempotency-Key',value:'wallet-{{$guid}}',type:'text'}],body:{},tests:['pm.test("Wallet allocated",()=>pm.response.to.have.status(201));'],
      }),
    ]),
    folder('05 - Cross-channel handoff', 'Use only when the current node type is CHANNEL_HANDOFF. The target channel consumes a one-time token and receives a rotated resume token.', [
      request('Create channel handoff', 'POST', '{{baseUrl}}/api/v1/onboarding/instances/{{onboardingInstanceId}}/handoffs', {
        headers: [correlationHeader,{ key:'X-Onboarding-Resume-Token',value:'{{onboardingResumeToken}}',type:'text' },{ key:'Idempotency-Key',value:'handoff-{{$guid}}',type:'text' }],
        body: { expiresInSeconds: 300 },
        tests: [
          'pm.test("Handoff issued", () => pm.response.to.have.status(201));',
          ...successEnvelopeTests,...unwrap,
          'if (data.handoffToken) pm.collectionVariables.set("channelHandoffToken", data.handoffToken);',
        ],
      }),
      request('Consume handoff on target channel', 'POST', '{{baseUrl}}/api/v1/onboarding/handoffs/consume', {
        headers: [correlationHeader,{ key:'X-Finify-Channel-Client-ID',value:'{{channelClientId}}',type:'text' },{ key:'X-Finify-Channel-Credential',value:'{{channelClientCredential}}',type:'text' }],
        body: { handoffToken:'{{channelHandoffToken}}' },
        tests: [
          'pm.test("Handoff consumed", () => pm.response.to.have.status(201));',
          ...successEnvelopeTests,...captureProgress,
        ],
      }),
    ]),
  ],
};

const environment = {
  id: '9d390616-6fb8-455e-b871-3359ec19f28e',
  name: 'FINIFY Customer Onboarding - Local',
  values: [
    { key: 'baseUrl', value: 'http://localhost:8080/finify', type: 'default', enabled: true },
    { key: 'tenantId', value: '', type: 'default', enabled: true },
    { key: 'countryCode', value: 'UGA', type: 'default', enabled: true },
    { key: 'channelCode', value: 'MOBILE_APP', type: 'default', enabled: true },
    { key: 'customerType', value: 'INDIVIDUAL', type: 'default', enabled: true },
    { key: 'phoneNumber', value: '+256700000001', type: 'default', enabled: true },
    { key: 'channelClientId', value: '', type: 'secret', enabled: true },
    { key: 'channelClientCredential', value: '', type: 'secret', enabled: true },
  ],
  _postman_variable_scope: 'environment',
  _postman_exported_at: new Date(0).toISOString(),
  _postman_exported_using: 'FINIFY repository generator',
};

fs.mkdirSync(path.dirname(collectionFile), { recursive: true });
fs.writeFileSync(collectionFile, `${JSON.stringify(collection, null, 2)}\n`);
fs.writeFileSync(environmentFile, `${JSON.stringify(environment, null, 2)}\n`);
console.log(`Wrote ${collectionFile}`);
console.log(`Wrote ${environmentFile}`);
