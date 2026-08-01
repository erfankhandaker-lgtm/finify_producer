DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.sw_tbl_accounting_configuration config
    CROSS JOIN (VALUES (105),(110),(113),(114),(115)) required(wallet_code)
    LEFT JOIN public."SW_TBL_WALLET" source
      ON source."Wallet_Code"=required.wallet_code
     AND upper(source.currency)=config.currency
     AND source.owner_type='SYSTEM' AND source."Status"=0
    WHERE config.is_active
      AND source."Wallet_MSISDN" IS NULL
  ) THEN
    RAISE EXCEPTION 'An active currency lacks a required operational system wallet';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.treasury_funding_requests request
    LEFT JOIN public.sw_tbl_accounting_journal journal
      ON journal.id=request.accounting_journal_id
    LEFT JOIN LATERAL (
      SELECT sum(entry."Debit") AS debit,sum(entry."Credit") AS credit,count(*) AS lines
      FROM public.sw_tbl_accounting_entry entry
      WHERE entry.journal_id=journal.id
    ) totals ON true
    WHERE request.status='APPROVED'
      AND request.funding_type='SAFEGUARDING'
      AND (
        journal.id IS NULL
        OR totals.lines<>2
        OR totals.debit<>request.amount
        OR totals.credit<>request.amount
      )
  ) THEN
    RAISE EXCEPTION 'An approved safeguarding movement lacks a balanced two-line journal';
  END IF;

  IF position(
    'v_variance>=0'
    IN pg_get_functiondef(
      'public.sw_proc_accounting_close_eod(date,character varying,character varying,text,boolean,character varying)'::regprocedure
    )
  )=0 THEN
    RAISE EXCEPTION 'Safeguarding surplus handling was not installed';
  END IF;
END
$verify$;

SELECT 'Treasury accounting and safeguarding controls verified' AS result;
