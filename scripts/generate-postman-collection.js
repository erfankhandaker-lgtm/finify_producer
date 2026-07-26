const fs = require('node:fs');
const path = require('node:path');

const outputFile = path.resolve(__dirname, '../postman/Finify-Complete-API.postman_collection.json');

const jsonHeader = { key: 'Content-Type', value: 'application/json', type: 'text' };
const producer = '{{producerBaseUrl}}';
const consumer = '{{consumerBaseUrl}}';
const accounting = '{{accountingBaseUrl}}';
const creditRules = '{{creditRuleBaseUrl}}';

const customerAuth = {
  type: 'bearer',
  bearer: [{ key: 'token', value: '{{customerToken}}', type: 'string' }],
};
const adminAuth = {
  type: 'bearer',
  bearer: [{ key: 'token', value: '{{adminAccessToken}}', type: 'string' }],
};
const noAuth = { type: 'noauth' };

const consumerAdminHeader = {
  key: 'x-admin-api-key',
  value: '{{consumerAdminApiKey}}',
  type: 'text',
  description: 'Required in production or when INTEGRATION_ADMIN_API_KEY is configured.',
};
const accountingAdminHeader = {
  key: 'x-admin-api-key',
  value: '{{accountingAdminApiKey}}',
  type: 'text',
  description: 'Required in production or when ACCOUNTING_ADMIN_API_KEY is configured.',
};
const creditRuleAdminHeaders = [
  {
    key: 'x-api-key',
    value: '{{creditRuleAdminApiKey}}',
    type: 'text',
    description: 'Credit-rule administration API key.',
  },
  {
    key: 'x-actor-id',
    value: '{{creditRuleActorId}}',
    type: 'text',
    description: 'Maker/checker identity for administrative mutations.',
  },
];
const creditRuleEvaluationHeader = {
  key: 'x-api-key',
  value: '{{creditRuleEvaluationApiKey}}',
  type: 'text',
  description: 'Credit-decision evaluation API key.',
};

const responseGuard = [
  'pm.test("Response is not a server error", function () {',
  '  pm.expect(pm.response.code).to.be.below(500);',
  '});',
];

function body(value) {
  return {
    mode: 'raw',
    raw: JSON.stringify(value, null, 2),
    options: { raw: { language: 'json' } },
  };
}

function request(name, method, url, options = {}) {
  const headers = [...(options.headers || [])];
  if (options.body && !headers.some((header) => header.key.toLowerCase() === 'content-type')) {
    headers.unshift(jsonHeader);
  }
  const item = {
    name,
    request: {
      method,
      header: headers,
      url,
      description: options.description || '',
    },
    response: [],
  };
  if (options.auth) item.request.auth = options.auth;
  if (options.body !== undefined) item.request.body = body(options.body);
  const events = [];
  if (options.preRequest) {
    events.push({
      listen: 'prerequest',
      script: { type: 'text/javascript', exec: options.preRequest },
    });
  }
  events.push({
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: [...responseGuard, ...(options.tests || [])],
    },
  });
  item.event = events;
  return item;
}

function folder(name, items, description = '') {
  return { name, description, item: items };
}

function producerRequest(name, method, route, options = {}) {
  return request(name, method, `${producer}${route}`, options);
}

function customerRequest(name, method, route, options = {}) {
  return producerRequest(name, method, route, { auth: customerAuth, ...options });
}

function adminRequest(name, method, route, options = {}) {
  return producerRequest(name, method, route, { auth: adminAuth, ...options });
}

function consumerAdminRequest(name, method, route, options = {}) {
  return request(name, method, `${consumer}${route}`, {
    auth: noAuth,
    ...options,
    headers: [consumerAdminHeader, ...(options.headers || [])],
  });
}

function accountingAdminRequest(name, method, route, options = {}) {
  return request(name, method, `${accounting}${route}`, {
    auth: noAuth,
    ...options,
    headers: [accountingAdminHeader, ...(options.headers || [])],
  });
}

function creditRuleAdminRequest(name, method, route, options = {}) {
  return request(name, method, `${creditRules}${route}`, {
    auth: noAuth,
    ...options,
    headers: [...creditRuleAdminHeaders, ...(options.headers || [])],
  });
}

function creditDecisionRequest(name, method, route, options = {}) {
  return request(name, method, `${creditRules}${route}`, {
    auth: noAuth,
    ...options,
    headers: [creditRuleEvaluationHeader, ...(options.headers || [])],
  });
}

const captureCustomerToken = [
  'if (pm.response.code >= 200 && pm.response.code < 300) {',
  '  const json = pm.response.json();',
  '  const data = json.payload || json;',
  '  if (data.token) pm.collectionVariables.set("customerToken", data.token);',
  '}',
];

const captureAdminTokens = [
  'if (pm.response.code >= 200 && pm.response.code < 300) {',
  '  const json = pm.response.json();',
  '  const data = json.payload || json;',
  '  if (data.accessToken) pm.collectionVariables.set("adminAccessToken", data.accessToken);',
  '  if (data.refreshToken) pm.collectionVariables.set("adminRefreshToken", data.refreshToken);',
  '}',
];

const captureChangeRequest = [
  'if (pm.response.code >= 200 && pm.response.code < 300) {',
  '  const json = pm.response.json();',
  '  const data = json.payload || json;',
  '  if (data.id) pm.collectionVariables.set("changeRequestId", String(data.id));',
  '}',
];

const captureTransaction = [
  'if (pm.response.code >= 200 && pm.response.code < 300) {',
  '  const json = pm.response.json();',
  '  const data = json.payload || json;',
  '  const id = data.transactionId || data.TransactionId || data.id;',
  '  if (id) pm.collectionVariables.set("transactionId", String(id));',
  '}',
];

function captureCreditId(variable, nested = false) {
  return [
    'if (pm.response.code >= 200 && pm.response.code < 300) {',
    '  const json = pm.response.json();',
    `  const data = ${nested ? 'json.data || json' : 'json.payload || json'};`,
    `  if (data.id) pm.collectionVariables.set("${variable}", String(data.id));`,
    '}',
  ];
}

