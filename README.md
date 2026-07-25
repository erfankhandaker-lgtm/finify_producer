# Finify Service Producer

## Local Docker stack

The repository runs the producer API and transaction consumer in `compose.yaml`. Both services use the existing remote PostgreSQL and Kafka settings from the root `.env` file. Redis is used only by the producer.

```bash
docker compose up --build
```

The producer API is available at `http://localhost:5002/finify`. The root `.env` must provide the database, Redis, and Kafka variables used by the producer. The consumer supports the same encrypted credential format when `IS_CRD_PLAIN=false`.

A NestJS-based payment service producer API with Kafka, Redis, TypeORM, and Docker CI support.

## Overview

This project is built using NestJS and provides message-driven service production for payment processing and event delivery. It includes:

- Kafka producer/consumer configuration
- Redis integration
- TypeORM entities and database setup
- Winston logging
- Docker build workflow via GitHub Actions

## Getting Started

1. Install dependencies

```bash
npm install
```

2. Create local environment configuration

```bash
cp .env.example .env
```

3. Update `.env` with your environment-specific values.

4. Start the app in development mode

```bash
npm run start:dev
```

## Available Scripts

- `npm run build` - compile TypeScript sources to `dist`
- `npm run start` - start the NestJS application
- `npm run start:dev` - start in watch mode
- `npm run lint` - run ESLint and auto-fix issues
- `npm run test` - run unit tests
- `npm run test:e2e` - run end-to-end tests

## Environment

Use `.env.example` as a template for local configuration. Do not commit `.env` to source control.

## Docker CI

GitHub Actions builds and pushes a Docker image using `.github/workflows/docker-image.yml`.

## Notes

- `.env` is ignored by `.gitignore` for security.
- `dist` and `node_modules` are excluded from source control.

## Admin authentication

Admin authentication is isolated from wallet/PIN authentication under
`/finify/admin/auth`. Access tokens expire after 15 minutes and refresh tokens
are rotated and stored only as hashes.

Apply `database/migrations/001_admin_auth.sql` through the normal database
change process. Then create the initial administrator by setting the four
`ADMIN_BOOTSTRAP_*` environment variables and running:

```bash
npm run admin:create
```

Available endpoints:

- `GET /finify/admin/auth/setup/status`
- `POST /finify/admin/auth/setup/initialize`
- `POST /finify/admin/auth/login`
- `POST /finify/admin/auth/refresh`
- `POST /finify/admin/auth/logout`
- `GET /finify/admin/auth/me`

## Keyword and wallet-type administration

`SW_TBL_KEYWORD` and `SW_TBL_WALLET_TYPE` are managed through a strict
maker-checker workflow. Apply these migrations in order:

1. `database/migrations/001_admin_auth.sql`
2. `database/migrations/009_reference_data_maker_checker.sql`
3. `database/migrations/010_aml_configuration_maker_checker.sql`
4. `database/migrations/011_aml_transaction_lifecycle.sql`
5. `database/migrations/012_eod_accounting.sql`
6. `database/migrations/013_wallet_operations.sql`

Migration `009` creates the staging/audit table and the following permissions:

- `reference_data.read` — list live records and request history
- `reference_data.make` — submit and cancel changes
- `reference_data.check` — approve or reject changes

They are assigned to `super_admin` by default. The authenticated JWT supplies
the maker/checker identity; clients must not send usernames in CRUD payloads.
A different authenticated administrator must approve or reject each request.
Pending or rejected requests never change the live master tables.

UI CRUD endpoints:

- `GET|POST /finify/admin/reference-data/keywords`
- `GET|PATCH|DELETE /finify/admin/reference-data/keywords/{keyword}`
- `GET|POST /finify/admin/reference-data/wallet-types`
- `GET|PATCH|DELETE /finify/admin/reference-data/wallet-types/{walletId}`
- `GET|POST /finify/admin/reference-data/aml-configurations`
- `GET|PATCH|DELETE /finify/admin/reference-data/aml-configurations/{walletCode}/{keyword}`

Approval queue and history endpoints:

- `GET /finify/admin/reference-data/change-requests`
- `GET /finify/admin/reference-data/change-requests/{id}`
- `POST /finify/admin/reference-data/change-requests/{id}/approve`
- `POST /finify/admin/reference-data/change-requests/{id}/reject`
- `POST /finify/admin/reference-data/change-requests/{id}/cancel`

`DELETE` submits a deactivation request. Once approved, the record is marked
inactive instead of being physically deleted, preserving transaction and audit
references. Swagger UI is available outside production at
`http://localhost:5002/finify/api`; OpenAPI JSON is at
`http://localhost:5002/finify/api-json`.

AML configuration uses the specific `SW_TBL_WALLET_TYPE.Wallet_ID` as
`walletCode`; the legacy `SW_TBL_AML.Wallet_Type` column stores this value, not
the broad wallet class. Exactly one active or inactive profile exists for each
wallet-code/keyword pair. The API and database require positive limits and
enforce `max transaction <= daily amount <= monthly amount` and
`daily count <= monthly count`. Deletion is an approved soft deactivation.

### AML transaction lifecycle

