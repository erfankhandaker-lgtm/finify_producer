BEGIN;

CREATE TABLE IF NOT EXISTS public.sw_tbl_merchant_integration_attempt (
  id bigserial PRIMARY KEY,
  transactionid bigint NOT NULL,
  merchant_msisdn bigint NOT NULL,
  merchant_type text NOT NULL,
  service_url text NOT NULL,
  idempotency_key text NOT NULL,
  confirmation_status varchar(16) NOT NULL DEFAULT 'PENDING',
  posting_status varchar(16) NOT NULL DEFAULT 'RESERVED',
  attempt_count integer NOT NULL DEFAULT 0,
  http_status integer NULL,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NULL,
  response_code text NULL,
  response_message text NULL,
  last_error text NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at timestamp without time zone NULL,
  CONSTRAINT "FK_MERCHANT_ATTEMPT_TRANSACTION"
    FOREIGN KEY (transactionid)
    REFERENCES public."SW_TBL_TRANSACTION_REQUEST" ("Transaction_ID")
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "UQ_MERCHANT_ATTEMPT_TRANSACTION" UNIQUE (transactionid),
  CONSTRAINT "UQ_MERCHANT_ATTEMPT_IDEMPOTENCY" UNIQUE (idempotency_key),
  CONSTRAINT "CK_MERCHANT_ATTEMPT_CONFIRMATION_STATUS"
    CHECK (confirmation_status IN ('PENDING', 'APPROVED', 'REJECTED', 'UNKNOWN')),
  CONSTRAINT "CK_MERCHANT_ATTEMPT_POSTING_STATUS"
    CHECK (posting_status IN ('RESERVED', 'COMPLETED', 'REVERSED', 'BLOCKED')),
  CONSTRAINT "CK_MERCHANT_ATTEMPT_COUNT" CHECK (attempt_count >= 0)
);

CREATE INDEX IF NOT EXISTS "IDX_MERCHANT_ATTEMPT_MERCHANT"
  ON public.sw_tbl_merchant_integration_attempt (merchant_msisdn, created_at);

CREATE INDEX IF NOT EXISTS "IDX_MERCHANT_ATTEMPT_STATUS"
  ON public.sw_tbl_merchant_integration_attempt (confirmation_status, posting_status, updated_at);

CREATE TABLE IF NOT EXISTS public.sw_tbl_transaction_dispute (
  id bigserial PRIMARY KEY,
  transactionid bigint NOT NULL,
  dispute_reference text NOT NULL,
  reason text NULL,
  requested_by text NULL,
  status varchar(16) NOT NULL DEFAULT 'REQUESTED',
  reversal_journal_id bigint NULL,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_payload jsonb NULL,
  last_error text NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamp without time zone NULL,
  CONSTRAINT "FK_TRANSACTION_DISPUTE_TRANSACTION"
    FOREIGN KEY (transactionid)
    REFERENCES public."SW_TBL_TRANSACTION_REQUEST" ("Transaction_ID")
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FK_TRANSACTION_DISPUTE_REVERSAL_JOURNAL"
    FOREIGN KEY (reversal_journal_id)
    REFERENCES public.sw_tbl_accounting_journal (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "UQ_TRANSACTION_DISPUTE_REFERENCE"
    UNIQUE (transactionid, dispute_reference),
  CONSTRAINT "CK_TRANSACTION_DISPUTE_STATUS"
    CHECK (status IN ('REQUESTED', 'REVERSED', 'BLOCKED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS "IDX_TRANSACTION_DISPUTE_STATUS"
  ON public.sw_tbl_transaction_dispute (status, updated_at);

COMMIT;