const producerItems = [
  folder('Health, docs, and diagnostics', [
    producerRequest('Hello / readiness probe', 'GET', '/hello', {
      auth: noAuth,
      description: 'The controller intentionally responds with HTTP 204.',
    }),
    producerRequest('Database credential diagnostic (sensitive)', 'GET', '/hello/db-password', {
      auth: noAuth,
      description: 'Sensitive legacy diagnostic route. Do not expose or run outside a trusted local environment.',
    }),
    request('Swagger UI', 'GET', `${producer}/api`, { auth: noAuth }),
    request('OpenAPI JSON', 'GET', `${producer}/api-json`, { auth: noAuth }),
  ]),

  folder('Customer authentication', [
    producerRequest('Customer login', 'POST', '/auth/login', {
      auth: noAuth,
      body: {
        username: '{{customerUsername}}',
        password: '{{customerPin}}',
      },
      tests: captureCustomerToken,
      description: 'Stores payload.token as the customerToken collection variable.',
    }),
  ]),

  folder('Administrator authentication', [
    producerRequest('Check initial admin setup status', 'GET', '/admin/auth/setup/status', { auth: noAuth }),
    producerRequest('Initialize first administrator', 'POST', '/admin/auth/setup/initialize', {
      auth: noAuth,
      body: {
        username: '{{adminUsername}}',
        email: '{{adminEmail}}',
        displayName: '{{adminDisplayName}}',
        password: '{{adminPassword}}',
        setupToken: '{{adminSetupToken}}',
      },
      tests: captureAdminTokens,
      description: 'One-time setup. Stores access and refresh tokens when successful.',
    }),
    producerRequest('Admin login', 'POST', '/admin/auth/login', {
      auth: noAuth,
      body: {
        username: '{{adminUsername}}',
        password: '{{adminPassword}}',
      },
      tests: captureAdminTokens,
    }),
    producerRequest('Refresh admin session', 'POST', '/admin/auth/refresh', {
      auth: noAuth,
      body: { refreshToken: '{{adminRefreshToken}}' },
      tests: captureAdminTokens,
      description: 'Refresh tokens rotate; the test script stores the replacement.',
    }),
    adminRequest('Get current admin profile', 'GET', '/admin/auth/me'),
    adminRequest('Admin logout', 'POST', '/admin/auth/logout'),
  ]),

  folder('Customer wallets', [
    customerRequest('List my wallets', 'GET', '/wallets'),
    customerRequest('Create additional wallet', 'POST', '/wallets', {
      body: { walletCode: '{{walletCode}}', currency: '{{currency}}' },
    }),
    customerRequest('Get my wallet', 'GET', '/wallets/{{walletId}}'),
    customerRequest('Make wallet the default', 'POST', '/wallets/{{walletId}}/default'),
    customerRequest(
      'List wallet transactions',
      'GET',
      '/wallets/{{walletId}}/transactions?page={{page}}&limit={{limit}}&dateFrom={{dateFrom}}&dateTo={{dateTo}}',
    ),
  ]),

  folder('Admin wallets', [
    adminRequest(
      'Search all wallets',
      'GET',
      '/admin/wallets?page={{page}}&limit={{limit}}&ownerMsisdn={{ownerMsisdn}}&ownerType=CUSTOMER&currency={{currency}}&status=0',
    ),
    adminRequest('Change wallet status', 'PATCH', '/admin/wallets/{{walletId}}/status', {
      body: { status: 'FROZEN', reason: 'Postman full API test' },
    }),
    adminRequest('Get wallet audit history', 'GET', '/admin/wallets/{{walletId}}/history'),
  ]),

  folder('Reference data - keywords', [
    adminRequest('List keywords', 'GET', '/admin/reference-data/keywords?page={{page}}&limit={{limit}}&search=&active=true'),
    adminRequest('Get keyword', 'GET', '/admin/reference-data/keywords/{{keyword}}'),
    adminRequest('Submit keyword creation', 'POST', '/admin/reference-data/keywords', {
      body: {
        keyword: '{{keyword}}',
        keywordDescription: 'Merchant payment',
        keywordScope: 'M',
        isFinancial: true,
        chargeable: 'N',
        commissionable: 'N',
        minimumTranAmount: 1,
        serviceStatus: true,
        isActive: true,
        makerComment: 'Created from Postman',
      },
      tests: captureChangeRequest,
    }),
    adminRequest('Submit keyword update', 'PATCH', '/admin/reference-data/keywords/{{keyword}}', {
      body: {
        keywordDescription: 'Updated merchant payment',
        makerComment: 'Updated from Postman',
      },
      tests: captureChangeRequest,
    }),
    adminRequest('Submit keyword deactivation', 'DELETE', '/admin/reference-data/keywords/{{keyword}}', {
      body: { comment: 'Deactivate from Postman' },
      tests: captureChangeRequest,
    }),
  ]),

  folder('Reference data - wallet types', [
    adminRequest('List wallet types', 'GET', '/admin/reference-data/wallet-types?page={{page}}&limit={{limit}}&search=&active=true'),
    adminRequest('Get wallet type', 'GET', '/admin/reference-data/wallet-types/{{walletCode}}'),
    adminRequest('Submit wallet type creation', 'POST', '/admin/reference-data/wallet-types', {
      body: {
        walletId: '{{walletCode}}',
        walletName: 'Customer additional wallet',
        walletDetails: 'Created from Postman',
        isKycNeeded: 0,
        defaultCommissionId: 1,
        defaultChargeId: 1,
        walletType: 100,
        isCharge: false,
        fee: 0,
        hierarchy: 1,
        status: true,
        makerComment: 'Created from Postman',
      },
      tests: captureChangeRequest,
    }),
    adminRequest('Submit wallet type update', 'PATCH', '/admin/reference-data/wallet-types/{{walletCode}}', {
      body: {
        walletDetails: 'Updated from Postman',
        makerComment: 'Updated from Postman',
      },
      tests: captureChangeRequest,
    }),
    adminRequest('Submit wallet type deactivation', 'DELETE', '/admin/reference-data/wallet-types/{{walletCode}}', {
      body: { comment: 'Deactivate from Postman' },
      tests: captureChangeRequest,
    }),
  ]),

  folder('Reference data - AML configurations', [
    adminRequest(
      'List AML configurations',
      'GET',
      '/admin/reference-data/aml-configurations?page={{page}}&limit={{limit}}&walletCode={{walletCode}}&keyword={{keyword}}',
    ),
    adminRequest(
      'Get AML configuration',
      'GET',
      '/admin/reference-data/aml-configurations/{{walletCode}}/{{keyword}}',
    ),
    adminRequest('Submit AML configuration creation', 'POST', '/admin/reference-data/aml-configurations', {
      body: {
        walletCode: '{{walletCode}}',
        keyword: '{{keyword}}',
        maxTransactionAmount: 5000,
        dailyMaxAmount: 25000,
        dailyTransactionCount: 25,
        monthlyMaxAmount: 250000,
        monthlyTransactionCount: 250,
        isActive: true,
        makerComment: 'Created from Postman',
      },
      tests: captureChangeRequest,
    }),
    adminRequest(
      'Submit AML configuration update',
      'PATCH',
      '/admin/reference-data/aml-configurations/{{walletCode}}/{{keyword}}',
      {
        body: {
          maxTransactionAmount: 6000,
          dailyMaxAmount: 30000,
          monthlyMaxAmount: 300000,
          makerComment: 'Updated from Postman',
        },
        tests: captureChangeRequest,
      },
    ),
    adminRequest(
      'Submit AML configuration deactivation',
      'DELETE',
      '/admin/reference-data/aml-configurations/{{walletCode}}/{{keyword}}',
      {
        body: { comment: 'Deactivate from Postman' },
        tests: captureChangeRequest,
      },
    ),
  ]),

  folder('Reference data - maker/checker queue', [
    adminRequest(
      'List change requests',
      'GET',
      '/admin/reference-data/change-requests?page={{page}}&limit={{limit}}&resourceType=&status=PENDING',
    ),
    adminRequest('Get change request', 'GET', '/admin/reference-data/change-requests/{{changeRequestId}}'),
    adminRequest('Approve change request', 'POST', '/admin/reference-data/change-requests/{{changeRequestId}}/approve', {
      body: { comment: 'Approved from Postman' },
      description: 'Must be called by a different administrator from the maker.',
    }),
    adminRequest('Reject change request', 'POST', '/admin/reference-data/change-requests/{{changeRequestId}}/reject', {
      body: { reason: 'Rejected during Postman test' },
      description: 'Must be called by a different administrator from the maker.',
    }),
    adminRequest('Cancel my change request', 'POST', '/admin/reference-data/change-requests/{{changeRequestId}}/cancel'),
  ]),

  folder('Transactions', [
    customerRequest('Process transaction', 'POST', '/transaction/process', {
      body: {
        transactionId: '{{$guid}}',
        amount: 100,
        pin: '{{customerPin}}',
        keyword: '{{keyword}}',
        sourceAccount: '{{sourceWalletId}}',
        destinationAccount: '{{destinationWalletId}}',
        mobileNumber: '{{customerUsername}}',
        referenceId: 'POSTMAN-{{$timestamp}}',
        payment_type: 1,
        currency: '{{currency}}',
        lang: 'en',
        lat: '51.5074',
        long: '-0.1278',
      },
      tests: captureTransaction,
    }),
    customerRequest('Get transaction request', 'GET', '/transaction/request/{{transactionId}}'),
    customerRequest('Check balance', 'POST', '/transaction/balance', {
      body: {
        accountId: '{{walletId}}',
        userId: '{{customerUsername}}',
        currency: '{{currency}}',
      },
    }),
    customerRequest(
      'List paginated transactions',
      'GET',
      '/transaction/transactions?accountnumber={{walletId}}&page={{page}}&limit={{limit}}',
    ),
  ]),

  folder('Charges - definitions', [
    customerRequest('Calculate charge', 'POST', '/charges/calculate', {
      body: {
        transactionId: '{{transactionId}}',
        keyword: '{{keyword}}',
        walletId: '{{walletCode}}',
        amount: '100.00',
      },
    }),
    customerRequest('List charge definitions', 'GET', '/charges'),
    customerRequest('Get charge definition', 'GET', '/charges/{{chargeId}}'),
    customerRequest('Create charge definition', 'POST', '/charges', {
      body: {
        chargeId: '{{chargeId}}',
        chargeType: 0,
        expiryOn: '2027-12-31',
        defaultChargeId: 1,
        chargeDescription: 'Postman test charge',
        maker: '{{adminUsername}}',
      },
    }),
    customerRequest('Update charge definition', 'PATCH', '/charges/{{chargeId}}', {
      body: {
        chargeDescription: 'Updated Postman test charge',
        maker: '{{adminUsername}}',
      },
    }),
    customerRequest('Approve charge definition', 'POST', '/charges/{{chargeId}}/approve', {
      body: { checker: '{{checkerUsername}}' },
    }),
    customerRequest('Deactivate charge definition', 'POST', '/charges/{{chargeId}}/deactivate', {
      body: { maker: '{{adminUsername}}' },
    }),
    customerRequest('Delete charge definition', 'DELETE', '/charges/{{chargeId}}'),
  ]),

  folder('Charges - bands/details', [
    customerRequest('List charge details', 'GET', '/charges/details/all/list?chargeId={{chargeId}}'),
    customerRequest('Get charge detail', 'GET', '/charges/details/{{chargeDetailId}}'),
    customerRequest('Create flat charge detail', 'POST', '/charges/details', {
      body: {
        chargeId: '{{chargeId}}',
        chargeType: 'Flat',
        chargeValue: '2.50',
        startRange: '0.00',
        endRange: '1000.00',
        maker: '{{adminUsername}}',
      },
    }),
    customerRequest('Update charge detail', 'PATCH', '/charges/details/{{chargeDetailId}}', {
      body: {
        chargeValue: '3.00',
        maker: '{{adminUsername}}',
      },
    }),
    customerRequest('Delete/deactivate charge detail', 'DELETE', '/charges/details/{{chargeDetailId}}', {
      body: { maker: '{{adminUsername}}' },
    }),
  ]),

  folder('Charges - mappings', [
    customerRequest('List charge mappings', 'GET', '/charges/mappings/all/list'),
    customerRequest('Get charge mapping', 'GET', '/charges/mappings/{{chargeMappingId}}'),
    customerRequest('Create charge mapping', 'POST', '/charges/mappings', {
      body: {
        keywordChargeId: '{{keywordChargeId}}',
        description: 'Postman mapping',
        isDefault: 1,
        maker: '{{adminUsername}}',
      },
    }),
    customerRequest('Update charge mapping', 'PATCH', '/charges/mappings/{{chargeMappingId}}', {
      body: {
        description: 'Updated Postman mapping',
        maker: '{{adminUsername}}',
      },
    }),
    customerRequest('Approve charge mapping', 'POST', '/charges/mappings/{{chargeMappingId}}/approve', {
      body: { checker: '{{checkerUsername}}' },
    }),
    customerRequest('Deactivate charge mapping', 'POST', '/charges/mappings/{{chargeMappingId}}/deactivate', {
      body: { maker: '{{adminUsername}}' },
    }),
    customerRequest('Delete charge mapping', 'DELETE', '/charges/mappings/{{chargeMappingId}}'),
  ]),

  folder('Charges - keyword configurations', [
    customerRequest('List keyword charge configurations', 'GET', '/charges/keyword-configs/all/list'),
    customerRequest('Get keyword charge configuration', 'GET', '/charges/keyword-configs/{{keywordChargeRowId}}'),
    customerRequest('Create keyword charge configuration', 'POST', '/charges/keyword-configs', {
      body: {
        keywordChargeId: '{{keywordChargeId}}',
        keyword: '{{keyword}}',
        chargeId: '{{chargeId}}',
        payer: 'S',
        description: 'Postman keyword charge',
        isDefault: 1,
        walletId: '{{walletCode}}',
        maker: '{{adminUsername}}',
      },
    }),
    customerRequest('Update keyword charge configuration', 'PATCH', '/charges/keyword-configs/{{keywordChargeRowId}}', {
      body: {
        description: 'Updated Postman keyword charge',
        maker: '{{adminUsername}}',
      },
    }),
    customerRequest('Approve keyword charge configuration', 'POST', '/charges/keyword-configs/{{keywordChargeRowId}}/approve', {
      body: { checker: '{{checkerUsername}}' },
    }),
    customerRequest('Deactivate keyword charge configuration', 'POST', '/charges/keyword-configs/{{keywordChargeRowId}}/deactivate', {
      body: { maker: '{{adminUsername}}' },
    }),
    customerRequest('Delete keyword charge configuration', 'DELETE', '/charges/keyword-configs/{{keywordChargeRowId}}'),
  ]),

  folder('Commissions', [
    customerRequest('Calculate commission', 'POST', '/commissions/calculate', {
      body: {
        transactionId: '{{transactionId}}',
        keyword: '{{keyword}}',
        walletId: '{{walletCode}}',
        amount: '100.00',
      },
    }),
    customerRequest('List commission definitions', 'GET', '/commissions'),
    customerRequest('List commission mappings', 'GET', '/commissions/mappings'),
    customerRequest('List keyword commission configurations', 'GET', '/commissions/keyword-configs'),
    customerRequest('Get commission definition', 'GET', '/commissions/{{commissionId}}'),
  ]),

  folder('Registration (legacy)', [
    producerRequest('Get account by mobile number', 'POST', '/registration/getaccount', {
      auth: noAuth,
      body: { Mobile_Number: '{{customerUsername}}' },
    }),
    producerRequest('Get default account by mobile number', 'POST', '/registration/getdefaultaccount', {
      auth: noAuth,
      body: { Mobile_Number: '{{customerUsername}}' },
    }),
    producerRequest('Create registration', 'POST', '/registration', {
      auth: noAuth,
      body: {},
      description: 'The current CreateRegistrationDto has no declared fields.',
    }),
    producerRequest('List registrations', 'GET', '/registration', { auth: noAuth }),
    producerRequest('Get registration', 'GET', '/registration/{{registrationId}}', { auth: noAuth }),
    producerRequest('Update registration', 'PATCH', '/registration/{{registrationId}}', {
      auth: noAuth,
      body: {},
      description: 'The current UpdateRegistrationDto has no declared fields.',
    }),
    producerRequest('Delete registration', 'DELETE', '/registration/{{registrationId}}', { auth: noAuth }),
  ]),

  folder('Users and utilities (legacy)', [
    producerRequest('Create user', 'POST', '/finifyapi/create', {
      auth: noAuth,
      body: {
        name: 1,
        email: 'postman.user@example.com',
        password: 'change-me',
        gender: 'male',
      },
    }),
    producerRequest('Find user by email', 'POST', '/finifyapi/findbyemail', {
      auth: noAuth,
      body: { email: 'postman.user@example.com' },
    }),
    producerRequest('Call legacy stored procedure', 'GET', '/finifyapi/callstoreprocedure', { auth: noAuth }),
    producerRequest('Encrypt data', 'POST', '/finifyapi/encrypt', {
      auth: noAuth,
      body: { data: 'replace-me' },
    }),
  ]),

  folder('Third-party API fetch (legacy)', [
    customerRequest('Fetch configured third-party API', 'POST', '/apifetch/v1/fetch3partyapi', {
      body: { request: 'replace with integration payload' },
    }),
    customerRequest('Get sample quotes', 'GET', '/apifetch/v1/getQuote'),
    customerRequest('Submit sample quote', 'POST', '/apifetch/v1/submitQuote', {
      body: { title: 'Postman quote', completed: false },
    }),
  ]),
];

