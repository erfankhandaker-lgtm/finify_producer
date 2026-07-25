BEGIN;

-- Business date is immutable accounting context. New journals use the UK
-- business date; historical rows retain their recorded calendar date.
ALTER TABLE public.sw_tbl_accounting_journal
  ADD COLUMN IF NOT EXISTS business_date date,
  ADD COLUMN IF NOT EXISTS reporting_entity varchar(32) NOT NULL DEFAULT 'FINIFY_UK';

UPDATE public.sw_tbl_accounting_journal
SET business_date = created_at::date
WHERE business_date IS NULL;

ALTER TABLE public.sw_tbl_accounting_journal
  ALTER COLUMN business_date DROP DEFAULT,
  ALTER COLUMN business_date SET NOT NULL;

ALTER TABLE public.sw_tbl_accounting_entry
  ADD COLUMN IF NOT EXISTS business_date date,
  ADD COLUMN IF NOT EXISTS reporting_entity varchar(32) NOT NULL DEFAULT 'FINIFY_UK';

UPDATE public.sw_tbl_accounting_entry entry_row
SET business_date = COALESCE(journal.business_date, entry_row.entrydate::date)
FROM public.sw_tbl_accounting_journal journal
WHERE journal.id = entry_row.journal_id
  AND entry_row.business_date IS NULL;

ALTER TABLE public.sw_tbl_accounting_entry
  ALTER COLUMN business_date DROP DEFAULT,
  ALTER COLUMN business_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS "IDX_ACCOUNTING_JOURNAL_BUSINESS_DATE"
  ON public.sw_tbl_accounting_journal (reporting_entity, business_date, currency, status);

CREATE INDEX IF NOT EXISTS "IDX_ACCOUNTING_ENTRY_BUSINESS_DATE"
  ON public.sw_tbl_accounting_entry (reporting_entity, business_date, currency, accountnumber);

-- Ensure the agreed GBP safeguarding wallet exists without modifying the
-- existing USD master wallet or any customer wallet currency.
INSERT INTO public."SW_TBL_WALLET" (
  "Wallet_MSISDN", "Wallet_Code", "Amount", "Created_Date", "Created_By",
  "Status", is_default, "Account_code", currency
) VALUES (
  9800001110, 110, 0.00, CURRENT_TIMESTAMP, 'MIGRATION_012',
  0, false, '00000000-0000-0000-0000-000000001110', 'GBP'
)
ON CONFLICT ("Wallet_MSISDN") DO NOTHING;

