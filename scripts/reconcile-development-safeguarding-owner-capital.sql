\set ON_ERROR_STOP on

-- Development-only repair for safeguarding balances that were loaded directly
-- before Treasury maker-checker accounting was enabled. It does not change the
-- safeguarding balance; it records the missing owner-capital contra and journal.
DO $repair$
DECLARE
  movement record;
  request_id bigint;
  journal_id bigint;
  transaction_id bigint;
  capital_before numeric(24,2);
BEGIN
  FOR movement IN
    SELECT safeguarding."Wallet_MSISDN" AS safeguarding_wallet,
           safeguarding."Amount"::numeric(24,2) AS amount,
           upper(safeguarding.currency) AS currency,
           capital."Wallet_MSISDN" AS capital_wallet,
           capital."Amount"::numeric(24,2) AS current_capital
    FROM public."SW_TBL_WALLET" safeguarding
    JOIN public."SW_TBL_WALLET" capital
      ON capital.owner_type='SYSTEM' AND capital."Status"=0
     AND capital."Wallet_Code"=116
     AND upper(capital.currency)=upper(safeguarding.currency)
    WHERE safeguarding.owner_type='SYSTEM' AND safeguarding."Status"=0
      AND safeguarding."Wallet_Code"=110 AND safeguarding."Amount">0
      AND NOT EXISTS (
        SELECT 1 FROM public.treasury_funding_requests request
        WHERE request.wallet_msisdn=safeguarding."Wallet_MSISDN"
          AND request.reference='DEV-OWNER-CAPITAL-' || upper(safeguarding.currency)
      )
    ORDER BY safeguarding.currency
    FOR UPDATE OF safeguarding,capital
  LOOP
    capital_before := movement.current_capital;

    INSERT INTO public.treasury_funding_requests(
      funding_type,wallet_msisdn,wallet_code,currency,amount,reference,status,
      maker_id,maker_comment,checker_id,checker_comment,wallet_balance_before,
      wallet_balance_after,created_at,decided_at,direction,bank_name,bank_account,
      value_date,evidence_reference,business_purpose,funding_classification
    ) VALUES (
      'SAFEGUARDING',movement.safeguarding_wallet,110,movement.currency,movement.amount,
      'DEV-OWNER-CAPITAL-' || movement.currency,'PENDING','DEVELOPMENT_REPAIR_MAKER',
      'Reconcile directly loaded development safeguarding opening balance',NULL,NULL,
      NULL,NULL,CURRENT_TIMESTAMP,NULL,'CREDIT','Development opening balance',
      'OWNER-CAPITAL-' || movement.currency,CURRENT_DATE,'DEVELOPMENT-REPAIR',
      'SAFEGUARDING_FUNDING','OWNER_INVESTMENT'
    ) RETURNING id INTO request_id;

    transaction_id := -(700000000000000000::bigint + request_id);

    INSERT INTO public.sw_tbl_accounting_journal(
      transactionid,mode,action,leg,status,keyword,reference,currency,payload,
      payload_hash,completed_at,business_date,reporting_entity
    ) VALUES (
      transaction_id,'DIRECT','POST',1,'COMPLETED','TREASURY_SAFEGUARDING',
      'DEV-OWNER-CAPITAL-' || movement.currency,movement.currency,
      jsonb_build_object(
        'treasuryRequestId',request_id,
        'fundingType','SAFEGUARDING',
        'fundingClassification','OWNER_INVESTMENT',
        'direction','CREDIT',
        'businessPurpose','SAFEGUARDING_FUNDING',
        'developmentRepair',true
      ),
      md5(('DEV-OWNER-CAPITAL-' || movement.currency || ':' || movement.amount)::text),
      CURRENT_TIMESTAMP,CURRENT_DATE,'FINIFY_UK'
    ) RETURNING id INTO journal_id;

    INSERT INTO public.sw_tbl_accounting_entry(
      transactionid,"Debit","Credit",entrydate,accounttype,accountnumber,
      journal_id,line_number,account_code,currency,description,
      balance_before,balance_after,metadata
    ) VALUES
      (transaction_id,movement.amount,0,CURRENT_TIMESTAMP,
       (SELECT id FROM public.sw_tbl_accounting_category WHERE accountname='SAFEGUARDING_ASSET'),
       movement.safeguarding_wallet,journal_id,1,
       'SAFEGUARDING:' || movement.safeguarding_wallet,movement.currency,
       'Development safeguarding opening balance',0,movement.amount,
       jsonb_build_object('treasuryRequestId',request_id,'developmentRepair',true)),
      (transaction_id,0,movement.amount,CURRENT_TIMESTAMP,
       (SELECT id FROM public.sw_tbl_accounting_category WHERE accountname='OWNER_CAPITAL'),
       movement.capital_wallet,journal_id,2,
       'OWNER_CAPITAL:' || movement.capital_wallet,movement.currency,
       'Owner capital investment',capital_before,capital_before+movement.amount,
       jsonb_build_object('treasuryRequestId',request_id,'developmentRepair',true));

    UPDATE public."SW_TBL_WALLET"
    SET "Balance_Before"="Amount","Amount"="Amount"+movement.amount,
        "Last_Transaction_ID"=transaction_id,
        "Last_Transaction_Amount"=movement.amount,
        "Modified_By"='DEVELOPMENT_REPAIR_CHECKER',"Modified_Date"=CURRENT_TIMESTAMP
    WHERE "Wallet_MSISDN"=movement.capital_wallet;

    UPDATE public.treasury_funding_requests
    SET status='APPROVED',checker_id='DEVELOPMENT_REPAIR_CHECKER',
        checker_comment='Approved development owner-capital opening balance repair',
        wallet_balance_before=0,wallet_balance_after=movement.amount,
        accounting_journal_id=journal_id,decided_at=CURRENT_TIMESTAMP
    WHERE id=request_id;
  END LOOP;
END
$repair$;

SELECT request.currency,request.amount,request.funding_classification,
       request.status,request.accounting_journal_id
FROM public.treasury_funding_requests request
WHERE request.reference LIKE 'DEV-OWNER-CAPITAL-%'
ORDER BY request.currency;