const consumerItems = [
  folder('Health and docs', [
    request('Health', 'GET', `${consumer}/health`, { auth: noAuth }),
    request('Swagger UI', 'GET', `${consumer}/docs`, { auth: noAuth }),
    request('OpenAPI JSON', 'GET', `${consumer}/docs-json`, { auth: noAuth }),
  ]),

  folder('Merchant integration administration', [
    consumerAdminRequest('List mapping source fields', 'GET', '/v1/merchant-integrations/source-fields'),
    consumerAdminRequest('Get merchant integration', 'GET', '/v1/merchant-integrations/{{merchantMsisdn}}'),
    consumerAdminRequest('Create or replace API integration', 'PUT', '/v1/merchant-integrations/{{merchantMsisdn}}', {
      body: {
        channel: 'API',
        active: false,
        apiUrl: 'https://merchant.example.com/payments',
        apiMethod: 'POST',
        requestMapping: [
          {
            source: 'message.TransactionId',
            target: 'payment.id',
            location: 'body',
            required: true,
            type: 'string',
          },
          {
            source: 'message.Amount',
            target: 'payment.amount',
            location: 'body',
            required: true,
            type: 'decimal',
          },
        ],
        responseMapping: {
          decisionPath: 'data.status',
          approvedValues: ['APPROVED', 'SUCCESS'],
          rejectedValues: ['REJECTED', 'FAILED'],
          codePath: 'data.code',
          messagePath: 'message',
          externalReferencePath: 'data.externalReference',
        },
        auth: {
          type: 'LOGIN_BEARER',
          loginUrl: 'https://merchant.example.com/auth/login',
          loginMethod: 'POST',
          loginMapping: [
            { source: 'secret.username', target: 'username', location: 'body', required: true, type: 'string' },
            { source: 'secret.password', target: 'password', location: 'body', required: true, type: 'string' },
          ],
          tokenPath: 'data.access_token',
          expiresInPath: 'data.expires_in',
          tokenPrefix: 'Bearer',
          finalHeader: 'Authorization',
          secrets: { username: 'replace-me', password: 'replace-me' },
        },
        timeoutMs: 10000,
        maxRetries: 3,
        callbackAuthType: 'API_KEY',
        callbackSecret: '{{merchantCallbackApiKey}}',
        changedBy: '{{adminUsername}}',
      },
    }),
    consumerAdminRequest('Create or replace Kafka integration', 'PUT', '/v1/merchant-integrations/{{merchantMsisdn}}', {
      body: {
        channel: 'KAFKA',
        active: false,
        kafkaTopic: 'merchant.payment.requests',
        kafkaMessageKeySource: 'message.TransactionId',
        requestMapping: [
          { source: 'message.TransactionId', target: 'transactionId', location: 'message', required: true, type: 'string' },
          { source: 'message.Amount', target: 'amount', location: 'message', required: true, type: 'decimal' },
        ],
        responseMapping: {
          decisionPath: 'status',
          approvedValues: ['APPROVED'],
          rejectedValues: ['REJECTED'],
        },
        callbackAuthType: 'HMAC',
        callbackSecret: '{{merchantCallbackSecret}}',
        changedBy: '{{adminUsername}}',
      },
    }),
    consumerAdminRequest('Preview outbound mapping', 'POST', '/v1/merchant-integrations/{{merchantMsisdn}}/preview', {
      body: {
        message: {
          TransactionId: '{{transactionId}}',
          Amount: '100.00',
          Source: '{{sourceWalletId}}',
          Destination: '{{destinationWalletId}}',
        },
      },
    }),
    consumerAdminRequest('Activate/deactivate integration', 'PATCH', '/v1/merchant-integrations/{{merchantMsisdn}}/status', {
      body: { active: true, changedBy: '{{adminUsername}}' },
    }),
    consumerAdminRequest('Get integration version history', 'GET', '/v1/merchant-integrations/{{merchantMsisdn}}/history'),
    consumerAdminRequest(
      'Get recent delivery attempts',
      'GET',
      '/v1/merchant-integrations/{{merchantMsisdn}}/attempts?limit={{limit}}',
    ),
  ]),

  folder('Merchant confirmations', [
    request('Confirm merchant transaction (API key)', 'POST', `${consumer}/v1/merchant-confirmations`, {
      auth: noAuth,
      headers: [{ key: 'x-integration-key', value: '{{merchantCallbackApiKey}}', type: 'text' }],
      body: {
        correlationId: '{{correlationId}}',
        transactionId: '{{transactionId}}',
        decision: 'APPROVED',
        idempotencyKey: '{{idempotencyKey}}',
        externalReference: 'MERCHANT-{{$timestamp}}',
        message: 'Approved from Postman',
      },
    }),
    request('Confirm merchant transaction (HMAC)', 'POST', `${consumer}/v1/merchant-confirmations`, {
      auth: noAuth,
      body: {
        correlationId: '{{correlationId}}',
        transactionId: '{{transactionId}}',
        decision: 'APPROVED',
        idempotencyKey: '{{idempotencyKey}}',
        externalReference: 'MERCHANT-{{$timestamp}}',
        message: 'Approved from Postman with HMAC',
      },
      preRequest: [
        'const secret = pm.collectionVariables.get("merchantCallbackSecret");',
        'if (secret) {',
        '  const raw = pm.variables.replaceIn(pm.request.body.raw || "");',
        '  const signature = CryptoJS.HmacSHA256(raw, secret).toString(CryptoJS.enc.Hex);',
        '  pm.request.headers.upsert({ key: "x-finify-signature", value: `sha256=${signature}` });',
        '}',
      ],
      description: 'Signs the exact substituted raw JSON body using merchantCallbackSecret.',
    }),
    request('Get confirmation result', 'GET', `${consumer}/v1/merchant-confirmations/{{correlationId}}`, {
      auth: noAuth,
    }),
  ]),

  folder('Transaction disputes', [
    consumerAdminRequest('Reverse transaction for dispute', 'POST', '/v1/transaction-disputes/reverse', {
      body: {
        transactionId: '{{transactionId}}',
        disputeReference: 'DISPUTE-{{$timestamp}}',
        reason: 'Postman reversal test',
        requestedBy: '{{adminUsername}}',
      },
    }),
  ]),
];

