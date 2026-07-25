BEGIN;

ALTER TABLE public."SW_TBL_PROFILE_MERCHANT"
  ADD COLUMN IF NOT EXISTS "Integration_Channel" varchar(10);

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CK_PROFILE_MERCHANT_INTEGRATION_CHANNEL') THEN
    ALTER TABLE public."SW_TBL_PROFILE_MERCHANT"
      ADD CONSTRAINT "CK_PROFILE_MERCHANT_INTEGRATION_CHANNEL"
      CHECK ("Integration_Channel" IS NULL OR "Integration_Channel" IN ('API', 'KAFKA'));
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS "IDX_PROFILE_MERCHANT_INTEGRATION_CHANNEL"
  ON public."SW_TBL_PROFILE_MERCHANT" ("Integration_Channel")
  WHERE "Integration_Channel" IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sw_tbl_merchant_integration_config (
  id bigserial PRIMARY KEY,
  merchant_msisdn bigint NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT false,
  api_url text NULL,
  api_method varchar(10) NOT NULL DEFAULT 'POST',
  kafka_topic varchar(255) NULL,
  kafka_message_key_source text NULL,
  request_mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
  response_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  timeout_ms integer NOT NULL DEFAULT 10000,
  max_retries integer NOT NULL DEFAULT 3,
  callback_auth_type varchar(16) NOT NULL DEFAULT 'API_KEY',
  callback_secret_ciphertext text NULL,
  created_by text NULL,
  updated_by text NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FK_MERCHANT_INTEGRATION_CONFIG_PROFILE"
    FOREIGN KEY (merchant_msisdn)
    REFERENCES public."SW_TBL_PROFILE_MERCHANT" ("MSISDN")
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "UQ_MERCHANT_INTEGRATION_CONFIG_MERCHANT" UNIQUE (merchant_msisdn),
  CONSTRAINT "CK_MERCHANT_INTEGRATION_API_METHOD"
    CHECK (api_method IN ('POST', 'PUT', 'PATCH')),
  CONSTRAINT "CK_MERCHANT_INTEGRATION_CALLBACK_AUTH"
    CHECK (callback_auth_type IN ('API_KEY', 'HMAC', 'NONE')),
  CONSTRAINT "CK_MERCHANT_INTEGRATION_TIMEOUT" CHECK (timeout_ms BETWEEN 1000 AND 120000),
  CONSTRAINT "CK_MERCHANT_INTEGRATION_RETRIES" CHECK (max_retries BETWEEN 0 AND 10),
  CONSTRAINT "CK_MERCHANT_INTEGRATION_MAPPING_ARRAY" CHECK (jsonb_typeof(request_mapping) = 'array'),
  CONSTRAINT "CK_MERCHANT_INTEGRATION_RESPONSE_OBJECT" CHECK (jsonb_typeof(response_mapping) = 'object')
);

