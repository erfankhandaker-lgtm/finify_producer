BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.sw_seq_merchant_refund_transaction;

CREATE TABLE IF NOT EXISTS public.sw_tbl_merchant_refund (
  id bigserial PRIMARY KEY,
  original_transaction_id bigint NOT NULL,
  refund_transaction_id bigint NOT NULL,
  refund_reference text NOT NULL,
  reason text NULL,
  requested_by text NULL,
  status varchar(16) NOT NULL DEFAULT 'COMPLETED',
  journal_id bigint NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FK_MERCHANT_REFUND_ORIGINAL_TRANSACTION"
    FOREIGN KEY (original_transaction_id)
    REFERENCES public."SW_TBL_TRANSACTION_REQUEST" ("Transaction_ID")
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FK_MERCHANT_REFUND_TRANSACTION"
    FOREIGN KEY (refund_transaction_id)
    REFERENCES public."SW_TBL_TRANSACTION_REQUEST" ("Transaction_ID")
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FK_MERCHANT_REFUND_JOURNAL"
    FOREIGN KEY (journal_id)
    REFERENCES public.sw_tbl_accounting_journal (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "UQ_MERCHANT_REFUND_ORIGINAL" UNIQUE (original_transaction_id),
  CONSTRAINT "UQ_MERCHANT_REFUND_TRANSACTION" UNIQUE (refund_transaction_id),
  CONSTRAINT "UQ_MERCHANT_REFUND_REFERENCE" UNIQUE (refund_reference),
  CONSTRAINT "CK_MERCHANT_REFUND_STATUS" CHECK (status IN ('COMPLETED'))
);

CREATE INDEX IF NOT EXISTS "IDX_MERCHANT_REFUND_CREATED"
  ON public.sw_tbl_merchant_refund (created_at DESC);

CREATE OR REPLACE FUNCTION public.sw_proc_full_merchant_refund(
  p_original_transaction_id bigint,
  p_refund_reference text,
  p_reason text DEFAULT NULL,
  p_requested_by text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  status_code varchar,
  status_message text,
  original_transaction_id bigint,
  refund_transaction_id bigint,
  result_journal_id bigint,
  idempotent boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
AS $function$
DECLARE
  v_original public."SW_TBL_TRANSACTION_REQUEST"%ROWTYPE;
  v_existing public.sw_tbl_merchant_refund%ROWTYPE;
  v_refund_transaction_id bigint;
  v_refund_reference text := NULLIF(trim(p_refund_reference), '');
  v_original_journal_id bigint;
  v_journal_id bigint;
  v_line public.sw_tbl_accounting_entry%ROWTYPE;
  v_line_number integer := 0;
  v_before numeric(18,2);
  v_after numeric(18,2);
  v_wallet_code bigint;
  v_accounting_entry_id integer;
  v_source_before numeric(18,2);
  v_source_after numeric(18,2);
  v_destination_before numeric(18,2);
  v_destination_after numeric(18,2);
  v_total_debit numeric(18,2);
  v_total_credit numeric(18,2);
BEGIN
  IF p_original_transaction_id IS NULL OR v_refund_reference IS NULL THEN
    RETURN QUERY SELECT false,'INVALID_REQUEST'::varchar,
      'Original transaction ID and refund reference are required'::text,
      p_original_transaction_id,NULL::bigint,NULL::bigint,false;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(p_original_transaction_id);

  SELECT *
  INTO v_existing
  FROM public.sw_tbl_merchant_refund refund
  WHERE refund.refund_reference = v_refund_reference
     OR refund.original_transaction_id = p_original_transaction_id
  ORDER BY CASE WHEN refund.refund_reference = v_refund_reference THEN 0 ELSE 1 END
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.original_transaction_id <> p_original_transaction_id THEN
      RETURN QUERY SELECT false,'IDEMPOTENCY_CONFLICT'::varchar,
        'Refund reference is already assigned to another transaction'::text,
        p_original_transaction_id,v_existing.refund_transaction_id,
        v_existing.journal_id,false;
      RETURN;
    END IF;
    RETURN QUERY SELECT true,'ALREADY_REFUNDED'::varchar,
      'The full merchant refund was already completed'::text,
      p_original_transaction_id,v_existing.refund_transaction_id,
      v_existing.journal_id,true;
    RETURN;
  END IF;

  SELECT *
  INTO v_original
  FROM public."SW_TBL_TRANSACTION_REQUEST" request
  WHERE request."Transaction_ID" = p_original_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false,'TRANSACTION_NOT_FOUND'::varchar,
      'Original transaction was not found'::text,
      p_original_transaction_id,NULL::bigint,NULL::bigint,false;
    RETURN;
  END IF;

  IF v_original."Transaction_Status" <> 5 THEN
    RETURN QUERY SELECT false,'REFUND_NOT_ALLOWED'::varchar,
      'Only a completed merchant payment can be refunded'::text,
      p_original_transaction_id,NULL::bigint,NULL::bigint,false;
    RETURN;
  END IF;

  SELECT journal.id
  INTO v_original_journal_id
  FROM public.sw_tbl_accounting_journal journal
  WHERE journal.transactionid = p_original_transaction_id
    AND journal.action = 'POST'
    AND journal.status IN ('SETTLED','COMPLETED')
  ORDER BY journal.leg DESC, journal.id DESC
  LIMIT 1;

  IF v_original_journal_id IS NULL THEN
    RETURN QUERY SELECT false,'ORIGINAL_JOURNAL_NOT_FOUND'::varchar,
      'No completed accounting journal exists for the merchant payment'::text,
      p_original_transaction_id,NULL::bigint,NULL::bigint,false;
    RETURN;
  END IF;

  PERFORM 1
  FROM public."SW_TBL_WALLET" wallet
  WHERE wallet."Wallet_MSISDN" IN (
    SELECT DISTINCT entry.accountnumber
    FROM public.sw_tbl_accounting_entry entry
    JOIN public.sw_tbl_accounting_journal journal ON journal.id=entry.journal_id
    WHERE journal.transactionid=p_original_transaction_id
      AND journal.action='POST'
      AND journal.status IN ('SETTLED','COMPLETED')
  )
  ORDER BY wallet."Wallet_MSISDN"
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT entry.accountnumber,
             sum(entry."Credit") AS debit_required,
             sum(entry."Debit") AS credit_first
      FROM public.sw_tbl_accounting_entry entry
      JOIN public.sw_tbl_accounting_journal journal ON journal.id=entry.journal_id
      WHERE journal.transactionid=p_original_transaction_id
        AND journal.action='POST'
        AND journal.status IN ('SETTLED','COMPLETED')
      GROUP BY entry.accountnumber
    ) refund_plan
    JOIN public."SW_TBL_WALLET" wallet
      ON wallet."Wallet_MSISDN"=refund_plan.accountnumber
    WHERE wallet."Status" <> 0
       OR wallet."Amount" + refund_plan.credit_first < refund_plan.debit_required
  ) THEN
    RETURN QUERY SELECT false,'REFUND_BLOCKED'::varchar,
      'A refund debit wallet is inactive or has insufficient balance'::text,
      p_original_transaction_id,NULL::bigint,NULL::bigint,false;
    RETURN;
  END IF;

  LOOP
    v_refund_transaction_id :=
      floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint * 100000
      + (nextval('public.sw_seq_merchant_refund_transaction') % 100000);
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public."SW_TBL_TRANSACTION_REQUEST"
      WHERE "Transaction_ID"=v_refund_transaction_id
    );
  END LOOP;

  SELECT "Amount" INTO v_source_before
  FROM public."SW_TBL_WALLET"
  WHERE "Wallet_MSISDN"=v_original."Dest_Wallet_ID";
  SELECT "Amount" INTO v_destination_before
  FROM public."SW_TBL_WALLET"
  WHERE "Wallet_MSISDN"=v_original."Source_Wallet_ID";

  INSERT INTO public."SW_TBL_TRANSACTION_REQUEST" (
    "Transaction_ID","Keyword","Source_Wallet_ID","Dest_Wallet_ID","Amount",
    "Transaction_Fee","Transaction_Comm","Transaction_Status","Reference_ID",
    "Fee_Payer","Commission_Receiver","Currency","Transactionstatus",
    "Dest_Wallet_Fullname",remarks,"TRNID"
  ) VALUES (
    v_refund_transaction_id,'RFND',v_original."Dest_Wallet_ID",
    v_original."Source_Wallet_ID",v_original."Amount",
    v_original."Transaction_Fee",v_original."Transaction_Comm",5,
    v_refund_reference,v_original."Fee_Payer",v_original."Commission_Receiver",
    v_original."Currency",5,'',
    'Full merchant refund for '||p_original_transaction_id,
    'RFND-'||v_refund_transaction_id
  );

  INSERT INTO public.sw_tbl_accounting_journal (
    transactionid,mode,action,leg,status,original_journal_id,
    keyword,reference,currency,payload,payload_hash
  ) VALUES (
    v_refund_transaction_id,'DIRECT','POST',1,'PROCESSING',
    v_original_journal_id,'RFND',v_refund_reference,v_original."Currency",
    jsonb_build_object(
      'originalTransactionId',p_original_transaction_id,
      'refundReference',v_refund_reference,
      'reason',p_reason,
      'requestedBy',p_requested_by,
      'type','MERCHANT_REFUND'
    ),
    md5(p_original_transaction_id::text||':'||v_refund_reference)
  )
  RETURNING id INTO v_journal_id;

  FOR v_line IN
    SELECT entry.*
    FROM public.sw_tbl_accounting_entry entry
    JOIN public.sw_tbl_accounting_journal journal ON journal.id=entry.journal_id
    WHERE journal.transactionid=p_original_transaction_id
      AND journal.action='POST'
      AND journal.status IN ('SETTLED','COMPLETED')
    ORDER BY CASE WHEN entry."Debit">0 THEN 0 ELSE 1 END,
             journal.leg DESC,entry.line_number DESC
  LOOP
    v_line_number := v_line_number + 1;
    SELECT wallet."Amount",wallet."Wallet_Code"
    INTO v_before,v_wallet_code
    FROM public."SW_TBL_WALLET" wallet
    WHERE wallet."Wallet_MSISDN"=v_line.accountnumber;

    v_after := CASE WHEN v_line."Debit">0
      THEN v_before + v_line."Debit"
      ELSE v_before - v_line."Credit"
    END;

    UPDATE public."SW_TBL_WALLET"
    SET "Balance_Before"=v_before,"Amount"=v_after,
        "Last_Transaction_ID"=v_refund_transaction_id,
        "Last_Transaction_Amount"=GREATEST(v_line."Debit",v_line."Credit"),
        "Modified_Date"=CURRENT_TIMESTAMP,"Modified_By"='MERCHANT_REFUND'
    WHERE "Wallet_MSISDN"=v_line.accountnumber;

    INSERT INTO public.sw_tbl_accounting_entry (
      transactionid,"Debit","Credit",entrydate,accounttype,accountnumber,
      journal_id,line_number,account_code,currency,description,
      balance_before,balance_after,reverses_entry_id,metadata
    ) VALUES (
      v_refund_transaction_id,
      CASE WHEN v_line."Credit">0 THEN v_line."Credit" ELSE 0 END,
      CASE WHEN v_line."Debit">0 THEN v_line."Debit" ELSE 0 END,
      CURRENT_TIMESTAMP,v_line.accounttype,v_line.accountnumber,
      v_journal_id,v_line_number,v_line.account_code,v_line.currency,
      'Merchant refund: '||COALESCE(v_line.description,'accounting entry'),
      v_before,v_after,v_line.id,
      jsonb_build_object(
        'action','REFUND',
        'originalTransactionId',p_original_transaction_id,
        'originalJournalId',v_line.journal_id
      )
    )
    RETURNING id INTO v_accounting_entry_id;

    INSERT INTO public.sw_tbl_transaction_entry (
      transactionid,"Debit","Credit",entrydate,accounttype,accountnumber,
      wallet_code,balance,"TRNID",journal_id,accounting_entry_id,
      transaction_action,transaction_leg
    ) VALUES (
      v_refund_transaction_id,
      CASE WHEN v_line."Credit">0 THEN v_line."Credit" ELSE 0 END,
      CASE WHEN v_line."Debit">0 THEN v_line."Debit" ELSE 0 END,
      CURRENT_TIMESTAMP,v_line.accounttype,v_line.accountnumber,
      v_wallet_code,v_after,'RFND-'||v_refund_transaction_id,
      v_journal_id,v_accounting_entry_id,'REFUND',1
    );
  END LOOP;

  SELECT round(sum("Debit"),2),round(sum("Credit"),2)
  INTO v_total_debit,v_total_credit
  FROM public.sw_tbl_accounting_entry
  WHERE journal_id=v_journal_id;

  IF v_total_debit <= 0 OR v_total_debit <> v_total_credit THEN
    RAISE EXCEPTION 'Refund journal is unbalanced: debit %, credit %',
      v_total_debit,v_total_credit;
  END IF;

  SELECT "Amount" INTO v_source_after
  FROM public."SW_TBL_WALLET"
  WHERE "Wallet_MSISDN"=v_original."Dest_Wallet_ID";
  SELECT "Amount" INTO v_destination_after
  FROM public."SW_TBL_WALLET"
  WHERE "Wallet_MSISDN"=v_original."Source_Wallet_ID";

  INSERT INTO public."SW_TBL_TRANSACTION_DETAILS" (
    "Transaction_ID","Keyword","Source_Wallet_ID","Dest_Wallet_ID","Amount",
    "Souce_Balance_Before","Source_Balance_After",
    "Dest_Balance_Before","Dest_Balance_After",
    "Transaction_Fee","Transaction_Comm","Status","Reference_ID",
    "Fee_Payer","Commission_Receiver","Currency","Type_Of_Transaction",
    "Source_Amount","Dest_Amount","TRNID","Journal_ID",
    "Transaction_Action","Transaction_Leg"
  ) VALUES (
    v_refund_transaction_id,'RFND',v_original."Dest_Wallet_ID",
    v_original."Source_Wallet_ID",v_original."Amount",
    v_source_before::money,v_source_after::money,
    v_destination_before::money,v_destination_after::money,
    v_original."Transaction_Fee",v_original."Transaction_Comm",2,
    v_refund_reference,v_original."Fee_Payer",
    v_original."Commission_Receiver",v_original."Currency",'5',
    v_original."Amount"::numeric,v_original."Amount"::numeric,
    'RFND-'||v_refund_transaction_id,v_journal_id,'REFUND',1
  );

  UPDATE public.sw_tbl_accounting_journal
  SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP
  WHERE id=v_journal_id;

  UPDATE public.sw_tbl_charge_account_history
  SET transactionstatus=3,reversal_journal_id=v_journal_id
  WHERE transactionid=p_original_transaction_id AND transactionstatus=2;

  UPDATE public.sw_tbl_comission_account_history
  SET transactionstatus=3,reversal_journal_id=v_journal_id
  WHERE transactionid=p_original_transaction_id AND transactionstatus=2;

  INSERT INTO public.sw_tbl_merchant_refund (
    original_transaction_id,refund_transaction_id,refund_reference,
    reason,requested_by,status,journal_id
  ) VALUES (
    p_original_transaction_id,v_refund_transaction_id,v_refund_reference,
    p_reason,p_requested_by,'COMPLETED',v_journal_id
  );

  RETURN QUERY SELECT true,'REFUNDED'::varchar,
    'Full merchant refund completed successfully'::text,
    p_original_transaction_id,v_refund_transaction_id,v_journal_id,false;
END
$function$;

COMMENT ON FUNCTION public.sw_proc_full_merchant_refund(bigint,text,text,text)
IS 'Creates one idempotent full merchant-refund transaction and exactly reverses the original principal, charge, and commission accounting entries.';

COMMIT;
