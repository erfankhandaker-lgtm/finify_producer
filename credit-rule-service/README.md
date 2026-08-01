# Finify Credit Rule Service

This NestJS service manages versioned credit policies and executes explainable
credit decisions. It listens on port `5005`.

## What it supports

- AI score retrieval with a valid cached-score fallback
- category, product, currency, and score-band master-rule selection
- exact PostgreSQL table/lookup/value-column sources
- approved HTTP/JSON sources such as credit-bureau checks
- numeric ranges, nested AND/OR/NOT conditions, and ordered rule execution
- fixed, source-derived, multiplied, additive, subtractive, and capped limits
- product repayment-option/EMI allocation
- rejection and manual-review reasons
- maker/checker approval, version cloning, activation, retirement, and simulation
- complete decision and per-rule execution traces

## Setup

Apply `database/migrations/014_credit_rule_engine.sql` followed by
`database/migrations/015_credit_scored_customers.sql`, configure the values in
`.env.example`, then:

```bash
npm install
npm test
npm run start:dev
```

Swagger UI is at `http://localhost:5005/docs`; OpenAPI JSON is at
`http://localhost:5005/docs-json`.

To transactionally load or refresh a tab-separated scoring export by `_id`,
run this command from the repository root:

```bash
node scripts/load-credit-scored-customers.js /absolute/path/to/scored-customers.tsv
```

The loader validates every row and target data type, derives
`customer_category` from `score_grade` or `band`, and rolls back the complete
import if any row is invalid.

For development end-to-end testing, missing active customer profiles and
zero-balance main wallets can then be provisioned idempotently:

```bash
E2E_CUSTOMER_PIN=replace-with-a-test-pin \
E2E_CUSTOMER_WALLET_CURRENCY=UGX \
node scripts/provision-scored-customer-wallets.js
```

The provisioner never changes an existing profile, wallet, PIN, or balance.
New wallets receive verified type `103` or unverified type `111` based on the
scored KYC status, and every created wallet receives an operational audit row.

Administration routes use `CREDIT_RULE_ADMIN_API_KEY`. Production decision
routes use `CREDIT_RULE_EVALUATION_API_KEY`. Send the selected value in
`x-api-key`. Every administrative mutation also requires `x-actor-id`, and the
maker and checker must be different people.

## Safe dynamic data access

Business users select an approved schema, exact table, customer lookup column,
value column, and read mode. The service verifies those identifiers against
PostgreSQL metadata before publication, quotes identifiers at runtime, and
parameterizes the customer value. Arbitrary SQL is never accepted.

External sources must be configured as approved integrations. HTTPS is required
unless explicitly relaxed for local development, and
`CREDIT_RULE_HTTP_ALLOWED_HOSTS` can restrict outbound hosts.

For value bands, use `RANGE`. This example matches values above 50 and below
200:

```json
{
  "operator": "RANGE",
  "lowerValue": 50,
  "upperValue": 200,
  "lowerInclusive": false,
  "upperInclusive": false
}
```

An offer action can allocate both the limit and allowed EMI options:

```json
{
  "type": "SET_CREDIT_OFFER",
  "limit": 1200,
  "repaymentOptionIds": ["EMI-3", "EMI-6"]
}
```