CREATE TABLE IF NOT EXISTS public.sw_tbl_gl_account (
  account_code varchar(40) PRIMARY KEY,
  account_name text NOT NULL,
  account_type varchar(12) NOT NULL,
  normal_balance varchar(6) NOT NULL,
  statement_section varchar(40) NOT NULL,
  parent_account_code varchar(40) NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_control_account boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by text NULL,
  approved_at timestamp without time zone NULL,
  CONSTRAINT "FK_GL_ACCOUNT_PARENT"
    FOREIGN KEY (parent_account_code) REFERENCES public.sw_tbl_gl_account(account_code)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "CK_GL_ACCOUNT_TYPE"
    CHECK (account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')),
  CONSTRAINT "CK_GL_NORMAL_BALANCE"
    CHECK (normal_balance IN ('DEBIT', 'CREDIT'))
);

INSERT INTO public.sw_tbl_gl_account (
  account_code, account_name, account_type, normal_balance, statement_section,
  display_order, is_control_account, created_by, approved_by, approved_at
) VALUES
  ('1000-SAFEGUARDING', 'Safeguarding bank and master wallet assets', 'ASSET', 'DEBIT', 'CURRENT_ASSETS', 100, true, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('1100-SETTLEMENT-RECEIVABLE', 'Settlement receivables', 'ASSET', 'DEBIT', 'CURRENT_ASSETS', 110, true, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('1200-LOAN-PRINCIPAL', 'Loan principal receivable', 'ASSET', 'DEBIT', 'LOAN_ASSETS', 120, true, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('1210-LOAN-INTEREST', 'Loan interest receivable', 'ASSET', 'DEBIT', 'LOAN_ASSETS', 121, true, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('1290-LOAN-LOSS-ALLOWANCE', 'Expected credit loss allowance', 'ASSET', 'CREDIT', 'LOAN_ASSETS', 129, true, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('2000-CUSTOMER-WALLET', 'Customer wallet liability', 'LIABILITY', 'CREDIT', 'SAFEGUARDED_LIABILITIES', 200, true, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('2010-MERCHANT-WALLET', 'Merchant wallet liability', 'LIABILITY', 'CREDIT', 'SAFEGUARDED_LIABILITIES', 201, true, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('2020-AGENT-WALLET', 'Agent wallet liability', 'LIABILITY', 'CREDIT', 'SAFEGUARDED_LIABILITIES', 202, true, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('2030-TEMPORARY-RESERVE', 'Temporary reserve liability', 'LIABILITY', 'CREDIT', 'SAFEGUARDED_LIABILITIES', 203, true, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('2040-MERCHANT-SETTLEMENT', 'Merchant settlement payable', 'LIABILITY', 'CREDIT', 'SETTLEMENT_LIABILITIES', 204, true, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('2050-REMITTANCE-IN-TRANSIT', 'Remittance in transit', 'LIABILITY', 'CREDIT', 'REMITTANCE_LIABILITIES', 205, true, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('2900-SUSPENSE', 'Accounting and safeguarding suspense', 'LIABILITY', 'CREDIT', 'OTHER_LIABILITIES', 290, true, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('3000-CAPITAL', 'Capital', 'EQUITY', 'CREDIT', 'EQUITY', 300, false, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('3100-RETAINED-EARNINGS', 'Retained earnings', 'EQUITY', 'CREDIT', 'EQUITY', 310, false, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('4000-TRANSACTION-REVENUE', 'Transaction charge revenue', 'INCOME', 'CREDIT', 'OPERATING_INCOME', 400, false, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('4010-REMITTANCE-FEE', 'Remittance fee revenue', 'INCOME', 'CREDIT', 'OPERATING_INCOME', 401, false, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('4020-FX-SPREAD', 'Foreign exchange spread revenue', 'INCOME', 'CREDIT', 'OPERATING_INCOME', 402, false, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('4100-LOAN-INTEREST-INCOME', 'Loan interest income', 'INCOME', 'CREDIT', 'LOAN_INCOME', 410, false, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('4110-LOAN-FEE-INCOME', 'Loan fee income', 'INCOME', 'CREDIT', 'LOAN_INCOME', 411, false, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('5000-COMMISSION-EXPENSE', 'Commission and cashback expense', 'EXPENSE', 'DEBIT', 'OPERATING_EXPENSE', 500, false, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('5010-SETTLEMENT-EXPENSE', 'Bank and settlement expense', 'EXPENSE', 'DEBIT', 'OPERATING_EXPENSE', 501, false, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  ('5100-CREDIT-LOSS-EXPENSE', 'Expected credit loss expense', 'EXPENSE', 'DEBIT', 'LOAN_EXPENSE', 510, false, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP)
ON CONFLICT (account_code) DO UPDATE
SET account_name = EXCLUDED.account_name,
    account_type = EXCLUDED.account_type,
    normal_balance = EXCLUDED.normal_balance,
    statement_section = EXCLUDED.statement_section,
    display_order = EXCLUDED.display_order,
    is_control_account = EXCLUDED.is_control_account;

CREATE TABLE IF NOT EXISTS public.sw_tbl_wallet_gl_mapping (
  wallet_code integer PRIMARY KEY,
  gl_account_code varchar(40) NOT NULL,
  mapping_source varchar(16) NOT NULL DEFAULT 'WALLET_CODE',
  is_safeguarded boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by text NULL,
  approved_at timestamp without time zone NULL,
  CONSTRAINT "FK_WALLET_GL_MAPPING_WALLET_TYPE"
    FOREIGN KEY (wallet_code) REFERENCES public."SW_TBL_WALLET_TYPE"("Wallet_ID")
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FK_WALLET_GL_MAPPING_GL"
    FOREIGN KEY (gl_account_code) REFERENCES public.sw_tbl_gl_account(account_code)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

INSERT INTO public.sw_tbl_wallet_gl_mapping (
  wallet_code, gl_account_code, is_safeguarded, created_by, approved_by, approved_at
)
SELECT wallet_type."Wallet_ID",
       CASE wallet_type."Wallet_Type"
         WHEN 100 THEN '2000-CUSTOMER-WALLET'
         WHEN 200 THEN '2010-MERCHANT-WALLET'
         WHEN 300 THEN '2020-AGENT-WALLET'
       END,
       true, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP
FROM public."SW_TBL_WALLET_TYPE" wallet_type
WHERE wallet_type."Wallet_Type" IN (100, 200, 300)
ON CONFLICT (wallet_code) DO NOTHING;

INSERT INTO public.sw_tbl_wallet_gl_mapping (
  wallet_code, gl_account_code, is_safeguarded, created_by, approved_by, approved_at
) VALUES
  (105, '2030-TEMPORARY-RESERVE', true, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  (110, '1000-SAFEGUARDING', false, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  (113, '4000-TRANSACTION-REVENUE', false, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP),
  (114, '5000-COMMISSION-EXPENSE', false, 'MIGRATION_012', 'MIGRATION_012', CURRENT_TIMESTAMP)
ON CONFLICT (wallet_code) DO UPDATE
SET gl_account_code = EXCLUDED.gl_account_code,
    is_safeguarded = EXCLUDED.is_safeguarded;

CREATE TABLE IF NOT EXISTS public.sw_tbl_accounting_configuration (
  id bigserial PRIMARY KEY,
  reporting_entity varchar(32) NOT NULL,
  currency varchar(3) NOT NULL,
  base_currency varchar(3) NOT NULL DEFAULT 'GBP',
  business_timezone text NOT NULL DEFAULT 'Europe/London',
  cutoff_time time without time zone NOT NULL DEFAULT '00:00:00',
  master_wallet bigint NOT NULL,
  strict_safeguarding boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL,
  effective_to date NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by text NOT NULL,
  approved_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FK_ACCOUNTING_CONFIG_MASTER_WALLET"
    FOREIGN KEY (master_wallet) REFERENCES public."SW_TBL_WALLET"("Wallet_MSISDN")
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "CK_ACCOUNTING_CONFIG_CURRENCY"
    CHECK (currency ~ '^[A-Z]{3}$' AND base_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT "CK_ACCOUNTING_CONFIG_PERIOD"
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ACTIVE_ACCOUNTING_CONFIG"
  ON public.sw_tbl_accounting_configuration (reporting_entity, currency)
  WHERE is_active AND effective_to IS NULL;

INSERT INTO public.sw_tbl_accounting_configuration (
  reporting_entity, currency, base_currency, business_timezone, cutoff_time,
  master_wallet, strict_safeguarding, effective_from, created_by, approved_by
) VALUES
  ('FINIFY_UK', 'GBP', 'GBP', 'Europe/London', '00:00:00', 9800001110, true, CURRENT_DATE, 'MIGRATION_012', 'MIGRATION_012'),
  ('FINIFY_UK', 'USD', 'GBP', 'Europe/London', '00:00:00', 9800000110, true, CURRENT_DATE, 'MIGRATION_012', 'MIGRATION_012')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.sw_fn_assign_journal_business_context()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_timezone text := 'Europe/London';
BEGIN
  NEW.reporting_entity := COALESCE(NULLIF(NEW.reporting_entity,''),'FINIFY_UK');
  IF NEW.business_date IS NULL THEN
    SELECT config.business_timezone INTO v_timezone
    FROM public.sw_tbl_accounting_configuration config
    WHERE config.reporting_entity=NEW.reporting_entity
      AND config.currency=upper(NEW.currency)
      AND config.is_active
      AND config.effective_from<=CURRENT_DATE
      AND (config.effective_to IS NULL OR config.effective_to>=CURRENT_DATE)
    ORDER BY config.effective_from DESC LIMIT 1;
    NEW.business_date := (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(v_timezone,'Europe/London'))::date;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS "TRG_ACCOUNTING_JOURNAL_BUSINESS_CONTEXT"
  ON public.sw_tbl_accounting_journal;
CREATE TRIGGER "TRG_ACCOUNTING_JOURNAL_BUSINESS_CONTEXT"
BEFORE INSERT ON public.sw_tbl_accounting_journal
FOR EACH ROW EXECUTE FUNCTION public.sw_fn_assign_journal_business_context();

CREATE OR REPLACE FUNCTION public.sw_fn_assign_entry_business_context()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  SELECT journal.business_date,journal.reporting_entity
  INTO NEW.business_date,NEW.reporting_entity
  FROM public.sw_tbl_accounting_journal journal
  WHERE journal.id=NEW.journal_id;
  IF NEW.business_date IS NULL THEN
    RAISE EXCEPTION 'Accounting journal % has no business context', NEW.journal_id;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS "TRG_ACCOUNTING_ENTRY_BUSINESS_CONTEXT"
  ON public.sw_tbl_accounting_entry;
CREATE TRIGGER "TRG_ACCOUNTING_ENTRY_BUSINESS_CONTEXT"
BEFORE INSERT ON public.sw_tbl_accounting_entry
FOR EACH ROW EXECUTE FUNCTION public.sw_fn_assign_entry_business_context();

CREATE TABLE IF NOT EXISTS public.sw_tbl_accounting_period (
  id bigserial PRIMARY KEY,
  reporting_entity varchar(32) NOT NULL,
  business_date date NOT NULL,
  currency varchar(3) NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'OPEN',
  close_version integer NOT NULL DEFAULT 0,
  opened_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closing_started_at timestamp without time zone NULL,
  closed_at timestamp without time zone NULL,
  closed_by text NULL,
  reopened_at timestamp without time zone NULL,
  reopened_by text NULL,
  reopen_reason text NULL,
  CONSTRAINT "UQ_ACCOUNTING_PERIOD" UNIQUE (reporting_entity, business_date, currency),
  CONSTRAINT "CK_ACCOUNTING_PERIOD_STATUS"
    CHECK (status IN ('OPEN', 'CLOSING', 'CLOSED', 'REOPENED', 'FAILED'))
);

CREATE TABLE IF NOT EXISTS public.sw_tbl_eod_batch (
  id bigserial PRIMARY KEY,
  reporting_entity varchar(32) NOT NULL,
  business_date date NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'RUNNING',
  requested_by text NOT NULL,
  correlation_id varchar(100) NULL,
  started_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamp without time zone NULL,
  CONSTRAINT "UQ_EOD_BATCH" UNIQUE (reporting_entity, business_date),
  CONSTRAINT "CK_EOD_BATCH_STATUS"
    CHECK (status IN ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED'))
);

CREATE TABLE IF NOT EXISTS public.sw_tbl_eod_run (
  id bigserial PRIMARY KEY,
  batch_id bigint NOT NULL,
  reporting_entity varchar(32) NOT NULL,
  business_date date NOT NULL,
  currency varchar(3) NOT NULL,
  run_version integer NOT NULL,
  dry_run boolean NOT NULL DEFAULT false,
  status varchar(20) NOT NULL DEFAULT 'RUNNING',
  requested_by text NOT NULL,
  total_debit numeric(24,2) NOT NULL DEFAULT 0,
  total_credit numeric(24,2) NOT NULL DEFAULT 0,
  journal_count bigint NOT NULL DEFAULT 0,
  entry_count bigint NOT NULL DEFAULT 0,
  wallet_count bigint NOT NULL DEFAULT 0,
  master_balance numeric(24,2) NULL,
  safeguarded_liability numeric(24,2) NULL,
  safeguarding_variance numeric(24,2) NULL,
  error_code varchar(60) NULL,
  error_message text NULL,
  started_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamp without time zone NULL,
  CONSTRAINT "FK_EOD_RUN_BATCH"
    FOREIGN KEY (batch_id) REFERENCES public.sw_tbl_eod_batch(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "UQ_EOD_RUN_VERSION"
    UNIQUE (reporting_entity, business_date, currency, run_version),
  CONSTRAINT "CK_EOD_RUN_STATUS"
    CHECK (status IN ('RUNNING', 'VALIDATED', 'COMPLETED', 'FAILED', 'BLOCKED'))
);

CREATE TABLE IF NOT EXISTS public.sw_tbl_eod_run_step (
  id bigserial PRIMARY KEY,
  run_id bigint NOT NULL,
  step_name varchar(60) NOT NULL,
  status varchar(16) NOT NULL,
  sequence_no integer NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamp without time zone NULL,
  duration_ms bigint NULL,
  CONSTRAINT "FK_EOD_STEP_RUN"
    FOREIGN KEY (run_id) REFERENCES public.sw_tbl_eod_run(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT "UQ_EOD_STEP_SEQUENCE" UNIQUE (run_id, sequence_no),
  CONSTRAINT "CK_EOD_STEP_STATUS"
    CHECK (status IN ('RUNNING', 'PASSED', 'FAILED', 'SKIPPED'))
);

CREATE TABLE IF NOT EXISTS public.sw_tbl_eod_exception (
  id bigserial PRIMARY KEY,
  run_id bigint NOT NULL,
  exception_code varchar(60) NOT NULL,
  severity varchar(12) NOT NULL,
  message text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FK_EOD_EXCEPTION_RUN"
    FOREIGN KEY (run_id) REFERENCES public.sw_tbl_eod_run(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT "CK_EOD_EXCEPTION_SEVERITY"
    CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL'))
);

CREATE TABLE IF NOT EXISTS public.sw_tbl_daily_wallet_balance (
  reporting_entity varchar(32) NOT NULL,
  business_date date NOT NULL,
  currency varchar(3) NOT NULL,
  wallet_msisdn bigint NOT NULL,
  wallet_code integer NOT NULL,
  gl_account_code varchar(40) NOT NULL,
  opening_balance numeric(24,2) NOT NULL,
  total_debit numeric(24,2) NOT NULL,
  total_credit numeric(24,2) NOT NULL,
  closing_balance numeric(24,2) NOT NULL,
  transaction_count bigint NOT NULL,
  run_id bigint NOT NULL,
  snapshot_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reporting_entity, business_date, currency, wallet_msisdn),
  CONSTRAINT "FK_DAILY_WALLET_GL"
    FOREIGN KEY (gl_account_code) REFERENCES public.sw_tbl_gl_account(account_code),
  CONSTRAINT "FK_DAILY_WALLET_RUN"
    FOREIGN KEY (run_id) REFERENCES public.sw_tbl_eod_run(id)
);

CREATE TABLE IF NOT EXISTS public.sw_tbl_daily_gl_balance (
  reporting_entity varchar(32) NOT NULL,
  business_date date NOT NULL,
  currency varchar(3) NOT NULL,
  gl_account_code varchar(40) NOT NULL,
  opening_balance numeric(24,2) NOT NULL,
  total_debit numeric(24,2) NOT NULL,
  total_credit numeric(24,2) NOT NULL,
  closing_balance numeric(24,2) NOT NULL,
  run_id bigint NOT NULL,
  snapshot_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reporting_entity, business_date, currency, gl_account_code),
  CONSTRAINT "FK_DAILY_GL_ACCOUNT"
    FOREIGN KEY (gl_account_code) REFERENCES public.sw_tbl_gl_account(account_code),
  CONSTRAINT "FK_DAILY_GL_RUN"
    FOREIGN KEY (run_id) REFERENCES public.sw_tbl_eod_run(id)
);

CREATE TABLE IF NOT EXISTS public.sw_tbl_eod_fx_rate (
  business_date date NOT NULL,
  source_currency varchar(3) NOT NULL,
  target_currency varchar(3) NOT NULL DEFAULT 'GBP',
  rate numeric(24,10) NOT NULL,
  source_name text NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'PENDING',
  created_by text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by text NULL,
  approved_at timestamp without time zone NULL,
  PRIMARY KEY (business_date, source_currency, target_currency),
  CONSTRAINT "CK_EOD_FX_RATE" CHECK (rate > 0),
  CONSTRAINT "CK_EOD_FX_STATUS" CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE OR REPLACE FUNCTION public.sw_proc_accounting_close_eod(
  p_business_date date,
  p_currency varchar,
  p_reporting_entity varchar DEFAULT 'FINIFY_UK',
  p_requested_by text DEFAULT 'SYSTEM',
  p_dry_run boolean DEFAULT false,
  p_correlation_id varchar DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  status_code varchar,
  status_message text,
  batch_id bigint,
  run_id bigint,
  run_status varchar,
  total_debit numeric,
  total_credit numeric,
  journal_count bigint,
  entry_count bigint,
  wallet_count bigint,
  master_balance numeric,
  safeguarded_liability numeric,
  safeguarding_variance numeric,
  exception_count bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
AS $function$
DECLARE
  v_currency varchar(3) := upper(trim(p_currency));
  v_config public.sw_tbl_accounting_configuration%ROWTYPE;
  v_batch_id bigint;
  v_run_id bigint;
  v_version integer;
  v_period_id bigint;
  v_step_started timestamp without time zone;
  v_total_debit numeric(24,2) := 0;
  v_total_credit numeric(24,2) := 0;
  v_journal_count bigint := 0;
  v_entry_count bigint := 0;
  v_wallet_count bigint := 0;
  v_master_balance numeric(24,2) := 0;
  v_safeguarded_liability numeric(24,2) := 0;
  v_variance numeric(24,2) := 0;
  v_exception_count bigint := 0;
  v_unbalanced bigint := 0;
  v_processing bigint := 0;
  v_unmapped bigint := 0;
  v_currency_mismatch bigint := 0;
  v_status varchar(20);
BEGIN
  IF p_business_date IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
    RETURN QUERY SELECT false, 'INVALID_REQUEST'::varchar,
      'A business date and ISO three-letter currency are required'::text,
      NULL::bigint, NULL::bigint, 'FAILED'::varchar,
      0::numeric, 0::numeric, 0::bigint, 0::bigint, 0::bigint,
      0::numeric, 0::numeric, 0::numeric, 1::bigint;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_reporting_entity || ':' || p_business_date::text || ':' || v_currency, 0));

  SELECT * INTO v_config
  FROM public.sw_tbl_accounting_configuration config
  WHERE config.reporting_entity = p_reporting_entity
    AND config.currency = v_currency
    AND config.is_active
    AND config.effective_from <= p_business_date
    AND (config.effective_to IS NULL OR config.effective_to >= p_business_date)
  ORDER BY config.effective_from DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'ACCOUNTING_CONFIGURATION_NOT_FOUND'::varchar,
      'No active accounting configuration exists for the entity and currency'::text,
      NULL::bigint, NULL::bigint, 'FAILED'::varchar,
      0::numeric, 0::numeric, 0::bigint, 0::bigint, 0::bigint,
      0::numeric, 0::numeric, 0::numeric, 1::bigint;
    RETURN;
  END IF;

  IF NOT p_dry_run THEN
    SELECT existing.id INTO v_run_id
    FROM public.sw_tbl_eod_run existing
    WHERE existing.reporting_entity = p_reporting_entity
      AND existing.business_date = p_business_date
      AND existing.currency = v_currency
      AND existing.status = 'COMPLETED'
      AND NOT existing.dry_run
    ORDER BY existing.run_version DESC
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY
      SELECT true, 'ALREADY_CLOSED'::varchar, 'The business date is already closed'::text,
             existing.batch_id, existing.id, existing.status,
             existing.total_debit, existing.total_credit, existing.journal_count,
             existing.entry_count, existing.wallet_count, existing.master_balance,
             existing.safeguarded_liability, existing.safeguarding_variance,
             (SELECT count(*) FROM public.sw_tbl_eod_exception error_row WHERE error_row.run_id=existing.id)
      FROM public.sw_tbl_eod_run existing WHERE existing.id=v_run_id;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.sw_tbl_eod_batch (
    reporting_entity, business_date, status, requested_by, correlation_id
  ) VALUES (
    p_reporting_entity, p_business_date, 'RUNNING', p_requested_by, p_correlation_id
  )
  ON CONFLICT (reporting_entity, business_date) DO UPDATE
  SET status='RUNNING', requested_by=EXCLUDED.requested_by,
      correlation_id=COALESCE(EXCLUDED.correlation_id, public.sw_tbl_eod_batch.correlation_id),
      completed_at=NULL
  RETURNING id INTO v_batch_id;

  SELECT COALESCE(max(run_version), 0) + 1 INTO v_version
  FROM public.sw_tbl_eod_run
  WHERE reporting_entity=p_reporting_entity
    AND business_date=p_business_date
    AND currency=v_currency;

  INSERT INTO public.sw_tbl_eod_run (
    batch_id, reporting_entity, business_date, currency, run_version,
    dry_run, status, requested_by
  ) VALUES (
    v_batch_id, p_reporting_entity, p_business_date, v_currency, v_version,
    p_dry_run, 'RUNNING', p_requested_by
  ) RETURNING id INTO v_run_id;

  INSERT INTO public.sw_tbl_accounting_period (
    reporting_entity, business_date, currency, status
  ) VALUES (p_reporting_entity, p_business_date, v_currency, 'OPEN')
  ON CONFLICT (reporting_entity, business_date, currency) DO NOTHING;

  SELECT id INTO v_period_id
  FROM public.sw_tbl_accounting_period
  WHERE reporting_entity=p_reporting_entity
    AND business_date=p_business_date AND currency=v_currency
  FOR UPDATE;

  IF NOT p_dry_run THEN
    UPDATE public.sw_tbl_accounting_period
    SET status='CLOSING', closing_started_at=CURRENT_TIMESTAMP
    WHERE id=v_period_id AND status IN ('OPEN','REOPENED','FAILED');
  END IF;

  v_step_started := clock_timestamp();
  INSERT INTO public.sw_tbl_eod_run_step(run_id,step_name,status,sequence_no)
  VALUES(v_run_id,'JOURNAL_VALIDATION','RUNNING',1);

  SELECT count(*) INTO v_processing
  FROM public.sw_tbl_accounting_journal
  WHERE reporting_entity=p_reporting_entity AND business_date=p_business_date
    AND currency=v_currency AND status='PROCESSING';

  SELECT count(*) INTO v_unbalanced
  FROM (
    SELECT journal.id
    FROM public.sw_tbl_accounting_journal journal
    LEFT JOIN public.sw_tbl_accounting_entry entry_row ON entry_row.journal_id=journal.id
    WHERE journal.reporting_entity=p_reporting_entity
      AND journal.business_date=p_business_date AND journal.currency=v_currency
    GROUP BY journal.id
    HAVING round(COALESCE(sum(entry_row."Debit"),0)::numeric,2)
        <> round(COALESCE(sum(entry_row."Credit"),0)::numeric,2)
  ) invalid_journal;

  SELECT count(*) INTO v_unmapped
  FROM public.sw_tbl_accounting_entry entry_row
  JOIN public."SW_TBL_WALLET" wallet ON wallet."Wallet_MSISDN"=entry_row.accountnumber
  LEFT JOIN public.sw_tbl_wallet_gl_mapping mapping
    ON mapping.wallet_code=wallet."Wallet_Code" AND mapping.is_active
  WHERE entry_row.reporting_entity=p_reporting_entity
    AND entry_row.business_date=p_business_date AND entry_row.currency=v_currency
    AND mapping.wallet_code IS NULL;

  SELECT count(*) INTO v_currency_mismatch
  FROM public.sw_tbl_accounting_entry entry_row
  JOIN public."SW_TBL_WALLET" wallet ON wallet."Wallet_MSISDN"=entry_row.accountnumber
  WHERE entry_row.reporting_entity=p_reporting_entity
    AND entry_row.business_date=p_business_date AND entry_row.currency=v_currency
    AND upper(wallet.currency)<>v_currency;

  IF v_processing > 0 THEN
    INSERT INTO public.sw_tbl_eod_exception(run_id,exception_code,severity,message,context)
    VALUES(v_run_id,'JOURNALS_PROCESSING','ERROR','Accounting journals are still processing',
           jsonb_build_object('count',v_processing));
  END IF;
  IF v_unbalanced > 0 THEN
    INSERT INTO public.sw_tbl_eod_exception(run_id,exception_code,severity,message,context)
    VALUES(v_run_id,'UNBALANCED_JOURNALS','CRITICAL','One or more journals are unbalanced',
           jsonb_build_object('count',v_unbalanced));
  END IF;
  IF v_unmapped > 0 THEN
    INSERT INTO public.sw_tbl_eod_exception(run_id,exception_code,severity,message,context)
    VALUES(v_run_id,'UNMAPPED_WALLETS','ERROR','Wallets with accounting activity lack a GL mapping',
           jsonb_build_object('count',v_unmapped));
  END IF;
  IF v_currency_mismatch > 0 THEN
    INSERT INTO public.sw_tbl_eod_exception(run_id,exception_code,severity,message,context)
    VALUES(v_run_id,'WALLET_CURRENCY_MISMATCH','CRITICAL','Journal and wallet currencies do not match',
           jsonb_build_object('count',v_currency_mismatch));
  END IF;

  SELECT count(*) INTO v_exception_count
  FROM public.sw_tbl_eod_exception exception_row
  WHERE exception_row.run_id=v_run_id AND exception_row.severity IN ('ERROR','CRITICAL');

  UPDATE public.sw_tbl_eod_run_step
  SET status=CASE WHEN v_exception_count=0 THEN 'PASSED' ELSE 'FAILED' END,
      detail=jsonb_build_object('processing',v_processing,'unbalanced',v_unbalanced,
        'unmapped',v_unmapped,'currencyMismatch',v_currency_mismatch),
      completed_at=clock_timestamp(),
      duration_ms=(extract(epoch FROM clock_timestamp()-v_step_started)*1000)::bigint
  WHERE sw_tbl_eod_run_step.run_id=v_run_id AND sw_tbl_eod_run_step.sequence_no=1;

  IF v_exception_count > 0 THEN
    UPDATE public.sw_tbl_eod_run
    SET status='BLOCKED', error_code='READINESS_FAILED',
        error_message='Journal validation failed', completed_at=CURRENT_TIMESTAMP
    WHERE id=v_run_id;
    IF NOT p_dry_run THEN
      UPDATE public.sw_tbl_accounting_period SET status='FAILED' WHERE id=v_period_id;
    END IF;
    UPDATE public.sw_tbl_eod_batch SET status='FAILED',completed_at=CURRENT_TIMESTAMP WHERE id=v_batch_id;
    RETURN QUERY SELECT false,'READINESS_FAILED'::varchar,'EOD journal validation failed'::text,
      v_batch_id,v_run_id,'BLOCKED'::varchar,0::numeric,0::numeric,0::bigint,0::bigint,
      0::bigint,0::numeric,0::numeric,0::numeric,v_exception_count;
    RETURN;
  END IF;

  SELECT round(COALESCE(sum(entry_row."Debit"),0)::numeric,2),
         round(COALESCE(sum(entry_row."Credit"),0)::numeric,2),
         count(DISTINCT entry_row.journal_id), count(*)
  INTO v_total_debit,v_total_credit,v_journal_count,v_entry_count
  FROM public.sw_tbl_accounting_entry entry_row
  WHERE entry_row.reporting_entity=p_reporting_entity
    AND entry_row.business_date=p_business_date AND entry_row.currency=v_currency;

  IF NOT p_dry_run THEN
    v_step_started := clock_timestamp();
    INSERT INTO public.sw_tbl_eod_run_step(run_id,step_name,status,sequence_no)
    VALUES(v_run_id,'WALLET_SNAPSHOT','RUNNING',2);

    DELETE FROM public.sw_tbl_daily_wallet_balance
    WHERE reporting_entity=p_reporting_entity AND business_date=p_business_date
      AND currency=v_currency;

    INSERT INTO public.sw_tbl_daily_wallet_balance (
      reporting_entity,business_date,currency,wallet_msisdn,wallet_code,
      gl_account_code,opening_balance,total_debit,total_credit,closing_balance,
      transaction_count,run_id
    )
    SELECT p_reporting_entity,p_business_date,v_currency,wallet."Wallet_MSISDN",
           wallet."Wallet_Code",mapping.gl_account_code,
           COALESCE(activity.opening_balance,previous.closing_balance,wallet."Amount"),
           COALESCE(activity.total_debit,0),COALESCE(activity.total_credit,0),
           COALESCE(activity.closing_balance,previous.closing_balance,wallet."Amount"),
           COALESCE(activity.transaction_count,0),v_run_id
    FROM public."SW_TBL_WALLET" wallet
    JOIN public.sw_tbl_wallet_gl_mapping mapping
      ON mapping.wallet_code=wallet."Wallet_Code" AND mapping.is_active
    LEFT JOIN LATERAL (
      SELECT
        (array_agg(entry_row.balance_before ORDER BY entry_row.entrydate,entry_row.id))[1] opening_balance,
        (array_agg(entry_row.balance_after ORDER BY entry_row.entrydate DESC,entry_row.id DESC))[1] closing_balance,
        sum(entry_row."Debit") total_debit,sum(entry_row."Credit") total_credit,
        count(*) transaction_count
      FROM public.sw_tbl_accounting_entry entry_row
      WHERE entry_row.accountnumber=wallet."Wallet_MSISDN"
        AND entry_row.reporting_entity=p_reporting_entity
        AND entry_row.business_date=p_business_date
        AND entry_row.currency=v_currency
    ) activity ON true
    LEFT JOIN LATERAL (
      SELECT prior.closing_balance
      FROM public.sw_tbl_daily_wallet_balance prior
      WHERE prior.reporting_entity=p_reporting_entity
        AND prior.currency=v_currency
        AND prior.wallet_msisdn=wallet."Wallet_MSISDN"
        AND prior.business_date<p_business_date
      ORDER BY prior.business_date DESC LIMIT 1
    ) previous ON true
    WHERE upper(wallet.currency)=v_currency;

    GET DIAGNOSTICS v_wallet_count = ROW_COUNT;

    UPDATE public.sw_tbl_eod_run_step
    SET status='PASSED',detail=jsonb_build_object('walletCount',v_wallet_count),
        completed_at=clock_timestamp(),
        duration_ms=(extract(epoch FROM clock_timestamp()-v_step_started)*1000)::bigint
    WHERE sw_tbl_eod_run_step.run_id=v_run_id AND sw_tbl_eod_run_step.sequence_no=2;

    v_step_started := clock_timestamp();
    INSERT INTO public.sw_tbl_eod_run_step(run_id,step_name,status,sequence_no)
    VALUES(v_run_id,'GL_AGGREGATION','RUNNING',3);

    DELETE FROM public.sw_tbl_daily_gl_balance
    WHERE reporting_entity=p_reporting_entity AND business_date=p_business_date
      AND currency=v_currency;

    INSERT INTO public.sw_tbl_daily_gl_balance (
      reporting_entity,business_date,currency,gl_account_code,opening_balance,
      total_debit,total_credit,closing_balance,run_id
    )
    SELECT p_reporting_entity,p_business_date,v_currency,account.account_code,
           COALESCE(previous.closing_balance,
             CASE WHEN account.account_type IN ('ASSET','LIABILITY','EQUITY')
                  THEN COALESCE(wallet_totals.opening_balance,0) ELSE 0 END),
           COALESCE(movement.total_debit,0),COALESCE(movement.total_credit,0),
           CASE WHEN account.normal_balance='DEBIT'
             THEN COALESCE(previous.closing_balance,
                    CASE WHEN account.account_type IN ('ASSET','LIABILITY','EQUITY')
                         THEN COALESCE(wallet_totals.opening_balance,0) ELSE 0 END)
                  + COALESCE(movement.total_debit,0)-COALESCE(movement.total_credit,0)
             ELSE COALESCE(previous.closing_balance,
                    CASE WHEN account.account_type IN ('ASSET','LIABILITY','EQUITY')
                         THEN COALESCE(wallet_totals.opening_balance,0) ELSE 0 END)
                  + COALESCE(movement.total_credit,0)-COALESCE(movement.total_debit,0)
           END,
           v_run_id
    FROM public.sw_tbl_gl_account account
    LEFT JOIN (
      SELECT mapping.gl_account_code,sum(entry_row."Debit") total_debit,
             sum(entry_row."Credit") total_credit
      FROM public.sw_tbl_accounting_entry entry_row
      JOIN public."SW_TBL_WALLET" wallet ON wallet."Wallet_MSISDN"=entry_row.accountnumber
      JOIN public.sw_tbl_wallet_gl_mapping mapping
        ON mapping.wallet_code=wallet."Wallet_Code" AND mapping.is_active
      WHERE entry_row.reporting_entity=p_reporting_entity
        AND entry_row.business_date=p_business_date AND entry_row.currency=v_currency
      GROUP BY mapping.gl_account_code
    ) movement ON movement.gl_account_code=account.account_code
    LEFT JOIN (
      SELECT gl_account_code,sum(opening_balance) opening_balance
      FROM public.sw_tbl_daily_wallet_balance
      WHERE reporting_entity=p_reporting_entity AND business_date=p_business_date
        AND currency=v_currency
      GROUP BY gl_account_code
    ) wallet_totals ON wallet_totals.gl_account_code=account.account_code
    LEFT JOIN LATERAL (
      SELECT prior.closing_balance
      FROM public.sw_tbl_daily_gl_balance prior
      WHERE prior.reporting_entity=p_reporting_entity
        AND prior.currency=v_currency
        AND prior.gl_account_code=account.account_code
        AND prior.business_date<p_business_date
      ORDER BY prior.business_date DESC LIMIT 1
    ) previous ON true
    WHERE account.is_active;

    UPDATE public.sw_tbl_eod_run_step
    SET status='PASSED',completed_at=clock_timestamp(),
        duration_ms=(extract(epoch FROM clock_timestamp()-v_step_started)*1000)::bigint
    WHERE sw_tbl_eod_run_step.run_id=v_run_id AND sw_tbl_eod_run_step.sequence_no=3;

    SELECT wallet."Amount" INTO v_master_balance
    FROM public."SW_TBL_WALLET" wallet
    WHERE wallet."Wallet_MSISDN"=v_config.master_wallet;

    SELECT COALESCE(sum(balance.closing_balance),0) INTO v_safeguarded_liability
    FROM public.sw_tbl_daily_wallet_balance balance
    JOIN public.sw_tbl_wallet_gl_mapping mapping
      ON mapping.wallet_code=balance.wallet_code
    JOIN public.sw_tbl_gl_account account
      ON account.account_code=balance.gl_account_code
    WHERE balance.reporting_entity=p_reporting_entity
      AND balance.business_date=p_business_date AND balance.currency=v_currency
      AND mapping.is_safeguarded AND account.account_type='LIABILITY';

    v_variance := round(COALESCE(v_master_balance,0)-COALESCE(v_safeguarded_liability,0),2);

    v_step_started := clock_timestamp();
    INSERT INTO public.sw_tbl_eod_run_step(run_id,step_name,status,sequence_no,detail)
    VALUES(v_run_id,'SAFEGUARDING_RECONCILIATION',
      CASE WHEN v_variance=0 OR NOT v_config.strict_safeguarding THEN 'PASSED' ELSE 'FAILED' END,
      4,jsonb_build_object('masterBalance',v_master_balance,
        'safeguardedLiability',v_safeguarded_liability,'variance',v_variance));

    UPDATE public.sw_tbl_eod_run_step
    SET completed_at=clock_timestamp(),
        duration_ms=(extract(epoch FROM clock_timestamp()-v_step_started)*1000)::bigint
    WHERE sw_tbl_eod_run_step.run_id=v_run_id AND sw_tbl_eod_run_step.sequence_no=4;

    IF v_variance<>0 THEN
      INSERT INTO public.sw_tbl_eod_exception(run_id,exception_code,severity,message,context)
      VALUES(v_run_id,'SAFEGUARDING_VARIANCE',
        CASE WHEN v_config.strict_safeguarding THEN 'CRITICAL' ELSE 'WARNING' END,
        'Master safeguarding balance does not equal safeguarded wallet liabilities',
        jsonb_build_object('masterBalance',v_master_balance,
          'safeguardedLiability',v_safeguarded_liability,'variance',v_variance));
    END IF;
  ELSE
    SELECT wallet."Amount" INTO v_master_balance
    FROM public."SW_TBL_WALLET" wallet WHERE wallet."Wallet_MSISDN"=v_config.master_wallet;
    SELECT COALESCE(sum(wallet."Amount"),0) INTO v_safeguarded_liability
    FROM public."SW_TBL_WALLET" wallet
    JOIN public.sw_tbl_wallet_gl_mapping mapping
      ON mapping.wallet_code=wallet."Wallet_Code" AND mapping.is_active AND mapping.is_safeguarded
    JOIN public.sw_tbl_gl_account account
      ON account.account_code=mapping.gl_account_code AND account.account_type='LIABILITY'
    WHERE upper(wallet.currency)=v_currency;
    SELECT count(*) INTO v_wallet_count FROM public."SW_TBL_WALLET" WHERE upper(currency)=v_currency;
    v_variance := round(COALESCE(v_master_balance,0)-COALESCE(v_safeguarded_liability,0),2);
    IF v_variance<>0 THEN
      INSERT INTO public.sw_tbl_eod_exception(run_id,exception_code,severity,message,context)
      VALUES(v_run_id,'SAFEGUARDING_VARIANCE',
        CASE WHEN v_config.strict_safeguarding THEN 'CRITICAL' ELSE 'WARNING' END,
        'Master safeguarding balance does not equal safeguarded wallet liabilities',
        jsonb_build_object('masterBalance',v_master_balance,
          'safeguardedLiability',v_safeguarded_liability,'variance',v_variance));
    END IF;
  END IF;

  SELECT count(*) INTO v_exception_count
  FROM public.sw_tbl_eod_exception exception_row
  WHERE exception_row.run_id=v_run_id AND exception_row.severity IN ('ERROR','CRITICAL');

  v_status := CASE
    WHEN p_dry_run AND v_exception_count=0 THEN 'VALIDATED'
    WHEN p_dry_run THEN 'BLOCKED'
    WHEN v_exception_count=0 THEN 'COMPLETED'
    ELSE 'BLOCKED'
  END;

  UPDATE public.sw_tbl_eod_run
  SET status=v_status,total_debit=v_total_debit,total_credit=v_total_credit,
      journal_count=v_journal_count,entry_count=v_entry_count,wallet_count=v_wallet_count,
      master_balance=v_master_balance,safeguarded_liability=v_safeguarded_liability,
      safeguarding_variance=v_variance,
      error_code=CASE WHEN v_exception_count>0 THEN 'RECONCILIATION_FAILED' END,
      error_message=CASE WHEN v_exception_count>0 THEN 'One or more EOD controls failed' END,
      completed_at=CURRENT_TIMESTAMP
  WHERE id=v_run_id;

  IF NOT p_dry_run THEN
    UPDATE public.sw_tbl_accounting_period
    SET status=CASE WHEN v_status='COMPLETED' THEN 'CLOSED' ELSE 'FAILED' END,
        close_version=CASE WHEN v_status='COMPLETED' THEN close_version+1 ELSE close_version END,
        closed_at=CASE WHEN v_status='COMPLETED' THEN CURRENT_TIMESTAMP ELSE closed_at END,
        closed_by=CASE WHEN v_status='COMPLETED' THEN p_requested_by ELSE closed_by END
    WHERE id=v_period_id;
  END IF;

  UPDATE public.sw_tbl_eod_batch
  SET status=CASE WHEN v_status IN ('COMPLETED','VALIDATED') THEN 'COMPLETED' ELSE 'FAILED' END,
      completed_at=CURRENT_TIMESTAMP
  WHERE id=v_batch_id;

  RETURN QUERY SELECT v_status IN ('COMPLETED','VALIDATED'),
    CASE WHEN v_status='COMPLETED' THEN 'CLOSED'
         WHEN v_status='VALIDATED' THEN 'DRY_RUN_PASSED'
         ELSE 'RECONCILIATION_FAILED' END::varchar,
    CASE WHEN v_status='COMPLETED' THEN 'Business date closed successfully'
         WHEN v_status='VALIDATED' THEN 'EOD dry run passed'
         ELSE 'EOD controls failed; inspect exceptions' END::text,
    v_batch_id,v_run_id,v_status,v_total_debit,v_total_credit,v_journal_count,
    v_entry_count,v_wallet_count,v_master_balance,v_safeguarded_liability,
    v_variance,v_exception_count;
END
$function$;

CREATE OR REPLACE FUNCTION public.sw_fn_trial_balance(
  p_business_date date,
  p_currency varchar,
  p_reporting_entity varchar DEFAULT 'FINIFY_UK'
)
RETURNS TABLE (
  account_code varchar, account_name text, account_type varchar,
  normal_balance varchar, opening_balance numeric, total_debit numeric,
  total_credit numeric, closing_balance numeric
)
LANGUAGE sql STABLE AS $function$
  SELECT account.account_code,account.account_name,account.account_type,
         account.normal_balance,balance.opening_balance,balance.total_debit,
         balance.total_credit,balance.closing_balance
  FROM public.sw_tbl_daily_gl_balance balance
  JOIN public.sw_tbl_gl_account account ON account.account_code=balance.gl_account_code
  WHERE balance.reporting_entity=p_reporting_entity
    AND balance.business_date=p_business_date
    AND balance.currency=upper(p_currency)
  ORDER BY account.display_order,account.account_code
$function$;

CREATE OR REPLACE FUNCTION public.sw_fn_balance_sheet(
  p_business_date date,
  p_currency varchar,
  p_reporting_entity varchar DEFAULT 'FINIFY_UK'
)
RETURNS TABLE (
  statement_section varchar, account_code varchar, account_name text,
  account_type varchar, amount numeric
)
LANGUAGE sql STABLE AS $function$
  SELECT account.statement_section,account.account_code,account.account_name,
         account.account_type,balance.closing_balance
  FROM public.sw_tbl_daily_gl_balance balance
  JOIN public.sw_tbl_gl_account account ON account.account_code=balance.gl_account_code
  WHERE balance.reporting_entity=p_reporting_entity
    AND balance.business_date=p_business_date
    AND balance.currency=upper(p_currency)
    AND account.account_type IN ('ASSET','LIABILITY','EQUITY')
  ORDER BY account.display_order,account.account_code
$function$;

CREATE OR REPLACE FUNCTION public.sw_fn_income_statement(
  p_date_from date,
  p_date_to date,
  p_currency varchar,
  p_reporting_entity varchar DEFAULT 'FINIFY_UK'
)
RETURNS TABLE (
  statement_section varchar, account_code varchar, account_name text,
  account_type varchar, amount numeric
)
LANGUAGE sql STABLE AS $function$
  SELECT account.statement_section,account.account_code,account.account_name,
         account.account_type,
         round(sum(CASE WHEN account.normal_balance='CREDIT'
                        THEN balance.total_credit-balance.total_debit
                        ELSE balance.total_debit-balance.total_credit END),2)
  FROM public.sw_tbl_daily_gl_balance balance
  JOIN public.sw_tbl_gl_account account ON account.account_code=balance.gl_account_code
  WHERE balance.reporting_entity=p_reporting_entity
    AND balance.business_date BETWEEN p_date_from AND p_date_to
    AND balance.currency=upper(p_currency)
    AND account.account_type IN ('INCOME','EXPENSE')
  GROUP BY account.statement_section,account.account_code,account.account_name,
           account.account_type,account.normal_balance,account.display_order
  ORDER BY account.display_order,account.account_code
$function$;

CREATE OR REPLACE FUNCTION public.sw_fn_account_statement(
  p_wallet_msisdn bigint,
  p_date_from date,
  p_date_to date,
  p_currency varchar
)
RETURNS TABLE (
  entry_id integer, transaction_id bigint, business_date date, entry_date timestamp,
  keyword varchar, reference text, debit numeric, credit numeric,
  balance_before numeric, balance_after numeric, description text,
  journal_action varchar, journal_leg smallint
)
LANGUAGE sql STABLE AS $function$
  SELECT entry_row.id,entry_row.transactionid,entry_row.business_date,entry_row.entrydate,
         journal.keyword,journal.reference,entry_row."Debit",entry_row."Credit",
         entry_row.balance_before,entry_row.balance_after,entry_row.description,
         journal.action,journal.leg
  FROM public.sw_tbl_accounting_entry entry_row
  JOIN public.sw_tbl_accounting_journal journal ON journal.id=entry_row.journal_id
  WHERE entry_row.accountnumber=p_wallet_msisdn
    AND entry_row.business_date BETWEEN p_date_from AND p_date_to
    AND entry_row.currency=upper(p_currency)
  ORDER BY entry_row.entrydate,entry_row.id
$function$;

COMMENT ON FUNCTION public.sw_proc_accounting_close_eod(date,varchar,varchar,text,boolean,varchar)
IS 'Runs idempotent per-currency EOD validation, snapshots, GL aggregation, safeguarding reconciliation, and period close.';

COMMIT;