const dailyQuery = 'businessDate={{businessDate}}&currency={{currency}}&reportingEntity={{reportingEntity}}';
const periodQuery = 'dateFrom={{dateFrom}}&dateTo={{dateTo}}&currency={{currency}}&reportingEntity={{reportingEntity}}';

const accountingItems = [
  folder('Health and docs', [
    request('Health', 'GET', `${accounting}/health`, { auth: noAuth }),
    request('Swagger UI', 'GET', `${accounting}/docs`, { auth: noAuth }),
    request('OpenAPI JSON', 'GET', `${accounting}/docs-json`, { auth: noAuth }),
  ]),

  folder('Accounting configuration', [
    accountingAdminRequest('List accounting configurations', 'GET', '/v1/accounting/configurations'),
    accountingAdminRequest('Create future accounting configuration', 'POST', '/v1/accounting/configurations', {
      body: {
        reportingEntity: '{{reportingEntity}}',
        currency: '{{currency}}',
        baseCurrency: 'GBP',
        businessTimezone: 'Europe/London',
        cutoffTime: '00:00:00',
        masterWallet: '{{masterSafeguardingWallet}}',
        strictSafeguarding: true,
        effectiveFrom: '{{effectiveFrom}}',
        maker: '{{adminUsername}}',
        checker: '{{checkerUsername}}',
      },
    }),
  ]),

  folder('Accounting periods and chart of accounts', [
    accountingAdminRequest(
      'List accounting periods',
      'GET',
      '/v1/accounting/periods?reportingEntity={{reportingEntity}}&limit={{limit}}',
    ),
    accountingAdminRequest('List chart of accounts', 'GET', '/v1/accounting/chart-of-accounts'),
    accountingAdminRequest('List wallet-to-GL mappings', 'GET', '/v1/accounting/chart-of-accounts/wallet-mappings'),
  ]),

  folder('End of day', [
    accountingAdminRequest('EOD dry run for one currency', 'POST', '/v1/accounting/eod/dry-run', {
      body: {
        businessDate: '{{businessDate}}',
        currency: '{{currency}}',
        reportingEntity: '{{reportingEntity}}',
        requestedBy: '{{adminUsername}}',
        correlationId: 'EOD-DRY-{{$timestamp}}',
      },
    }),
    accountingAdminRequest('Close EOD for one currency', 'POST', '/v1/accounting/eod/close', {
      body: {
        businessDate: '{{businessDate}}',
        currency: '{{currency}}',
        reportingEntity: '{{reportingEntity}}',
        requestedBy: '{{adminUsername}}',
        correlationId: 'EOD-CLOSE-{{$timestamp}}',
      },
      description: 'Mutating operation: run the dry-run first and inspect readiness.',
    }),
    accountingAdminRequest('Run EOD batch', 'POST', '/v1/accounting/eod/batch', {
      body: {
        businessDate: '{{businessDate}}',
        reportingEntity: '{{reportingEntity}}',
        requestedBy: '{{adminUsername}}',
        correlationId: 'EOD-BATCH-{{$timestamp}}',
        dryRun: true,
      },
    }),
    accountingAdminRequest('List EOD runs', 'GET', '/v1/accounting/eod/runs?limit={{limit}}'),
    accountingAdminRequest('Get EOD run details', 'GET', '/v1/accounting/eod/runs/{{eodRunId}}'),
  ]),

  folder('Financial statements - JSON', [
    accountingAdminRequest('Trial balance', 'GET', `/v1/accounting/trial-balance?${dailyQuery}`),
    accountingAdminRequest('Balance sheet', 'GET', `/v1/accounting/balance-sheet?${dailyQuery}`),
    accountingAdminRequest('Consolidated balance sheet', 'GET', '/v1/accounting/balance-sheet/consolidated?businessDate={{businessDate}}&baseCurrency=GBP&reportingEntity={{reportingEntity}}'),
    accountingAdminRequest('Income statement', 'GET', `/v1/accounting/income-statement?${periodQuery}`),
  ]),

  folder('Financial statements - CSV', [
    accountingAdminRequest('Download trial balance CSV', 'GET', `/v1/accounting/trial-balance.csv?${dailyQuery}`),
    accountingAdminRequest('Download balance sheet CSV', 'GET', `/v1/accounting/balance-sheet.csv?${dailyQuery}`),
    accountingAdminRequest('Download income statement CSV', 'GET', `/v1/accounting/income-statement.csv?${periodQuery}`),
  ]),

  folder('Account statements', [
    request(
      'Get my wallet statement',
      'GET',
      `${accounting}/v1/accounting/my/statement?${periodQuery}`,
      { auth: customerAuth },
    ),
    request(
      'Download my wallet statement CSV',
      'GET',
      `${accounting}/v1/accounting/my/statement.csv?${periodQuery}`,
      { auth: customerAuth },
    ),
    accountingAdminRequest(
      'Get statement for any wallet',
      'GET',
      `/v1/accounting/accounts/{{walletId}}/statement?${periodQuery}`,
    ),
    accountingAdminRequest(
      'Download statement CSV for any wallet',
      'GET',
      `/v1/accounting/accounts/{{walletId}}/statement.csv?${periodQuery}`,
    ),
  ]),

  folder('Safeguarding reconciliation', [
    accountingAdminRequest(
      'Get safeguarding reconciliation',
      'GET',
      `/v1/accounting/reconciliation/safeguarding?${dailyQuery}`,
    ),
  ]),
];

