BEGIN;

-- This verification is deliberately rollback-only. The identifiers are outside
-- the normal wallet range and no test data or balance change is committed.
INSERT INTO public."SW_TBL_WALLET" (
  "Wallet_MSISDN", "Wallet_Code", "Amount", "Status", is_default, "Account_code"
) VALUES
  (999900000001, 9901, 1000.00, 0, false, '00000000-0000-0000-0000-000000009901'),
  (999900000002, 9902, 100.00, 0, false, '00000000-0000-0000-0000-000000009902'),
  (999900000003, 9903, 500.00, 0, false, '00000000-0000-0000-0000-000000009903'),
  (999900000004, 9904, 500.00, 0, false, '00000000-0000-0000-0000-000000009904');

INSERT INTO public."SW_TBL_TRANSACTION_REQUEST" (
  "Transaction_ID", "Keyword", "Source_Wallet_ID", "Dest_Wallet_ID",
  "Amount", "Transaction_Fee", "Transaction_Comm", "Transaction_Status",
  "Transactionstatus", "Reference_ID", "Currency", "TRNID"
) VALUES
  (999990001, 'PMNT', 999900000001, 999900000002,
   100.00::money, 2.00::money, 1.00::money, 2, 2, 'VERIFY-DIRECT', 'BDT', 'VERIFY-DIRECT'),
  (999990002, 'PMNT', 999900000001, 999900000002,
   100.00::money, 2.00::money, 1.00::money, 2, 2, 'VERIFY-TWO-LEG', 'BDT', 'VERIFY-TWO-LEG');

DO $verify$
DECLARE
  v_result record;
  v_debit numeric;
  v_credit numeric;
  v_source numeric;
  v_destination numeric;
  v_charge numeric;
  v_commission numeric;
  v_temp numeric;
  v_temp_start numeric;
