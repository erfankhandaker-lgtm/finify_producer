BEGIN;

DROP FUNCTION IF EXISTS public.sw_proc_direct_finify_transaction(jsonb, varchar, varchar, smallint);

DO $migration$
BEGIN
  IF to_regprocedure(
       'public.sw_proc_direct_finify_transaction_legacy(bigint,bigint,bigint,bigint,numeric,character varying,numeric,numeric,character varying,numeric,numeric,numeric,numeric,character varying,character varying,character varying,character varying,bigint,character varying,bigint)'
     ) IS NOT NULL
     AND to_regprocedure(
       'public.sw_proc_direct_finify_transaction(bigint,bigint,bigint,bigint,numeric,character varying,numeric,numeric,character varying,numeric,numeric,numeric,numeric,character varying,character varying,character varying,character varying,bigint,character varying,bigint)'
     ) IS NULL THEN
    ALTER FUNCTION public.sw_proc_direct_finify_transaction_legacy(
      bigint, bigint, bigint, bigint, numeric, character varying, numeric,
      numeric, character varying, numeric, numeric, numeric, numeric,
      character varying, character varying, character varying,
      character varying, bigint, character varying, bigint
    ) RENAME TO sw_proc_direct_finify_transaction;
  END IF;
END
$migration$;

DROP INDEX IF EXISTS public."IDX_COMMISSION_HISTORY_TRANSACTION";
DROP INDEX IF EXISTS public."IDX_CHARGE_HISTORY_TRANSACTION";
DROP INDEX IF EXISTS public."UQ_TRANSACTION_ENTRY_ACCOUNTING_ENTRY";
DROP INDEX IF EXISTS public."IDX_TRANSACTION_ENTRY_TRANSACTION";
DROP INDEX IF EXISTS public."IDX_ACCOUNTING_ENTRY_ACCOUNT";
DROP INDEX IF EXISTS public."IDX_ACCOUNTING_ENTRY_TRANSACTION";
DROP INDEX IF EXISTS public."UQ_ACCOUNTING_ENTRY_JOURNAL_LINE";

ALTER TABLE public.sw_tbl_comission_account_history
  DROP CONSTRAINT IF EXISTS "FK_COMMISSION_HISTORY_REVERSAL_JOURNAL",
  DROP CONSTRAINT IF EXISTS "FK_COMMISSION_HISTORY_JOURNAL",
  DROP COLUMN IF EXISTS reversal_journal_id,
  DROP COLUMN IF EXISTS journal_id;

ALTER TABLE public.sw_tbl_charge_account_history
  DROP CONSTRAINT IF EXISTS "FK_CHARGE_HISTORY_REVERSAL_JOURNAL",
  DROP CONSTRAINT IF EXISTS "FK_CHARGE_HISTORY_JOURNAL",
  DROP COLUMN IF EXISTS reversal_journal_id,
  DROP COLUMN IF EXISTS journal_id;

ALTER TABLE public."SW_TBL_TRANSACTION_DETAILS"
  DROP CONSTRAINT IF EXISTS "FK_TRANSACTION_DETAILS_JOURNAL",
  DROP COLUMN IF EXISTS "Transaction_Leg",
  DROP COLUMN IF EXISTS "Transaction_Action",
  DROP COLUMN IF EXISTS "Journal_ID";

ALTER TABLE public.sw_tbl_transaction_entry
  DROP CONSTRAINT IF EXISTS "FK_TRANSACTION_ENTRY_ACCOUNTING_ENTRY",
  DROP CONSTRAINT IF EXISTS "FK_TRANSACTION_ENTRY_JOURNAL",
  DROP COLUMN IF EXISTS transaction_leg,
  DROP COLUMN IF EXISTS transaction_action,
  DROP COLUMN IF EXISTS accounting_entry_id,
  DROP COLUMN IF EXISTS journal_id;

ALTER TABLE public.sw_tbl_accounting_entry
  DROP CONSTRAINT IF EXISTS "CK_ACCOUNTING_ENTRY_ONE_SIDE",
  DROP CONSTRAINT IF EXISTS "CK_ACCOUNTING_ENTRY_NON_NEGATIVE",
  DROP CONSTRAINT IF EXISTS "FK_ACCOUNTING_ENTRY_REVERSES",
  DROP CONSTRAINT IF EXISTS "FK_ACCOUNTING_ENTRY_CATEGORY",
  DROP CONSTRAINT IF EXISTS "FK_ACCOUNTING_ENTRY_JOURNAL",
  ALTER COLUMN "Debit" DROP NOT NULL,
  ALTER COLUMN "Credit" DROP NOT NULL,
  ALTER COLUMN accounttype DROP NOT NULL,
  ALTER COLUMN accountnumber DROP NOT NULL,
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS reverses_entry_id,
  DROP COLUMN IF EXISTS balance_after,
  DROP COLUMN IF EXISTS balance_before,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS account_code,
  DROP COLUMN IF EXISTS line_number,
  DROP COLUMN IF EXISTS journal_id;

DROP INDEX IF EXISTS public."UQ_ACCOUNTING_CATEGORY_NAME";
DELETE FROM public.sw_tbl_accounting_category
WHERE accountname IN ('CUSTOMER_WALLET', 'TEMPORARY_RESERVE', 'CHARGE_REVENUE', 'COMMISSION_FUNDING');
ALTER TABLE public.sw_tbl_accounting_category DROP COLUMN IF EXISTS normal_balance;

DROP TABLE IF EXISTS public.sw_tbl_accounting_journal;

COMMIT;
