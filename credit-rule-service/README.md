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

Apply `database/migrations/014_credit_rule_engine.sql`, configure the values in
`.env.example`, then:

```bash
npm install
npm test
npm run start:dev
```

Swagger UI is at `http://localhost:5005/docs`; OpenAPI JSON is at
`http://localhost:5005/docs-json`.

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
