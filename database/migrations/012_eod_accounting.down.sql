BEGIN;

DROP FUNCTION IF EXISTS public.sw_fn_account_statement(bigint,date,date,varchar);
DROP FUNCTION IF EXISTS public.sw_fn_income_statement(date,date,varchar,varchar);
DROP FUNCTION IF EXISTS public.sw_fn_balance_sheet(date,varchar,varchar);
DROP FUNCTION IF EXISTS public.sw_fn_trial_balance(date,varchar,varchar);
DROP FUNCTION IF EXISTS public.sw_proc_accounting_close_eod(date,varchar,varchar,text,boolean,varchar);
DROP TRIGGER IF EXISTS "TRG_ACCOUNTING_ENTRY_BUSINESS_CONTEXT" ON public.sw_tbl_accounting_entry;
DROP FUNCTION IF EXISTS public.sw_fn_assign_entry_business_context();
DROP TRIGGER IF EXISTS "TRG_ACCOUNTING_JOURNAL_BUSINESS_CONTEXT" ON public.sw_tbl_accounting_journal;
DROP FUNCTION IF EXISTS public.sw_fn_assign_journal_business_context();

DROP TABLE IF EXISTS public.sw_tbl_eod_fx_rate;
DROP TABLE IF EXISTS public.sw_tbl_daily_gl_balance;
DROP TABLE IF EXISTS public.sw_tbl_daily_wallet_balance;
DROP TABLE IF EXISTS public.sw_tbl_eod_exception;
DROP TABLE IF EXISTS public.sw_tbl_eod_run_step;
DROP TABLE IF EXISTS public.sw_tbl_eod_run;
DROP TABLE IF EXISTS public.sw_tbl_eod_batch;
DROP TABLE IF EXISTS public.sw_tbl_accounting_period;
DROP TABLE IF EXISTS public.sw_tbl_accounting_configuration;
DROP TABLE IF EXISTS public.sw_tbl_wallet_gl_mapping;
DROP TABLE IF EXISTS public.sw_tbl_gl_account;

DROP INDEX IF EXISTS public."IDX_ACCOUNTING_ENTRY_BUSINESS_DATE";
DROP INDEX IF EXISTS public."IDX_ACCOUNTING_JOURNAL_BUSINESS_DATE";

ALTER TABLE public.sw_tbl_accounting_entry
  DROP COLUMN IF EXISTS reporting_entity,
  DROP COLUMN IF EXISTS business_date;

ALTER TABLE public.sw_tbl_accounting_journal
  DROP COLUMN IF EXISTS reporting_entity,
  DROP COLUMN IF EXISTS business_date;

DELETE FROM public."SW_TBL_WALLET"
WHERE "Wallet_MSISDN"=9800001110 AND "Created_By"='MIGRATION_012'
  AND "Amount"=0;

COMMIT;