For non-system financial keywords, the producer calls
`sw_proc_aml_reserve` after all request/PIN/charge checks and before publishing
to Kafka. The reservation check is serialized per source wallet and keyword and
includes both completed summary usage and other pending Kafka reservations.
Requests are rejected when the per-transaction, daily amount/count, or monthly
amount/count limit would be exceeded. Missing active AML configuration also
fails closed.

The consumer calls `sw_proc_aml_finalize` idempotently:

- `COMPLETED` after a direct posting or successful special-merchant L2 settlement;
- `RELEASED` after a terminal failure or merchant rejection;
- `REVERSED` after a completed transaction reversal.

Only `COMPLETED` updates `SW_TBL_AML_SUMMARY`. Kafka retries and repeated
merchant callbacks are safe because `transactionid` uniquely identifies the
reservation and every finalization outcome is idempotent. System keywords and
messages created before migration `011` have no reservation and remain
backward-compatible.

### EOD accounting service

`accounting-service/` is a separate NestJS service on port `5004`. It owns the
UK-local-midnight accounting calendar, per-currency EOD orchestration,
safeguarding reconciliation, daily wallet/GL snapshots, and financial and
account-holder reports. Transaction posting remains in `consumer-service`.

Migration `012` adds:

- `business_date` and reporting-entity context to accounting journals and entries;
- a chart of accounts prepared for wallets, safeguarding, remittance, FX, and loans;
- one effective-dated master safeguarding wallet configuration per currency;
- GBP as base reporting currency and `Europe/London` as the default business timezone;
- EOD periods, batches, runs, persistent steps/exceptions, daily wallet balances,
  daily GL balances, and approved FX rates;
- `sw_proc_accounting_close_eod` plus trial-balance, balance-sheet,
  income-statement, and account-statement functions.

Run `POST /v1/accounting/eod/dry-run` before closing. Automatic midnight closure
is disabled by default and can be enabled with `ACCOUNTING_AUTO_EOD=true`. When
enabled, persisted-period catch-up automatically recovers missed cutoff dates
oldest-first after downtime and stops on the first blocked date.

### Wallet operations

Migration `013` keeps `SW_TBL_WALLET` as the only balance store and adds explicit
owner/purpose metadata plus immutable operational audit history. The profile
MSISDN wallet remains the customer's main/default wallet.

Customer bearer-token endpoints:

- `GET|POST /finify/wallets`
- `GET /finify/wallets/{walletId}`
- `POST /finify/wallets/{walletId}/default`
- `GET /finify/wallets/{walletId}/transactions`

Administrative endpoints require `wallets.read` or `wallets.manage`:

- `GET /finify/admin/wallets`
- `PATCH /finify/admin/wallets/{walletId}/status`
- `GET /finify/admin/wallets/{walletId}/history`

Wallets are never physically deleted. Main customer wallets cannot be closed,
and a default wallet must be replaced before it can be suspended or frozen.

### Admin UI

The Next.js administration interface is in `admin-ui`. It includes a one-time,
four-step first-administrator wizard that checks the API and permanently locks
initialization after the first user is created.

```bash
cd admin-ui
cp .env.example .env.local
npm install
npm run dev
```

The UI runs at `http://localhost:3100` by default. Set
`NEXT_PUBLIC_API_URL` when the API is hosted somewhere other than
`http://localhost:5002/finify`.

## Merchant integration consumer API

The consumer exposes its UI/admin and merchant callback API on port `5003`:

- Swagger UI: `http://localhost:5003/docs`
- Shareable OpenAPI JSON: `http://localhost:5003/docs-json`
- Health: `GET /health`

Apply migrations `006`, `007`, and `008` in order. Migration `008` stores the
selected `API` or `KAFKA` option in `SW_TBL_PROFILE_MERCHANT.Integration_Channel`
and keeps field mappings, login/token settings, encrypted secrets, version
history, delivery attempts, and callback results in dedicated integration tables.

UI administration endpoints (use `x-admin-api-key` when configured):

- `GET /v1/merchant-integrations/source-fields`
- `GET /v1/merchant-integrations/{merchantMsisdn}`
- `PUT /v1/merchant-integrations/{merchantMsisdn}`
- `POST /v1/merchant-integrations/{merchantMsisdn}/preview`
- `PATCH /v1/merchant-integrations/{merchantMsisdn}/status`
- `GET /v1/merchant-integrations/{merchantMsisdn}/history`
- `GET /v1/merchant-integrations/{merchantMsisdn}/attempts`
- `POST /v1/transaction-disputes/reverse`

For Kafka integrations, every published message includes a `_finify` object with
the correlation ID, transaction ID, idempotency key, configuration version, and
callback URL. The external processor completes the flow through:

- `POST /v1/merchant-confirmations` — `APPROVED` settles L2; `REJECTED` reverses L1
- `GET /v1/merchant-confirmations/{correlationId}` — retrieve the processed result

Set a unique `INTEGRATION_SECRET_KEY` (minimum 32 characters),
`INTEGRATION_ADMIN_API_KEY`, and externally reachable
`MERCHANT_CONFIRMATION_PUBLIC_URL` outside local development. Swagger documents
the API-key and HMAC callback headers and complete request schemas.