BEGIN
  SELECT "Amount" INTO v_temp_start
  FROM public."SW_TBL_WALLET"
  WHERE "Wallet_MSISDN" = 9800000105;

  SELECT * INTO v_result
  FROM public.sw_proc_direct_finify_transaction(
    jsonb_build_object(
      'TransactionId', 999990001,
      'Source', 999900000001,
      'Destination', 999900000002,
      'Amount', 100.00,
      'SourceDebitAmount', 102.00,
      'DestinationCreditAmount', 100.00,
      'CHARGEAMOUNT', 2.00,
      'CHARGEWALLET', 999900000003,
      'CHARGEWALLETCREDIT', 2.00,
      'COMMISSIONAMOUNT', 1.00,
      'COMMISSIONWALLET', 999900000004,
      'COMMISSIONWALLETDEBIT', 1.00,
      'DESTINATIONCOMMISSIONCREDIT', 1.00,
      'TransactionMode', 'DIRECT',
      'TransactionAction', 'POST',
      'TransactionLeg', 1
    )
  );
  IF NOT v_result.success OR v_result.status_code <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Direct verification failed: %', row_to_json(v_result);
  END IF;

  SELECT sum("Debit"), sum("Credit")
  INTO v_debit, v_credit
  FROM public.sw_tbl_accounting_entry
  WHERE journal_id = v_result.result_journal_id;
  IF v_debit <> v_credit OR v_debit <> 103.00 THEN
    RAISE EXCEPTION 'Direct journal is not balanced: debit %, credit %', v_debit, v_credit;
  END IF;

  SELECT * INTO v_result
  FROM public.sw_proc_direct_finify_transaction(
    jsonb_build_object('TransactionId', 999990001, 'TransactionMode', 'DIRECT')
  );
  IF v_result.status_code <> 'ALREADY_COMPLETED' THEN
    RAISE EXCEPTION 'Direct idempotency verification failed: %', row_to_json(v_result);
  END IF;

  SELECT * INTO v_result
  FROM public.sw_proc_direct_finify_transaction(
    jsonb_build_object(
      'TransactionId', 999990001,
      'TransactionMode', 'DIRECT',
      'TransactionAction', 'REVERSE'
    )
  );
  IF NOT v_result.success OR v_result.status_code <> 'REVERSED' THEN
    RAISE EXCEPTION 'Direct reversal verification failed: %', row_to_json(v_result);
  END IF;

  SELECT "Amount" INTO v_source FROM public."SW_TBL_WALLET" WHERE "Wallet_MSISDN" = 999900000001;
  SELECT "Amount" INTO v_destination FROM public."SW_TBL_WALLET" WHERE "Wallet_MSISDN" = 999900000002;
  SELECT "Amount" INTO v_charge FROM public."SW_TBL_WALLET" WHERE "Wallet_MSISDN" = 999900000003;
  SELECT "Amount" INTO v_commission FROM public."SW_TBL_WALLET" WHERE "Wallet_MSISDN" = 999900000004;
  IF v_source <> 1000 OR v_destination <> 100 OR v_charge <> 500 OR v_commission <> 500 THEN
    RAISE EXCEPTION 'Direct reversal did not restore balances';
  END IF;

  SELECT * INTO v_result
  FROM public.sw_proc_direct_finify_transaction(
    jsonb_build_object(
      'TransactionId', 999990002,
      'Source', 999900000001,
      'Destination', 999900000002,
      'Amount', 100.00,
      'SourceDebitAmount', 102.00,
      'DestinationCreditAmount', 100.00,
      'CHARGEAMOUNT', 2.00,
      'CHARGEWALLET', 999900000003,
      'CHARGEWALLETCREDIT', 2.00,
      'COMMISSIONAMOUNT', 1.00,
      'COMMISSIONWALLET', 999900000004,
      'COMMISSIONWALLETDEBIT', 1.00,
      'DESTINATIONCOMMISSIONCREDIT', 1.00,
      'TransactionMode', 'TWO_LEG',
      'TransactionAction', 'POST',
      'TransactionLeg', 1
    )
  );
  IF NOT v_result.success OR v_result.status_code <> 'RESERVED' THEN
    RAISE EXCEPTION 'Two-leg reservation verification failed: %', row_to_json(v_result);
  END IF;

  SELECT * INTO v_result
  FROM public.sw_proc_direct_finify_transaction(
    jsonb_build_object('TransactionId', 999990002), 'TWO_LEG', 'POST', 2::smallint
  );
  IF NOT v_result.success OR v_result.status_code <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Two-leg settlement verification failed: %', row_to_json(v_result);
  END IF;

  SELECT * INTO v_result
  FROM public.sw_proc_direct_finify_transaction(
    jsonb_build_object('TransactionId', 999990002), 'TWO_LEG', 'REVERSE', NULL::smallint
  );
  IF NOT v_result.success OR v_result.status_code <> 'REVERSED' THEN
    RAISE EXCEPTION 'Two-leg reversal verification failed: %', row_to_json(v_result);
  END IF;

  SELECT "Amount" INTO v_source FROM public."SW_TBL_WALLET" WHERE "Wallet_MSISDN" = 999900000001;
  SELECT "Amount" INTO v_destination FROM public."SW_TBL_WALLET" WHERE "Wallet_MSISDN" = 999900000002;
  SELECT "Amount" INTO v_charge FROM public."SW_TBL_WALLET" WHERE "Wallet_MSISDN" = 999900000003;
  SELECT "Amount" INTO v_commission FROM public."SW_TBL_WALLET" WHERE "Wallet_MSISDN" = 999900000004;
  SELECT "Amount" INTO v_temp FROM public."SW_TBL_WALLET" WHERE "Wallet_MSISDN" = 9800000105;
  IF v_source <> 1000 OR v_destination <> 100 OR v_charge <> 500
     OR v_commission <> 500 OR v_temp <> v_temp_start THEN
    RAISE EXCEPTION 'Two-leg reversal did not restore balances';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sw_tbl_accounting_entry entry_row
    JOIN public.sw_tbl_accounting_journal journal_row ON journal_row.id = entry_row.journal_id
    WHERE journal_row.transactionid IN (999990001, 999990002)
    GROUP BY entry_row.journal_id
    HAVING sum(entry_row."Debit") <> sum(entry_row."Credit")
  ) THEN
    RAISE EXCEPTION 'At least one verification journal is unbalanced';
  END IF;

  RAISE NOTICE 'Direct, idempotency, two-leg, and reversal verification passed';
END
$verify$;

ROLLBACK;