const creditRuleItems = [
  folder('Health and docs', [
    request('Health', 'GET', `${creditRules}/health`, { auth: noAuth }),
    request('Swagger UI', 'GET', `${creditRules}/docs`, { auth: noAuth }),
    request('OpenAPI JSON', 'GET', `${creditRules}/docs-json`, { auth: noAuth }),
  ]),

  folder('1. External integrations', [
    creditRuleAdminRequest(
      'List HTTP integrations',
      'GET',
      '/v1/credit-rule-integrations?page={{page}}&limit={{limit}}',
    ),
    creditRuleAdminRequest('Create bureau integration', 'POST', '/v1/credit-rule-integrations', {
      body: {
        code: 'BUREAU_PRIMARY',
        name: 'Primary credit bureau',
        method: 'POST',
        urlTemplate: 'https://bureau.example.com/v1/check',
        requestTemplate: {
          customerId: '{{customerId}}',
          applicationId: '{{applicationId}}',
        },
        authType: 'API_KEY',
        authHeader: 'x-api-key',
        authSecretEnv: 'BUREAU_API_KEY',
        timeoutMs: 5000,
        cacheTtlSeconds: 300,
      },
      tests: captureCreditId('creditIntegrationId'),
    }),
    creditRuleAdminRequest(
      'Update HTTP integration',
      'PATCH',
      '/v1/credit-rule-integrations/{{creditIntegrationId}}',
      { body: { timeoutMs: 7000, cacheTtlSeconds: 300 } },
    ),
    creditRuleAdminRequest(
      'Approve HTTP integration',
      'POST',
      '/v1/credit-rule-integrations/{{creditIntegrationId}}/approve',
      {
        preRequest: [
          'pm.request.headers.upsert({ key: "x-actor-id", value: pm.collectionVariables.get("creditRuleCheckerId") });',
        ],
      },
    ),
  ]),

  folder('2. AI score providers', [
    creditRuleAdminRequest('List score providers', 'GET', '/v1/credit-score-providers'),
    creditRuleAdminRequest('Create AI score provider', 'POST', '/v1/credit-score-providers', {
      body: {
        code: 'AI_PRIMARY',
        name: 'Primary AI score',
        httpIntegrationId: '{{creditIntegrationId}}',
        scoreResponsePath: 'decision.score',
        categoryResponsePath: 'decision.category',
        modelIdResponsePath: 'decision.modelId',
        modelVersionResponsePath: 'decision.modelVersion',
        referenceResponsePath: 'decision.referenceId',
        scoredAtResponsePath: 'decision.scoredAt',
        scoreMin: 0,
        scoreMax: 1000,
        validityMinutes: 43200,
        isDefault: true,
      },
      tests: captureCreditId('creditScoreProviderId'),
    }),
    creditRuleAdminRequest(
      'Update AI score provider',
      'PATCH',
      '/v1/credit-score-providers/{{creditScoreProviderId}}',
      { body: { validityMinutes: 10080, isDefault: true } },
    ),
    creditRuleAdminRequest(
      'Approve AI score provider',
      'POST',
      '/v1/credit-score-providers/{{creditScoreProviderId}}/approve',
      {
        preRequest: [
          'pm.request.headers.upsert({ key: "x-actor-id", value: pm.collectionVariables.get("creditRuleCheckerId") });',
        ],
      },
    ),
  ]),

  folder('3. Master policy versions', [
    creditRuleAdminRequest(
      'List master rules',
      'GET',
      '/v1/credit-rule-masters?page={{page}}&limit={{limit}}&status=DRAFT',
    ),
    creditRuleAdminRequest('Create category and product master rule', 'POST', '/v1/credit-rule-masters', {
      body: {
        ruleCode: 'PRIME_CASH_LOAN',
        name: 'Prime cash-loan policy',
        customerCategory: 'PRIME',
        productId: '{{creditProductId}}',
        currency: '{{currency}}',
        minimumScore: 600,
        maximumScore: 1000,
        baseLimit: 0,
        minimumLimit: 100,
        maximumLimit: 5000,
        defaultOutcome: 'REJECTED',
        autoApprovalEnabled: true,
        defaultRepaymentOptionIds: [],
        scoreProviderId: '{{creditScoreProviderId}}',
      },
      tests: captureCreditId('creditMasterRuleId'),
    }),
    creditRuleAdminRequest('Get master rule and children', 'GET', '/v1/credit-rule-masters/{{creditMasterRuleId}}'),
    creditRuleAdminRequest('Update master rule', 'PATCH', '/v1/credit-rule-masters/{{creditMasterRuleId}}', {
      body: { maximumLimit: 6000 },
    }),
    creditRuleAdminRequest('Clone master-rule version', 'POST', '/v1/credit-rule-masters/{{creditMasterRuleId}}/clone', {
      tests: captureCreditId('creditClonedMasterRuleId'),
    }),
  ]),

  folder('4. Ordered child rules', [
    creditRuleAdminRequest('List child rules', 'GET', '/v1/credit-rule-masters/{{creditMasterRuleId}}/rules'),
    creditRuleAdminRequest('Add cash-flow range and EMI offer rule', 'POST', '/v1/credit-rule-masters/{{creditMasterRuleId}}/rules', {
      body: {
        name: 'Cash flow between 50 and 200',
        priority: 10,
        exclusiveGroup: 'CASH_FLOW_BAND',
        sourceType: 'POSTGRES',
        schemaName: 'public',
        tableName: '{{creditSourceTable}}',
        lookupColumn: '{{creditLookupColumn}}',
        valueColumn: 'avg_high_cash_flow',
        readMode: 'SINGLE',
        dataType: 'DECIMAL',
        condition: {
          operator: 'RANGE',
          lowerValue: 50,
          upperValue: 200,
          lowerInclusive: false,
          upperInclusive: false,
        },
        actionOnMatch: {
          type: 'SET_CREDIT_OFFER',
          limit: 1200,
          repaymentOptionIds: ['EMI-3', 'EMI-6'],
        },
        actionOnNoMatch: { type: 'CONTINUE' },
        sourceFailureAction: {
          type: 'MANUAL_REVIEW',
          reasonCode: 'CASH_FLOW_SOURCE_UNAVAILABLE',
        },
      },
      tests: captureCreditId('creditChildRuleId'),
    }),
    creditRuleAdminRequest(
      'Update child rule',
      'PATCH',
      '/v1/credit-rule-masters/{{creditMasterRuleId}}/rules/{{creditChildRuleId}}',
      { body: { priority: 20, stopOnMatch: false } },
    ),
    creditRuleAdminRequest(
      'Delete draft child rule',
      'DELETE',
      '/v1/credit-rule-masters/{{creditMasterRuleId}}/rules/{{creditChildRuleId}}',
    ),
    creditRuleAdminRequest(
      'Get rule-builder capabilities',
      'GET',
      '/v1/credit-rule-metadata/capabilities',
    ),
    creditRuleAdminRequest(
      'Browse approved database tables',
      'GET',
      '/v1/credit-rule-metadata/database?schema=public',
    ),
    creditRuleAdminRequest(
      'Browse columns for selected table',
      'GET',
      '/v1/credit-rule-metadata/database?schema=public&table={{creditSourceTable}}',
    ),
  ]),

  folder('5. Publication and simulation', [
    creditRuleAdminRequest('Submit policy for approval', 'POST', '/v1/credit-rule-masters/{{creditMasterRuleId}}/submit', {
      body: { comment: 'Ready for credit-risk review' },
    }),
    creditRuleAdminRequest('Approve policy', 'POST', '/v1/credit-rule-masters/{{creditMasterRuleId}}/approve', {
      body: { comment: 'Approved by credit risk' },
      preRequest: [
        'pm.request.headers.upsert({ key: "x-actor-id", value: pm.collectionVariables.get("creditRuleCheckerId") });',
      ],
    }),
    creditRuleAdminRequest('Reject policy', 'POST', '/v1/credit-rule-masters/{{creditMasterRuleId}}/reject', {
      body: { reason: 'Policy requires revised DPD limits' },
      preRequest: [
        'pm.request.headers.upsert({ key: "x-actor-id", value: pm.collectionVariables.get("creditRuleCheckerId") });',
      ],
    }),
    creditRuleAdminRequest('Activate approved policy', 'POST', '/v1/credit-rule-masters/{{creditMasterRuleId}}/activate', {
      preRequest: [
        'pm.request.headers.upsert({ key: "x-actor-id", value: pm.collectionVariables.get("creditRuleCheckerId") });',
      ],
    }),
    creditRuleAdminRequest('Retire active policy', 'POST', '/v1/credit-rule-masters/{{creditMasterRuleId}}/retire', {
      preRequest: [
        'pm.request.headers.upsert({ key: "x-actor-id", value: pm.collectionVariables.get("creditRuleCheckerId") });',
      ],
    }),
    creditRuleAdminRequest('Simulate draft or published policy', 'POST', '/v1/credit-rule-masters/{{creditMasterRuleId}}/simulate', {
      body: {
        customerId: '{{customerId}}',
        applicationId: '{{applicationId}}',
        productId: '{{creditProductId}}',
        currency: '{{currency}}',
        requestedAmount: 1000,
        existingExposure: 0,
        pendingReservations: 0,
        aiResult: { score: 720, category: 'PRIME' },
      },
      tests: captureCreditId('creditExecutionId'),
    }),
  ]),

  folder('6. Production decisions and audit', [
    creditDecisionRequest('Evaluate customer credit', 'POST', '/v1/credit-decisions/evaluate', {
      body: {
        customerId: '{{customerId}}',
        applicationId: '{{applicationId}}',
        productId: '{{creditProductId}}',
        currency: '{{currency}}',
        requestedAmount: 1000,
        existingExposure: 0,
        pendingReservations: 0,
        forceRescore: false,
      },
      tests: captureCreditId('creditExecutionId'),
    }),
    creditDecisionRequest('Get production decision trace', 'GET', '/v1/credit-decisions/{{creditExecutionId}}'),
    creditRuleAdminRequest(
      'List decision executions',
      'GET',
      '/v1/credit-rule-executions?page={{page}}&limit={{limit}}',
    ),
    creditRuleAdminRequest('Get complete administrative decision trace', 'GET', '/v1/credit-rule-executions/{{creditExecutionId}}'),
  ]),
];

