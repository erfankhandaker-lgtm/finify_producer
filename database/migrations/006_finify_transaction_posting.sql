BEGIN;

-- Preserve the previous, non-working implementation so this migration can be
-- rolled back without losing its definition.
DO $migration$
BEGIN
  IF to_regprocedure(
       'public.sw_proc_direct_finify_transaction(bigint,bigint,bigint,bigint,numeric,character varying,numeric,numeric,character varying,numeric,numeric,numeric,numeric,character varying,character varying,character varying,character varying,bigint,character varying,bigint)'
     ) IS NOT NULL
     AND to_regprocedure(
       'public.sw_proc_direct_finify_transaction_legacy(bigint,bigint,bigint,bigint,numeric,character varying,numeric,numeric,character varying,numeric,numeric,numeric,numeric,character varying,character varying,character varying,character varying,bigint,character varying,bigint)'
     ) IS NULL THEN
    ALTER FUNCTION public.sw_proc_direct_finify_transaction(
      bigint, bigint, bigint, bigint, numeric, character varying, numeric,
      numeric, character varying, numeric, numeric, numeric, numeric,
      character varying, character varying, character varying,
      character varying, bigint, character varying, bigint
    ) RENAME TO sw_proc_direct_finify_transaction_legacy;
  END IF;
END
$migration$;