CREATE TABLE IF NOT EXISTS public.sw_tbl_merchant_integration_auth (
  id bigserial PRIMARY KEY,
  config_id bigint NOT NULL,
  auth_type varchar(24) NOT NULL DEFAULT 'NONE',
  login_url text NULL,
  login_method varchar(10) NOT NULL DEFAULT 'POST',
  login_mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
  login_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  token_path text NULL,
  expires_in_path text NULL,
  token_prefix varchar(32) NOT NULL DEFAULT 'Bearer',
  final_header varchar(100) NOT NULL DEFAULT 'Authorization',
  secrets_ciphertext text NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FK_MERCHANT_INTEGRATION_AUTH_CONFIG"
    FOREIGN KEY (config_id)
    REFERENCES public.sw_tbl_merchant_integration_config (id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT "UQ_MERCHANT_INTEGRATION_AUTH_CONFIG" UNIQUE (config_id),
  CONSTRAINT "CK_MERCHANT_INTEGRATION_AUTH_TYPE"
    CHECK (auth_type IN ('NONE', 'LOGIN_BEARER')),
  CONSTRAINT "CK_MERCHANT_INTEGRATION_LOGIN_METHOD"
    CHECK (login_method IN ('POST', 'PUT', 'PATCH')),
  CONSTRAINT "CK_MERCHANT_INTEGRATION_LOGIN_MAPPING" CHECK (jsonb_typeof(login_mapping) = 'array'),
  CONSTRAINT "CK_MERCHANT_INTEGRATION_LOGIN_HEADERS" CHECK (jsonb_typeof(login_headers) = 'object')
);

CREATE TABLE IF NOT EXISTS public.sw_tbl_merchant_integration_config_history (
  id bigserial PRIMARY KEY,
  config_id bigint NOT NULL,
  merchant_msisdn bigint NOT NULL,
  version integer NOT NULL,
  integration_channel varchar(10) NOT NULL,
  configuration jsonb NOT NULL,
  changed_by text NULL,
  changed_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FK_MERCHANT_INTEGRATION_HISTORY_CONFIG"
    FOREIGN KEY (config_id)
    REFERENCES public.sw_tbl_merchant_integration_config (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "UQ_MERCHANT_INTEGRATION_HISTORY_VERSION" UNIQUE (config_id, version)
);

ALTER TABLE public.sw_tbl_merchant_integration_attempt
  ADD COLUMN IF NOT EXISTS config_id bigint,
  ADD COLUMN IF NOT EXISTS config_version integer,
  ADD COLUMN IF NOT EXISTS integration_channel varchar(10),
  ADD COLUMN IF NOT EXISTS correlation_id uuid,
  ADD COLUMN IF NOT EXISTS outbound_topic varchar(255),
  ADD COLUMN IF NOT EXISTS external_reference text;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_MERCHANT_ATTEMPT_CONFIG') THEN
    ALTER TABLE public.sw_tbl_merchant_integration_attempt
      ADD CONSTRAINT "FK_MERCHANT_ATTEMPT_CONFIG"
      FOREIGN KEY (config_id)
      REFERENCES public.sw_tbl_merchant_integration_config (id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CK_MERCHANT_ATTEMPT_CHANNEL') THEN
    ALTER TABLE public.sw_tbl_merchant_integration_attempt
      ADD CONSTRAINT "CK_MERCHANT_ATTEMPT_CHANNEL"
      CHECK (integration_channel IS NULL OR integration_channel IN ('API', 'KAFKA'));
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_MERCHANT_ATTEMPT_CORRELATION"
  ON public.sw_tbl_merchant_integration_attempt (correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sw_tbl_merchant_confirmation (
  id bigserial PRIMARY KEY,
  correlation_id uuid NOT NULL,
  transactionid bigint NOT NULL,
  merchant_msisdn bigint NOT NULL,
  config_version integer NOT NULL,
  decision varchar(16) NOT NULL,
  external_reference text NULL,
  reason_code text NULL,
  message text NULL,
  idempotency_key text NOT NULL,
  request_payload jsonb NOT NULL,
  processing_status varchar(16) NOT NULL DEFAULT 'RECEIVED',
  result_payload jsonb NULL,
  reversal_journal_id bigint NULL,
  settlement_journal_id bigint NULL,
  received_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at timestamp without time zone NULL,
  CONSTRAINT "FK_MERCHANT_CONFIRMATION_TRANSACTION"
    FOREIGN KEY (transactionid)
    REFERENCES public."SW_TBL_TRANSACTION_REQUEST" ("Transaction_ID")
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FK_MERCHANT_CONFIRMATION_REVERSAL_JOURNAL"
    FOREIGN KEY (reversal_journal_id)
    REFERENCES public.sw_tbl_accounting_journal (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FK_MERCHANT_CONFIRMATION_SETTLEMENT_JOURNAL"
    FOREIGN KEY (settlement_journal_id)
    REFERENCES public.sw_tbl_accounting_journal (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "UQ_MERCHANT_CONFIRMATION_CORRELATION" UNIQUE (correlation_id),
  CONSTRAINT "UQ_MERCHANT_CONFIRMATION_IDEMPOTENCY" UNIQUE (idempotency_key),
  CONSTRAINT "CK_MERCHANT_CONFIRMATION_DECISION" CHECK (decision IN ('APPROVED', 'REJECTED')),
  CONSTRAINT "CK_MERCHANT_CONFIRMATION_PROCESSING_STATUS"
    CHECK (processing_status IN ('RECEIVED', 'COMPLETED', 'REVERSED', 'BLOCKED', 'CONFLICT', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS "IDX_MERCHANT_CONFIRMATION_TRANSACTION"
  ON public.sw_tbl_merchant_confirmation (transactionid, received_at);

COMMIT;