const collection = {
  info: {
    _postman_id: '3a94a0ef-1ba2-4aae-a714-b20775b7eaf1',
    name: 'Finify Complete API',
    description: [
      'Import-ready collection generated from the repository controllers and DTOs.',
      '',
      'Services:',
      '- Producer API: {{producerBaseUrl}}',
      '- Consumer/integration API: {{consumerBaseUrl}}',
      '- Accounting API: {{accountingBaseUrl}}',
      '- Credit-rule API: {{creditRuleBaseUrl}}',
      '',
      'Run Customer login and Admin login first; their test scripts store bearer tokens.',
      'Maker/checker approval must use a different administrator from the maker.',
      'Mutating requests contain sample data and should be reviewed before running.',
      'The Streamlit flight finder has no REST API and is intentionally excluded.',
    ].join('\n'),
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  event: [
    {
      listen: 'prerequest',
      script: {
        type: 'text/javascript',
        exec: [
          'if (!pm.collectionVariables.get("correlationId")) {',
          '  pm.collectionVariables.set("correlationId", pm.variables.replaceIn("{{$guid}}"));',
          '}',
          'if (!pm.collectionVariables.get("idempotencyKey")) {',
          '  pm.collectionVariables.set("idempotencyKey", pm.variables.replaceIn("{{$guid}}"));',
          '}',
        ],
      },
    },
  ],
  variable: [
    { key: 'producerBaseUrl', value: 'http://localhost:5002/finify', type: 'string' },
    { key: 'consumerBaseUrl', value: 'http://localhost:5003', type: 'string' },
    { key: 'accountingBaseUrl', value: 'http://localhost:5004', type: 'string' },
    { key: 'creditRuleBaseUrl', value: 'http://localhost:5005', type: 'string' },
    { key: 'customerUsername', value: '447700900123', type: 'string' },
    { key: 'customerPin', value: '', type: 'string' },
    { key: 'customerToken', value: '', type: 'string' },
    { key: 'adminUsername', value: 'admin', type: 'string' },
    { key: 'checkerUsername', value: 'checker', type: 'string' },
    { key: 'adminEmail', value: 'admin@example.com', type: 'string' },
    { key: 'adminDisplayName', value: 'Finify Administrator', type: 'string' },
    { key: 'adminPassword', value: '', type: 'string' },
    { key: 'adminSetupToken', value: '', type: 'string' },
    { key: 'adminAccessToken', value: '', type: 'string' },
    { key: 'adminRefreshToken', value: '', type: 'string' },
    { key: 'consumerAdminApiKey', value: '', type: 'string' },
    { key: 'accountingAdminApiKey', value: '', type: 'string' },
    { key: 'creditRuleAdminApiKey', value: '', type: 'string' },
    { key: 'creditRuleEvaluationApiKey', value: '', type: 'string' },
    { key: 'creditRuleActorId', value: 'credit-maker', type: 'string' },
    { key: 'creditRuleCheckerId', value: 'credit-checker', type: 'string' },
    { key: 'creditIntegrationId', value: '1', type: 'string' },
    { key: 'creditScoreProviderId', value: '1', type: 'string' },
    { key: 'creditMasterRuleId', value: '1', type: 'string' },
    { key: 'creditClonedMasterRuleId', value: '2', type: 'string' },
    { key: 'creditChildRuleId', value: '1', type: 'string' },
    { key: 'creditExecutionId', value: '', type: 'string' },
    { key: 'creditProductId', value: 'CASH-LOAN-1', type: 'string' },
    { key: 'creditSourceTable', value: 'customer_credit_metrics', type: 'string' },
    { key: 'creditLookupColumn', value: 'customer_id', type: 'string' },
    { key: 'customerId', value: '447700900123', type: 'string' },
    { key: 'applicationId', value: 'APP-POSTMAN-1', type: 'string' },
    { key: 'merchantCallbackApiKey', value: '', type: 'string' },
    { key: 'merchantCallbackSecret', value: '', type: 'string' },
    { key: 'merchantMsisdn', value: '447700000001', type: 'string' },
    { key: 'correlationId', value: '', type: 'string' },
    { key: 'idempotencyKey', value: '', type: 'string' },
    { key: 'transactionId', value: '1', type: 'string' },
    { key: 'sourceWalletId', value: '447700900123', type: 'string' },
    { key: 'destinationWalletId', value: '447700000001', type: 'string' },
    { key: 'walletId', value: '447700900123', type: 'string' },
    { key: 'ownerMsisdn', value: '447700900123', type: 'string' },
    { key: 'walletCode', value: '203', type: 'string' },
    { key: 'masterSafeguardingWallet', value: '9800001110', type: 'string' },
    { key: 'keyword', value: 'PMNT', type: 'string' },
    { key: 'changeRequestId', value: '1', type: 'string' },
    { key: 'chargeId', value: '1001', type: 'string' },
    { key: 'chargeDetailId', value: '1', type: 'string' },
    { key: 'chargeMappingId', value: '1', type: 'string' },
    { key: 'keywordChargeId', value: '1001', type: 'string' },
    { key: 'keywordChargeRowId', value: '1', type: 'string' },
    { key: 'commissionId', value: '1', type: 'string' },
    { key: 'registrationId', value: '1', type: 'string' },
    { key: 'eodRunId', value: '1', type: 'string' },
    { key: 'businessDate', value: '2026-07-25', type: 'string' },
    { key: 'dateFrom', value: '2026-07-01', type: 'string' },
    { key: 'dateTo', value: '2026-07-31', type: 'string' },
    { key: 'effectiveFrom', value: '2026-08-01', type: 'string' },
    { key: 'currency', value: 'GBP', type: 'string' },
    { key: 'reportingEntity', value: 'FINIFY_UK', type: 'string' },
    { key: 'page', value: '1', type: 'string' },
    { key: 'limit', value: '50', type: 'string' },
  ],
  item: [
    folder('Producer API (port 5002)', producerItems),
    folder('Consumer / Merchant Integration API (port 5003)', consumerItems),
    folder('Accounting API (port 5004)', accountingItems),
    folder('Credit Rule API (port 5005)', creditRuleItems),
  ],
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outputFile}`);