CREATE TABLE IF NOT EXISTS public.sw_tbl_accounting_journal (
  id bigserial PRIMARY KEY,
  transactionid bigint NOT NULL,
  mode varchar(16) NOT NULL,
  action varchar(16) NOT NULL,
  leg smallint NOT NULL,
  status varchar(24) NOT NULL,
  original_journal_id bigint NULL,
  keyword varchar(100) NULL,
  reference text NULL,
  currency varchar(8) NOT NULL DEFAULT 'BDT',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash varchar(32) NOT NULL,
  error_message text NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamp without time zone NULL,
  CONSTRAINT "FK_ACCOUNTING_JOURNAL_ORIGINAL"
    FOREIGN KEY (original_journal_id)
    REFERENCES public.sw_tbl_accounting_journal (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "CK_ACCOUNTING_JOURNAL_MODE"
    CHECK (mode IN ('DIRECT', 'TWO_LEG')),
  CONSTRAINT "CK_ACCOUNTING_JOURNAL_ACTION"
    CHECK (action IN ('POST', 'REVERSE')),
  CONSTRAINT "CK_ACCOUNTING_JOURNAL_LEG"
    CHECK ((action = 'REVERSE' AND leg = 0) OR (action = 'POST' AND leg IN (1, 2))),
  CONSTRAINT "CK_ACCOUNTING_JOURNAL_STATUS"
    CHECK (status IN ('PROCESSING', 'RESERVED', 'SETTLED', 'COMPLETED', 'REVERSED', 'FAILED')),
  CONSTRAINT "UQ_ACCOUNTING_JOURNAL_OPERATION"
    UNIQUE (transactionid, mode, action, leg)
);

CREATE INDEX IF NOT EXISTS "IDX_ACCOUNTING_JOURNAL_TRANSACTION"
  ON public.sw_tbl_accounting_journal (transactionid);

ALTER TABLE public.sw_tbl_accounting_category
  ADD COLUMN IF NOT EXISTS normal_balance varchar(6);

UPDATE public.sw_tbl_accounting_category
SET normal_balance = CASE
  WHEN upper(accounttype) IN ('LIABILITY', 'INCOME', 'EQUITY') THEN 'CREDIT'
  ELSE 'DEBIT'
END
WHERE normal_balance IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ACCOUNTING_CATEGORY_NAME"
  ON public.sw_tbl_accounting_category (accountname);

INSERT INTO public.sw_tbl_accounting_category (accountname, accounttype, normal_balance)
VALUES
  ('CUSTOMER_WALLET', 'LIABILITY', 'CREDIT'),
  ('TEMPORARY_RESERVE', 'LIABILITY', 'CREDIT'),
  ('CHARGE_REVENUE', 'INCOME', 'CREDIT'),
  ('COMMISSION_FUNDING', 'EXPENSE', 'DEBIT')
ON CONFLICT (accountname) DO UPDATE
SET accounttype = EXCLUDED.accounttype,
    normal_balance = EXCLUDED.normal_balance;

ALTER TABLE public.sw_tbl_accounting_entry
  ADD COLUMN IF NOT EXISTS journal_id bigint,
  ADD COLUMN IF NOT EXISTS line_number integer,
  ADD COLUMN IF NOT EXISTS account_code text,
  ADD COLUMN IF NOT EXISTS currency varchar(8),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS balance_before numeric(18,2),
  ADD COLUMN IF NOT EXISTS balance_after numeric(18,2),
  ADD COLUMN IF NOT EXISTS reverses_entry_id integer,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.sw_tbl_accounting_entry
  ALTER COLUMN "Debit" SET DEFAULT 0,
  ALTER COLUMN "Credit" SET DEFAULT 0,
  ALTER COLUMN "Debit" SET NOT NULL,
  ALTER COLUMN "Credit" SET NOT NULL,
  ALTER COLUMN journal_id SET NOT NULL,
  ALTER COLUMN line_number SET NOT NULL,
  ALTER COLUMN account_code SET NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'BDT',
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN accounttype SET NOT NULL,
  ALTER COLUMN accountnumber SET NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_ACCOUNTING_ENTRY_JOURNAL') THEN
    ALTER TABLE public.sw_tbl_accounting_entry
      ADD CONSTRAINT "FK_ACCOUNTING_ENTRY_JOURNAL"
      FOREIGN KEY (journal_id)
      REFERENCES public.sw_tbl_accounting_journal (id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_ACCOUNTING_ENTRY_CATEGORY') THEN
    ALTER TABLE public.sw_tbl_accounting_entry
      ADD CONSTRAINT "FK_ACCOUNTING_ENTRY_CATEGORY"
      FOREIGN KEY (accounttype)
      REFERENCES public.sw_tbl_accounting_category (id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_ACCOUNTING_ENTRY_REVERSES') THEN
    ALTER TABLE public.sw_tbl_accounting_entry
      ADD CONSTRAINT "FK_ACCOUNTING_ENTRY_REVERSES"
      FOREIGN KEY (reverses_entry_id)
      REFERENCES public.sw_tbl_accounting_entry (id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CK_ACCOUNTING_ENTRY_NON_NEGATIVE') THEN
    ALTER TABLE public.sw_tbl_accounting_entry
      ADD CONSTRAINT "CK_ACCOUNTING_ENTRY_NON_NEGATIVE"
      CHECK ("Debit" >= 0 AND "Credit" >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CK_ACCOUNTING_ENTRY_ONE_SIDE') THEN
    ALTER TABLE public.sw_tbl_accounting_entry
      ADD CONSTRAINT "CK_ACCOUNTING_ENTRY_ONE_SIDE"
      CHECK ((("Debit" > 0)::integer + ("Credit" > 0)::integer) = 1);
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ACCOUNTING_ENTRY_JOURNAL_LINE"
  ON public.sw_tbl_accounting_entry (journal_id, line_number);

CREATE INDEX IF NOT EXISTS "IDX_ACCOUNTING_ENTRY_TRANSACTION"
  ON public.sw_tbl_accounting_entry (transactionid);

CREATE INDEX IF NOT EXISTS "IDX_ACCOUNTING_ENTRY_ACCOUNT"
  ON public.sw_tbl_accounting_entry (accountnumber, entrydate);

ALTER TABLE public.sw_tbl_transaction_entry
  ADD COLUMN IF NOT EXISTS journal_id bigint,
  ADD COLUMN IF NOT EXISTS accounting_entry_id integer,
  ADD COLUMN IF NOT EXISTS transaction_action varchar(16),
  ADD COLUMN IF NOT EXISTS transaction_leg smallint;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_TRANSACTION_ENTRY_JOURNAL') THEN
    ALTER TABLE public.sw_tbl_transaction_entry
      ADD CONSTRAINT "FK_TRANSACTION_ENTRY_JOURNAL"
      FOREIGN KEY (journal_id)
      REFERENCES public.sw_tbl_accounting_journal (id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_TRANSACTION_ENTRY_ACCOUNTING_ENTRY') THEN
    ALTER TABLE public.sw_tbl_transaction_entry
      ADD CONSTRAINT "FK_TRANSACTION_ENTRY_ACCOUNTING_ENTRY"
      FOREIGN KEY (accounting_entry_id)
      REFERENCES public.sw_tbl_accounting_entry (id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_TRANSACTION_ENTRY_ACCOUNTING_ENTRY"
  ON public.sw_tbl_transaction_entry (accounting_entry_id)
  WHERE accounting_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS "IDX_TRANSACTION_ENTRY_TRANSACTION"
  ON public.sw_tbl_transaction_entry (transactionid);

ALTER TABLE public."SW_TBL_TRANSACTION_DETAILS"
  ADD COLUMN IF NOT EXISTS "Journal_ID" bigint,
  ADD COLUMN IF NOT EXISTS "Transaction_Action" varchar(16),
  ADD COLUMN IF NOT EXISTS "Transaction_Leg" smallint;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_TRANSACTION_DETAILS_JOURNAL') THEN
    ALTER TABLE public."SW_TBL_TRANSACTION_DETAILS"
      ADD CONSTRAINT "FK_TRANSACTION_DETAILS_JOURNAL"
      FOREIGN KEY ("Journal_ID")
      REFERENCES public.sw_tbl_accounting_journal (id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;
END
$migration$;

ALTER TABLE public.sw_tbl_charge_account_history
  ADD COLUMN IF NOT EXISTS journal_id bigint,
  ADD COLUMN IF NOT EXISTS reversal_journal_id bigint;

ALTER TABLE public.sw_tbl_comission_account_history
  ADD COLUMN IF NOT EXISTS journal_id bigint,
  ADD COLUMN IF NOT EXISTS reversal_journal_id bigint;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_CHARGE_HISTORY_JOURNAL') THEN
    ALTER TABLE public.sw_tbl_charge_account_history
      ADD CONSTRAINT "FK_CHARGE_HISTORY_JOURNAL"
      FOREIGN KEY (journal_id)
      REFERENCES public.sw_tbl_accounting_journal (id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_CHARGE_HISTORY_REVERSAL_JOURNAL') THEN
    ALTER TABLE public.sw_tbl_charge_account_history
      ADD CONSTRAINT "FK_CHARGE_HISTORY_REVERSAL_JOURNAL"
      FOREIGN KEY (reversal_journal_id)
      REFERENCES public.sw_tbl_accounting_journal (id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_COMMISSION_HISTORY_JOURNAL') THEN
    ALTER TABLE public.sw_tbl_comission_account_history
      ADD CONSTRAINT "FK_COMMISSION_HISTORY_JOURNAL"
      FOREIGN KEY (journal_id)
      REFERENCES public.sw_tbl_accounting_journal (id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_COMMISSION_HISTORY_REVERSAL_JOURNAL') THEN
    ALTER TABLE public.sw_tbl_comission_account_history
      ADD CONSTRAINT "FK_COMMISSION_HISTORY_REVERSAL_JOURNAL"
      FOREIGN KEY (reversal_journal_id)
      REFERENCES public.sw_tbl_accounting_journal (id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS "IDX_CHARGE_HISTORY_TRANSACTION"
  ON public.sw_tbl_charge_account_history (transactionid);

CREATE INDEX IF NOT EXISTS "IDX_COMMISSION_HISTORY_TRANSACTION"
  ON public.sw_tbl_comission_account_history (transactionid);

CREATE OR REPLACE FUNCTION public.sw_proc_direct_finify_transaction(
  p_payload jsonb,
  p_mode varchar DEFAULT NULL,
  p_action varchar DEFAULT NULL,
  p_leg smallint DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  status_code varchar,
  status_message text,
  result_transaction_id bigint,
  transaction_mode varchar,
  transaction_action varchar,
  transaction_leg smallint,
  result_journal_id bigint,
  source_balance numeric,
  destination_balance numeric,
  temporary_balance numeric
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
AS $function$
DECLARE
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_request public."SW_TBL_TRANSACTION_REQUEST"%ROWTYPE;
  v_transaction_id bigint;
  v_mode varchar(16);
  v_action varchar(16);
  v_leg smallint;
  v_source bigint;
  v_destination bigint;
  v_temp_wallet bigint := 9800000105;
  v_charge_wallet bigint := 9800000113;
  v_commission_wallet bigint := 9800000114;
  v_amount numeric(18,2);
  v_charge_amount numeric(18,2) := 0;
  v_commission_amount numeric(18,2) := 0;
  v_source_debit numeric(18,2) := 0;
  v_destination_credit numeric(18,2) := 0;
  v_charge_credit numeric(18,2) := 0;
  v_commission_debit numeric(18,2) := 0;
  v_source_commission_credit numeric(18,2) := 0;
  v_destination_commission_credit numeric(18,2) := 0;
  v_total_debit numeric(18,2) := 0;
  v_total_credit numeric(18,2) := 0;
  v_currency varchar(8);
  v_keyword varchar(100);
  v_reference text;
  v_trnid text;
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_line_number integer := 0;
  v_wallet bigint;
  v_side char(1);
  v_line_amount numeric(18,2);
  v_category_name text;
  v_category_id bigint;
  v_account_code text;
  v_description text;
  v_before numeric(18,2);
  v_after numeric(18,2);
  v_wallet_code bigint;
  v_accounting_entry_id integer;
  v_journal_id bigint;
  v_existing_journal public.sw_tbl_accounting_journal%ROWTYPE;
  v_original_journal_id bigint;
  v_original_entry_id integer;
  v_expected_wallet_count integer;
  v_actual_wallet_count integer;
  v_source_before numeric(18,2);
  v_destination_before numeric(18,2);
  v_temp_before numeric(18,2);
  v_charge_before numeric(18,2);
  v_commission_before numeric(18,2);
  v_charge_after numeric(18,2);
  v_commission_after numeric(18,2);
  v_post_status varchar(24);
  v_detail_type smallint;
  v_request_status smallint;
BEGIN
  v_transaction_id := NULLIF(COALESCE(v_payload->>'TransactionId', v_payload->>'transactionId'), '')::bigint;
  IF v_transaction_id IS NULL THEN
    success := false;
    status_code := 'INVALID_MESSAGE';
    status_message := 'Kafka payload must contain TransactionId';
    result_transaction_id := NULL;
    transaction_mode := upper(COALESCE(p_mode, v_payload->>'TransactionMode', ''));
    transaction_action := upper(COALESCE(p_action, v_payload->>'TransactionAction', 'POST'));
    transaction_leg := COALESCE(p_leg, NULLIF(v_payload->>'TransactionLeg', '')::smallint, 1);
    result_journal_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(v_transaction_id);

  SELECT *
  INTO v_request
  FROM public."SW_TBL_TRANSACTION_REQUEST" request_row
  WHERE request_row."Transaction_ID" = v_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    success := false;
    status_code := 'TRANSACTION_NOT_FOUND';
    status_message := 'Transaction request was not found';
    result_transaction_id := v_transaction_id;
    result_journal_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  v_mode := upper(COALESCE(NULLIF(p_mode, ''), NULLIF(v_payload->>'TransactionMode', ''), 'DIRECT'));
  v_action := upper(COALESCE(NULLIF(p_action, ''), NULLIF(v_payload->>'TransactionAction', ''), 'POST'));
  v_leg := CASE WHEN v_action = 'REVERSE' THEN 0
                ELSE COALESCE(p_leg, NULLIF(v_payload->>'TransactionLeg', '')::smallint, 1)
           END;

  result_transaction_id := v_transaction_id;
  transaction_mode := v_mode;
  transaction_action := v_action;
  transaction_leg := v_leg;

  IF v_mode NOT IN ('DIRECT', 'TWO_LEG')
     OR v_action NOT IN ('POST', 'REVERSE')
     OR (v_action = 'POST' AND ((v_mode = 'DIRECT' AND v_leg <> 1)
          OR (v_mode = 'TWO_LEG' AND v_leg NOT IN (1, 2)))) THEN
    success := false;
    status_code := 'INVALID_OPERATION';
    status_message := 'Mode/action/leg combination is invalid';
    result_journal_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT *
  INTO v_existing_journal
  FROM public.sw_tbl_accounting_journal journal_row
  WHERE journal_row.transactionid = v_transaction_id
    AND journal_row.mode = v_mode
    AND journal_row.action = v_action
    AND journal_row.leg = v_leg;

  IF FOUND THEN
    success := v_existing_journal.status IN ('RESERVED', 'SETTLED', 'COMPLETED', 'REVERSED');
    status_code := CASE
      WHEN v_action = 'REVERSE' OR v_existing_journal.status = 'REVERSED' THEN 'ALREADY_REVERSED'
      WHEN v_existing_journal.status = 'RESERVED' THEN 'ALREADY_RESERVED'
      WHEN v_existing_journal.status IN ('SETTLED', 'COMPLETED') THEN 'ALREADY_COMPLETED'
      ELSE 'OPERATION_IN_PROGRESS'
    END;
    status_message := 'This transaction operation has already been processed';
    result_journal_id := v_existing_journal.id;
    SELECT wallet."Amount" INTO source_balance
      FROM public."SW_TBL_WALLET" wallet WHERE wallet."Wallet_MSISDN" = v_request."Source_Wallet_ID";
    SELECT wallet."Amount" INTO destination_balance
      FROM public."SW_TBL_WALLET" wallet WHERE wallet."Wallet_MSISDN" = v_request."Dest_Wallet_ID";
    SELECT wallet."Amount" INTO temporary_balance
      FROM public."SW_TBL_WALLET" wallet WHERE wallet."Wallet_MSISDN" = v_temp_wallet;
    RETURN NEXT;
    RETURN;
  END IF;

  v_source := v_request."Source_Wallet_ID";
  v_destination := v_request."Dest_Wallet_ID";
  v_amount := round(v_request."Amount"::numeric, 2);
  v_currency := upper(COALESCE(NULLIF(v_request."Currency", ''), NULLIF(v_payload->>'Currency', ''), 'BDT'));
  v_keyword := COALESCE(v_request."Keyword", v_payload->>'Serice', v_payload->>'Keyword');
  v_reference := COALESCE(v_request."Reference_ID", v_payload->>'referenceId');
  v_trnid := COALESCE(v_request."TRNID", v_payload->>'TRNSID', v_transaction_id::text);

  IF v_source IS NULL OR v_destination IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
    UPDATE public."SW_TBL_TRANSACTION_REQUEST"
    SET "Transaction_Status" = 3, "Transactionstatus" = 3,
        remarks = 'Invalid source, destination, or amount'
    WHERE "Transaction_ID" = v_transaction_id;
    success := false;
    status_code := 'INVALID_TRANSACTION';
    status_message := 'Source, destination, and a positive amount are required';
    result_journal_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_action = 'POST' AND v_leg = 1 THEN
    IF NULLIF(v_payload->>'Source', '') IS NOT NULL
       AND (v_payload->>'Source')::bigint <> v_source THEN
      success := false;
      status_code := 'REQUEST_MISMATCH';
      status_message := 'Kafka source does not match the transaction request';
      result_journal_id := NULL;
      RETURN NEXT;
      RETURN;
    END IF;

    IF NULLIF(v_payload->>'Destination', '') IS NOT NULL
       AND (v_payload->>'Destination')::bigint <> v_destination THEN
      success := false;
      status_code := 'REQUEST_MISMATCH';
      status_message := 'Kafka destination does not match the transaction request';
      result_journal_id := NULL;
      RETURN NEXT;
      RETURN;
    END IF;

    IF NULLIF(v_payload->>'Amount', '') IS NOT NULL
       AND round((v_payload->>'Amount')::numeric, 2) <> v_amount THEN
      success := false;
      status_code := 'REQUEST_MISMATCH';
      status_message := 'Kafka amount does not match the transaction request';
      result_journal_id := NULL;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  IF v_mode = 'TWO_LEG' AND v_action = 'POST' AND v_leg = 2 THEN
    SELECT journal_row.payload, journal_row.id
    INTO v_payload, v_original_journal_id
    FROM public.sw_tbl_accounting_journal journal_row
    WHERE journal_row.transactionid = v_transaction_id
      AND journal_row.mode = 'TWO_LEG'
      AND journal_row.action = 'POST'
      AND journal_row.leg = 1
      AND journal_row.status = 'RESERVED'
    FOR UPDATE;

    IF NOT FOUND THEN
      success := false;
      status_code := 'RESERVATION_NOT_FOUND';
      status_message := 'Two-leg settlement requires a reserved leg 1';
      result_journal_id := NULL;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  IF v_action = 'POST' THEN
    v_charge_amount := round(COALESCE(NULLIF(v_payload->>'CHARGEAMOUNT', '')::numeric,
                                      v_request."Transaction_Fee"::numeric, 0), 2);
    v_commission_amount := round(COALESCE(NULLIF(v_payload->>'COMMISSIONAMOUNT', '')::numeric,
                                          v_request."Transaction_Comm"::numeric, 0), 2);
    v_source_debit := round(COALESCE(NULLIF(v_payload->>'SourceDebitAmount', '')::numeric, v_amount), 2);
    v_destination_credit := round(COALESCE(NULLIF(v_payload->>'DestinationCreditAmount', '')::numeric, v_amount), 2);
    v_charge_credit := round(COALESCE(NULLIF(v_payload->>'CHARGEWALLETCREDIT', '')::numeric,
                                      v_charge_amount, 0), 2);
    v_commission_debit := round(COALESCE(NULLIF(v_payload->>'COMMISSIONWALLETDEBIT', '')::numeric,
                                         v_commission_amount, 0), 2);
    v_source_commission_credit := round(COALESCE(NULLIF(v_payload->>'SOURCECOMMISSIONCREDIT', '')::numeric, 0), 2);
    v_destination_commission_credit := round(COALESCE(NULLIF(v_payload->>'DESTINATIONCOMMISSIONCREDIT', '')::numeric, 0), 2);
    v_charge_wallet := COALESCE(NULLIF(v_payload->>'CHARGEWALLET', '')::bigint, 9800000113);
    v_commission_wallet := COALESCE(NULLIF(v_payload->>'COMMISSIONWALLET', '')::bigint, 9800000114);

    IF v_source_debit < 0 OR v_destination_credit < 0 OR v_charge_credit < 0
       OR v_commission_debit < 0 OR v_source_commission_credit < 0
       OR v_destination_commission_credit < 0 THEN
      success := false;
      status_code := 'INVALID_AMOUNT';
      status_message := 'Posting amounts cannot be negative';
      result_journal_id := NULL;
      RETURN NEXT;
      RETURN;
    END IF;

    IF v_mode = 'DIRECT' THEN
      IF v_source_debit > 0 THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'wallet', v_source, 'side', 'D', 'amount', v_source_debit,
          'category', 'CUSTOMER_WALLET', 'account_code', 'WALLET:' || v_source,
          'description', 'Direct transaction source debit'));
      END IF;
      IF v_commission_debit > 0 THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'wallet', v_commission_wallet, 'side', 'D', 'amount', v_commission_debit,
          'category', 'COMMISSION_FUNDING', 'account_code', 'COMMISSION:' || v_commission_wallet,
          'description', 'Commission funding debit'));
      END IF;
      IF v_destination_credit > 0 THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'wallet', v_destination, 'side', 'C', 'amount', v_destination_credit,
          'category', 'CUSTOMER_WALLET', 'account_code', 'WALLET:' || v_destination,
          'description', 'Direct transaction destination credit'));
      END IF;
      IF v_charge_credit > 0 THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'wallet', v_charge_wallet, 'side', 'C', 'amount', v_charge_credit,
          'category', 'CHARGE_REVENUE', 'account_code', 'CHARGE:' || v_charge_wallet,
          'description', 'Transaction charge credit'));
      END IF;
      IF v_source_commission_credit > 0 THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'wallet', v_source, 'side', 'C', 'amount', v_source_commission_credit,
          'category', 'CUSTOMER_WALLET', 'account_code', 'WALLET:' || v_source,
          'description', 'Source commission credit'));
      END IF;
      IF v_destination_commission_credit > 0 THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'wallet', v_destination, 'side', 'C', 'amount', v_destination_commission_credit,
          'category', 'CUSTOMER_WALLET', 'account_code', 'WALLET:' || v_destination,
          'description', 'Destination commission credit'));
      END IF;
      v_post_status := 'COMPLETED';
      v_detail_type := 1;
      v_request_status := 5;
    ELSIF v_leg = 1 THEN
      v_lines := jsonb_build_array(
        jsonb_build_object(
          'wallet', v_source, 'side', 'D', 'amount', v_source_debit,
          'category', 'CUSTOMER_WALLET', 'account_code', 'WALLET:' || v_source,
          'description', 'Two-leg source reserve debit'),
        jsonb_build_object(
          'wallet', v_temp_wallet, 'side', 'C', 'amount', v_source_debit,
          'category', 'TEMPORARY_RESERVE', 'account_code', 'RESERVE:' || v_temp_wallet,
          'description', 'Two-leg temporary reserve credit')
      );
      v_post_status := 'RESERVED';
      v_detail_type := 2;
      v_request_status := 4;
    ELSE
      v_lines := jsonb_build_array(jsonb_build_object(
        'wallet', v_temp_wallet, 'side', 'D', 'amount', v_source_debit,
        'category', 'TEMPORARY_RESERVE', 'account_code', 'RESERVE:' || v_temp_wallet,
        'description', 'Two-leg temporary reserve settlement debit'));
      IF v_commission_debit > 0 THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'wallet', v_commission_wallet, 'side', 'D', 'amount', v_commission_debit,
          'category', 'COMMISSION_FUNDING', 'account_code', 'COMMISSION:' || v_commission_wallet,
          'description', 'Commission funding debit'));
      END IF;
      IF v_destination_credit > 0 THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'wallet', v_destination, 'side', 'C', 'amount', v_destination_credit,
          'category', 'CUSTOMER_WALLET', 'account_code', 'WALLET:' || v_destination,
          'description', 'Two-leg final destination credit'));
      END IF;
      IF v_charge_credit > 0 THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'wallet', v_charge_wallet, 'side', 'C', 'amount', v_charge_credit,
          'category', 'CHARGE_REVENUE', 'account_code', 'CHARGE:' || v_charge_wallet,
          'description', 'Transaction charge credit'));
      END IF;
      IF v_source_commission_credit > 0 THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'wallet', v_source, 'side', 'C', 'amount', v_source_commission_credit,
          'category', 'CUSTOMER_WALLET', 'account_code', 'WALLET:' || v_source,
          'description', 'Source commission credit'));
      END IF;
      IF v_destination_commission_credit > 0 THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'wallet', v_destination, 'side', 'C', 'amount', v_destination_commission_credit,
          'category', 'CUSTOMER_WALLET', 'account_code', 'WALLET:' || v_destination,
          'description', 'Destination commission credit'));
      END IF;
      v_post_status := 'COMPLETED';
      v_detail_type := 3;
      v_request_status := 5;
    END IF;
  ELSE
    IF COALESCE(v_request."Transaction_Status", 0) NOT IN (4, 5) THEN
      success := false;
      status_code := CASE WHEN v_request."Transaction_Status" = 6 THEN 'ALREADY_REVERSED'
                          ELSE 'REVERSAL_NOT_ALLOWED' END;
      status_message := 'Only reserved or completed transactions can be reversed';
      result_journal_id := NULL;
      RETURN NEXT;
      RETURN;
    END IF;

    FOR v_line IN
      SELECT jsonb_build_object(
        'wallet', accounting_line.accountnumber,
        'side', CASE WHEN accounting_line."Debit" > 0 THEN 'C' ELSE 'D' END,
        'amount', CASE WHEN accounting_line."Debit" > 0 THEN accounting_line."Debit" ELSE accounting_line."Credit" END,
        'category_id', accounting_line.accounttype,
        'account_code', accounting_line.account_code,
        'description', 'Reversal: ' || COALESCE(accounting_line.description, 'accounting entry'),
        'original_entry_id', accounting_line.id
      )
      FROM public.sw_tbl_accounting_journal original_journal
      JOIN public.sw_tbl_accounting_entry accounting_line
        ON accounting_line.journal_id = original_journal.id
      WHERE original_journal.transactionid = v_transaction_id
        AND original_journal.mode = v_mode
        AND original_journal.action = 'POST'
        AND original_journal.status IN ('RESERVED', 'SETTLED', 'COMPLETED')
      ORDER BY CASE WHEN accounting_line."Debit" > 0 THEN 0 ELSE 1 END,
               original_journal.leg DESC,
               accounting_line.line_number DESC
    LOOP
      v_lines := v_lines || jsonb_build_array(v_line);
    END LOOP;

    IF jsonb_array_length(v_lines) = 0 THEN
      success := false;
      status_code := 'ORIGINAL_JOURNAL_NOT_FOUND';
      status_message := 'No posted accounting journal is available to reverse';
      result_journal_id := NULL;
      RETURN NEXT;
      RETURN;
    END IF;

    SELECT journal_row.id
    INTO v_original_journal_id
    FROM public.sw_tbl_accounting_journal journal_row
    WHERE journal_row.transactionid = v_transaction_id
      AND journal_row.mode = v_mode
      AND journal_row.action = 'POST'
    ORDER BY journal_row.leg DESC
    LIMIT 1;

    v_post_status := 'COMPLETED';
    v_detail_type := 4;
    v_request_status := 6;
  END IF;

  SELECT round(COALESCE(sum((line_item->>'amount')::numeric)
                    FILTER (WHERE line_item->>'side' = 'D'), 0), 2),
         round(COALESCE(sum((line_item->>'amount')::numeric)
                    FILTER (WHERE line_item->>'side' = 'C'), 0), 2)
  INTO v_total_debit, v_total_credit
  FROM jsonb_array_elements(v_lines) line_item;

  IF v_total_debit <= 0 OR v_total_debit <> v_total_credit THEN
    IF v_action = 'POST' AND NOT (v_mode = 'TWO_LEG' AND v_leg = 2) THEN
      UPDATE public."SW_TBL_TRANSACTION_REQUEST"
      SET "Transaction_Status" = 3, "Transactionstatus" = 3,
          remarks = format('Unbalanced posting: debit %s credit %s', v_total_debit, v_total_credit)
      WHERE "Transaction_ID" = v_transaction_id;
    END IF;
    success := false;
    status_code := 'UNBALANCED_POSTING';
    status_message := format('Accounting debit %s does not equal credit %s', v_total_debit, v_total_credit);
    result_journal_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Lock every wallet in deterministic order to prevent deadlocks.
  PERFORM 1
  FROM public."SW_TBL_WALLET" wallet
  JOIN (
    SELECT DISTINCT (line_item->>'wallet')::bigint AS wallet_msisdn
    FROM jsonb_array_elements(v_lines) line_item
  ) required_wallet ON required_wallet.wallet_msisdn = wallet."Wallet_MSISDN"
  ORDER BY wallet."Wallet_MSISDN"
  FOR UPDATE OF wallet;

  SELECT count(DISTINCT (line_item->>'wallet')::bigint)
  INTO v_expected_wallet_count
  FROM jsonb_array_elements(v_lines) line_item;

  SELECT count(*)
  INTO v_actual_wallet_count
  FROM public."SW_TBL_WALLET" wallet
  WHERE wallet."Wallet_MSISDN" IN (
    SELECT DISTINCT (line_item->>'wallet')::bigint
    FROM jsonb_array_elements(v_lines) line_item
  )
    AND wallet."Status" = 0;

  IF v_actual_wallet_count <> v_expected_wallet_count THEN
    success := false;
    status_code := 'WALLET_NOT_AVAILABLE';
    status_message := 'One or more posting wallets are missing or inactive';
    result_journal_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- A wallet must cover all debit lines before any update is made. This makes
  -- reversals fail atomically instead of partially returning funds.
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT (line_item->>'wallet')::bigint AS wallet_msisdn,
             sum((line_item->>'amount')::numeric) AS debit_required
      FROM jsonb_array_elements(v_lines) line_item
      WHERE line_item->>'side' = 'D'
      GROUP BY (line_item->>'wallet')::bigint
    ) debit_plan
    JOIN public."SW_TBL_WALLET" wallet
      ON wallet."Wallet_MSISDN" = debit_plan.wallet_msisdn
    WHERE wallet."Amount"
          + CASE WHEN v_action = 'REVERSE' THEN COALESCE((
              SELECT sum((credit_item->>'amount')::numeric)
              FROM jsonb_array_elements(v_lines) credit_item
              WHERE credit_item->>'side' = 'C'
                AND (credit_item->>'wallet')::bigint = debit_plan.wallet_msisdn
            ), 0) ELSE 0 END
          < debit_plan.debit_required
  ) THEN
    IF v_action = 'POST' AND NOT (v_mode = 'TWO_LEG' AND v_leg = 2) THEN
      UPDATE public."SW_TBL_TRANSACTION_REQUEST"
      SET "Transaction_Status" = 3, "Transactionstatus" = 3,
          remarks = 'Insufficient wallet balance'
      WHERE "Transaction_ID" = v_transaction_id;
    END IF;
    success := false;
    status_code := CASE WHEN v_action = 'REVERSE' THEN 'REVERSAL_BLOCKED'
                        WHEN v_mode = 'TWO_LEG' AND v_leg = 2 THEN 'SETTLEMENT_BLOCKED'
                        ELSE 'INSUFFICIENT_BALANCE' END;
    status_message := 'A debit wallet has insufficient balance';
    result_journal_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT wallet."Amount" INTO v_source_before
    FROM public."SW_TBL_WALLET" wallet WHERE wallet."Wallet_MSISDN" = v_source;
  SELECT wallet."Amount" INTO v_destination_before
    FROM public."SW_TBL_WALLET" wallet WHERE wallet."Wallet_MSISDN" = v_destination;
  SELECT wallet."Amount" INTO v_temp_before
    FROM public."SW_TBL_WALLET" wallet WHERE wallet."Wallet_MSISDN" = v_temp_wallet;
  SELECT wallet."Amount" INTO v_charge_before
    FROM public."SW_TBL_WALLET" wallet WHERE wallet."Wallet_MSISDN" = v_charge_wallet;
  SELECT wallet."Amount" INTO v_commission_before
    FROM public."SW_TBL_WALLET" wallet WHERE wallet."Wallet_MSISDN" = v_commission_wallet;

  INSERT INTO public.sw_tbl_accounting_journal (
    transactionid, mode, action, leg, status, original_journal_id,
    keyword, reference, currency, payload, payload_hash
  ) VALUES (
    v_transaction_id, v_mode, v_action, v_leg, 'PROCESSING', v_original_journal_id,
    v_keyword, v_reference, v_currency, v_payload, md5(v_payload::text)
  )
  RETURNING id INTO v_journal_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines)
  LOOP
    v_line_number := v_line_number + 1;
    v_wallet := (v_line->>'wallet')::bigint;
    v_side := v_line->>'side';
    v_line_amount := round((v_line->>'amount')::numeric, 2);
    v_category_name := v_line->>'category';
    v_account_code := v_line->>'account_code';
    v_description := v_line->>'description';
    v_original_entry_id := NULLIF(v_line->>'original_entry_id', '')::integer;

    IF NULLIF(v_line->>'category_id', '') IS NOT NULL THEN
      v_category_id := (v_line->>'category_id')::bigint;
    ELSE
      SELECT category.id INTO v_category_id
      FROM public.sw_tbl_accounting_category category
      WHERE category.accountname = v_category_name;
    END IF;

    IF v_category_id IS NULL THEN
      RAISE EXCEPTION 'Accounting category % is not configured', v_category_name;
    END IF;

    SELECT wallet."Amount", wallet."Wallet_Code"
    INTO v_before, v_wallet_code
    FROM public."SW_TBL_WALLET" wallet
    WHERE wallet."Wallet_MSISDN" = v_wallet;

    v_after := CASE WHEN v_side = 'D' THEN v_before - v_line_amount
                    ELSE v_before + v_line_amount END;

    UPDATE public."SW_TBL_WALLET"
    SET "Balance_Before" = v_before,
        "Amount" = v_after,
        "Last_Transaction_ID" = v_transaction_id,
        "Last_Transaction_Amount" = v_line_amount,
        "Modified_Date" = CURRENT_TIMESTAMP,
        "Modified_By" = 'FINIFY_POSTING'
    WHERE "Wallet_MSISDN" = v_wallet;

    INSERT INTO public.sw_tbl_accounting_entry (
      transactionid, "Debit", "Credit", entrydate, accounttype,
      accountnumber, journal_id, line_number, account_code, currency,
      description, balance_before, balance_after, reverses_entry_id, metadata
    ) VALUES (
      v_transaction_id,
      CASE WHEN v_side = 'D' THEN v_line_amount ELSE 0 END,
      CASE WHEN v_side = 'C' THEN v_line_amount ELSE 0 END,
      CURRENT_TIMESTAMP, v_category_id, v_wallet, v_journal_id,
      v_line_number, v_account_code, v_currency, v_description,
      v_before, v_after, v_original_entry_id,
      jsonb_build_object('mode', v_mode, 'action', v_action, 'leg', v_leg)
    )
    RETURNING id INTO v_accounting_entry_id;

    INSERT INTO public.sw_tbl_transaction_entry (
      transactionid, "Debit", "Credit", entrydate, accounttype,
      accountnumber, wallet_code, balance, "TRNID", journal_id,
      accounting_entry_id, transaction_action, transaction_leg
    ) VALUES (
      v_transaction_id,
      CASE WHEN v_side = 'D' THEN v_line_amount ELSE 0 END,
      CASE WHEN v_side = 'C' THEN v_line_amount ELSE 0 END,
      CURRENT_TIMESTAMP, v_category_id, v_wallet, v_wallet_code,
      v_after, v_trnid, v_journal_id, v_accounting_entry_id,
      v_action, v_leg
    );
  END LOOP;

  SELECT wallet."Amount" INTO source_balance
    FROM public."SW_TBL_WALLET" wallet WHERE wallet."Wallet_MSISDN" = v_source;
  SELECT wallet."Amount" INTO destination_balance
    FROM public."SW_TBL_WALLET" wallet WHERE wallet."Wallet_MSISDN" = v_destination;
  SELECT wallet."Amount" INTO temporary_balance
    FROM public."SW_TBL_WALLET" wallet WHERE wallet."Wallet_MSISDN" = v_temp_wallet;
  SELECT wallet."Amount" INTO v_charge_after
    FROM public."SW_TBL_WALLET" wallet WHERE wallet."Wallet_MSISDN" = v_charge_wallet;
  SELECT wallet."Amount" INTO v_commission_after
    FROM public."SW_TBL_WALLET" wallet WHERE wallet."Wallet_MSISDN" = v_commission_wallet;

  IF v_action = 'POST' THEN
    IF v_mode = 'TWO_LEG' AND v_leg = 1 THEN
      INSERT INTO public."SW_TBL_TRANSACTION_TEMP" (
        "Transaction_ID", "Keyword", "Source_Wallet_ID", "Dest_Wallet_ID",
        "Amount", "Souce_Balance_Before", "Source_Balance_After",
        "Dest_Balance_Before", "Dest_Balance_After", "Transaction_Fee",
        "Transaction_Comm", "Status"
      ) VALUES (
        v_transaction_id, v_keyword, v_source, v_destination, v_amount,
        v_source_before, source_balance, v_temp_before, temporary_balance,
        v_charge_amount, v_commission_amount, 1
      );
    ELSIF v_mode = 'TWO_LEG' AND v_leg = 2 THEN
      UPDATE public."SW_TBL_TRANSACTION_TEMP"
      SET "Dest_Balance_Before" = v_destination_before,
          "Dest_Balance_After" = destination_balance,
          "Status" = 2
      WHERE "Transaction_ID" = v_transaction_id;

      UPDATE public.sw_tbl_accounting_journal
      SET status = 'SETTLED', completed_at = CURRENT_TIMESTAMP
      WHERE id = v_original_journal_id;
    END IF;

    INSERT INTO public."SW_TBL_TRANSACTION_DETAILS" (
      "Transaction_ID", "Keyword", "Source_Wallet_ID", "Dest_Wallet_ID",
      "Amount", "Souce_Balance_Before", "Source_Balance_After",
      "Dest_Balance_Before", "Dest_Balance_After", "Transaction_Fee",
      "Transaction_Comm", "Status", "Reference_ID", "Fee_Payer",
      "Commission_Receiver", "Currency", "Charge_Account_Balance_Before",
      "Charge_Account_Balance_After", "Comission_Account_Balance_Before",
      "Comission_Account_Balance_After", "Type_Of_Transaction",
      "Temp_Account_balance_before", "Temp_Account_balance_After",
      "Source_Amount", "Dest_Amount", "Temp_Account", "TRNID",
      "Journal_ID", "Transaction_Action", "Transaction_Leg"
    ) VALUES (
      v_transaction_id, v_keyword, v_source, v_destination, v_amount::money,
      v_source_before::money, source_balance::money,
      v_destination_before::money, destination_balance::money,
      v_charge_amount::money, v_commission_amount::money,
      CASE WHEN v_post_status = 'RESERVED' THEN 1 ELSE 2 END,
      v_reference, v_request."Fee_Payer", v_request."Commission_Receiver",
      v_currency, v_charge_before::money, v_charge_after::money,
      v_commission_before::money, v_commission_after::money, v_detail_type,
      v_temp_before::money, temporary_balance::money,
      v_source_debit, v_destination_credit, v_temp_wallet, v_trnid,
      v_journal_id, v_action, v_leg
    );

    IF (v_mode = 'DIRECT' OR v_leg = 2) AND v_charge_credit > 0 THEN
      INSERT INTO public.sw_tbl_charge_account_history (
        transactionid, chargepayer, charge, chargeaccount, receiveamount,
        keyword, reference, transactionstatus, journal_id
      ) VALUES (
        v_transaction_id, v_request."Fee_Payer", v_charge_amount,
        v_charge_wallet, v_charge_credit, v_keyword, v_reference, 2, v_journal_id
      );
    END IF;

    IF (v_mode = 'DIRECT' OR v_leg = 2) AND v_commission_debit > 0 THEN
      INSERT INTO public.sw_tbl_comission_account_history (
        transactionid, comissionpayer, comission, receiveraccount,
        receiveamount, keyword, reference, transactionstatus, journal_id
      ) VALUES (
        v_transaction_id, v_commission_wallet, v_commission_amount,
        v_request."Commission_Receiver",
        v_source_commission_credit + v_destination_commission_credit,
        v_keyword, v_reference, 2, v_journal_id
      );
    END IF;
  ELSE
    UPDATE public.sw_tbl_accounting_journal
    SET status = 'REVERSED', completed_at = CURRENT_TIMESTAMP
    WHERE transactionid = v_transaction_id
      AND mode = v_mode
      AND action = 'POST'
      AND status IN ('RESERVED', 'SETTLED', 'COMPLETED');

    UPDATE public."SW_TBL_TRANSACTION_TEMP"
    SET "Status" = 3
    WHERE "Transaction_ID" = v_transaction_id;

    UPDATE public.sw_tbl_charge_account_history
    SET transactionstatus = 3, reversal_journal_id = v_journal_id
    WHERE transactionid = v_transaction_id
      AND transactionstatus = 2;

    UPDATE public.sw_tbl_comission_account_history
    SET transactionstatus = 3, reversal_journal_id = v_journal_id
    WHERE transactionid = v_transaction_id
      AND transactionstatus = 2;

    INSERT INTO public."SW_TBL_TRANSACTION_DETAILS" (
      "Transaction_ID", "Keyword", "Source_Wallet_ID", "Dest_Wallet_ID",
      "Amount", "Souce_Balance_Before", "Source_Balance_After",
      "Dest_Balance_Before", "Dest_Balance_After", "Status",
      "Reference_ID", "Currency", "Type_Of_Transaction",
      "Temp_Account_balance_before", "Temp_Account_balance_After",
      "Temp_Account", "TRNID", "Journal_ID", "Transaction_Action",
      "Transaction_Leg"
    ) VALUES (
      v_transaction_id, v_keyword, v_source, v_destination, v_amount::money,
      v_source_before::money, source_balance::money,
      v_destination_before::money, destination_balance::money, 3,
      v_reference, v_currency, v_detail_type,
      v_temp_before::money, temporary_balance::money,
      v_temp_wallet, v_trnid, v_journal_id, v_action, v_leg
    );
  END IF;

  UPDATE public."SW_TBL_TRANSACTION_REQUEST"
  SET "Transaction_Status" = v_request_status,
      "Transactionstatus" = v_request_status,
      "Transaction_Fee" = CASE WHEN v_action = 'POST' THEN v_charge_amount::money ELSE "Transaction_Fee" END,
      "Transaction_Comm" = CASE WHEN v_action = 'POST' THEN v_commission_amount::money ELSE "Transaction_Comm" END,
      remarks = CASE v_request_status
        WHEN 4 THEN 'Funds reserved'
        WHEN 5 THEN 'Transaction completed'
        WHEN 6 THEN 'Transaction reversed'
        ELSE remarks
      END
  WHERE "Transaction_ID" = v_transaction_id;

  UPDATE public.sw_tbl_accounting_journal
  SET status = v_post_status, completed_at = CURRENT_TIMESTAMP
  WHERE id = v_journal_id;

  success := true;
  status_code := CASE
    WHEN v_action = 'REVERSE' THEN 'REVERSED'
    WHEN v_post_status = 'RESERVED' THEN 'RESERVED'
    ELSE 'COMPLETED'
  END;
  status_message := CASE
    WHEN v_action = 'REVERSE' THEN 'Transaction reversed successfully'
    WHEN v_post_status = 'RESERVED' THEN 'Transaction funds reserved successfully'
    ELSE 'Transaction completed successfully'
  END;
  result_journal_id := v_journal_id;
  RETURN NEXT;
END
$function$;

COMMENT ON FUNCTION public.sw_proc_direct_finify_transaction(jsonb, varchar, varchar, smallint)
IS 'Posts idempotent direct or two-leg Kafka transactions and full reversals using balanced accounting journals.';

COMMIT;
