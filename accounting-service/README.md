# Finify Accounting Service

Standalone EOD, general-ledger reporting, safeguarding reconciliation, and
account-statement service.

## Responsibilities

- Runs one atomic PostgreSQL EOD close per reporting entity, business date, and currency.
- Uses `Europe/London` and local midnight through effective-dated configuration.
- Keeps one safeguarding master wallet per currency and GBP as the base reporting currency.
- Produces daily wallet and GL snapshots, trial balance, balance sheet, income statement,
  safeguarding reconciliation, and wallet-holder statements.
- Keeps application logs structured and persists procedure steps/exceptions in PostgreSQL.

Transaction posting remains in `consumer-service`; this service never directly updates
transaction wallet balances.

## API

Swagger is available at `/docs`.

- `POST /v1/accounting/eod/dry-run`
- `POST /v1/accounting/eod/close`
- `POST /v1/accounting/eod/batch`
- `GET /v1/accounting/eod/runs`
- `GET /v1/accounting/trial-balance`
- `GET /v1/accounting/balance-sheet`
- `GET /v1/accounting/income-statement`
- `GET /v1/accounting/reconciliation/safeguarding`
- `GET /v1/accounting/my/statement`

Trial balance, balance sheet, and income statement rows can also be downloaded
from the corresponding `.csv` endpoints. All report queries validate ISO dates,
currency codes, reporting entities, and date-range ordering.

Administrative routes use `x-admin-api-key`. The self-statement route validates the
same bearer JWT issued by the producer and derives the wallet from the token.

## Scheduler

Set `ACCOUNTING_AUTO_EOD=true` to enable the local-midnight scheduler. The scheduler
compares the local cutoff with persisted `CLOSED` periods on startup and every poll.
If the service misses midnight, it automatically closes overdue dates oldest-first;
it stops at the first blocked date so a later day can never close over a failed prior
day. `ACCOUNTING_CATCH_UP_MAX_DAYS_PER_TICK` (default `31`) bounds each recovery pass.
PostgreSQL advisory locks and unique run versions make concurrent triggers safe.

All manual EOD routes and their request schemas, responses, and recovery semantics
are documented in Swagger at `/docs` (OpenAPI JSON: `/docs-json`).

## Future products

The chart reserves accounts for remittance-in-transit, FX spread, loan receivables,
interest income, and expected credit losses. Remittance and loan subledgers will run
before GL aggregation when those products are enabled.
