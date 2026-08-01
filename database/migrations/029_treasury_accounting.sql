BEGIN;

INSERT INTO public.sw_tbl_gl_account(
  account_code,account_name,account_type,normal_balance,statement_section,
  display_order,is_control_account,created_by,approved_by,approved_at
) VALUES (
  '2910-TREASURY-FUNDING','Treasury funding source','LIABILITY','CREDIT',
  'OTHER_LIABILITIES',291,true,'MIGRATION_029','MIGRATION_029',CURRENT_TIMESTAMP
)
ON CONFLICT (account_code) DO UPDATE
SET account_name=EXCLUDED.account_name,
    account_type=EXCLUDED.account_type,
    normal_balance=EXCLUDED.normal_balance,
    statement_section=EXCLUDED.statement_section,
    display_order=EXCLUDED.display_order,
    is_control_account=EXCLUDED.is_control_account;

INSERT INTO public.sw_tbl_accounting_category(accountname,accounttype,normal_balance)
VALUES
  ('SAFEGUARDING_ASSET','ASSET','DEBIT'),
  ('TREASURY_FUNDING','LIABILITY','CREDIT')
ON CONFLICT (accountname) DO UPDATE
SET accounttype=EXCLUDED.accounttype,
    normal_balance=EXCLUDED.normal_balance;

INSERT INTO public."SW_TBL_WALLET_TYPE"(
  "Wallet_ID","Wallet_Name","Wallet_Details","Created_By","Approved_By",
  "Approved_Date","Wallet_Type","Status"
) VALUES (
  115,'Treasury Funding Source',
  'External Treasury funding liability used as the accounting contra for bank-funded movements',
  'MIGRATION_029','MIGRATION_029',CURRENT_TIMESTAMP,900,true
)
ON CONFLICT ("Wallet_ID") DO UPDATE
SET "Wallet_Name"=EXCLUDED."Wallet_Name",
    "Wallet_Details"=EXCLUDED."Wallet_Details",
    "Status"=true,
    "Modified_By"='MIGRATION_029',
    "Modified_Date"=CURRENT_TIMESTAMP;

INSERT INTO public.sw_tbl_wallet_gl_mapping(
  wallet_code,gl_account_code,mapping_source,is_safeguarded,is_active,
  created_by,approved_by,approved_at
) VALUES (
  115,'2910-TREASURY-FUNDING','WALLET_CODE',false,true,
  'MIGRATION_029','MIGRATION_029',CURRENT_TIMESTAMP
)
ON CONFLICT (wallet_code) DO UPDATE
SET gl_account_code=EXCLUDED.gl_account_code,
    mapping_source=EXCLUDED.mapping_source,
    is_safeguarded=false,
    is_active=true,
    approved_by='MIGRATION_029',
    approved_at=CURRENT_TIMESTAMP;

INSERT INTO public."SW_TBL_WALLET"(
  "Wallet_MSISDN","Wallet_Code","Amount","Created_Date","Created_By",
  "Status",is_default,"Account_code",currency,owner_msisdn,owner_type,wallet_purpose
) VALUES
  (9800001105,105,0,CURRENT_TIMESTAMP,'MIGRATION_029',0,false,
   '00000000-0000-0000-0000-000000001105','GBP',9800001105,'SYSTEM','TEMPORARY_RESERVE'),
  (9800001115,115,0,CURRENT_TIMESTAMP,'MIGRATION_029',0,false,
   '00000000-0000-0000-0000-000000001115','GBP',9800001115,'SYSTEM','SYSTEM'),
  (9800000115,115,0,CURRENT_TIMESTAMP,'MIGRATION_029',0,false,
   '00000000-0000-0000-0000-000000000115','UGX',9800000115,'SYSTEM','SYSTEM'),
  (9800003105,105,0,CURRENT_TIMESTAMP,'MIGRATION_029',0,false,
   '00000000-0000-0000-0000-000000003105','USD',9800003105,'SYSTEM','TEMPORARY_RESERVE'),
  (9800003115,115,0,CURRENT_TIMESTAMP,'MIGRATION_029',0,false,
   '00000000-0000-0000-0000-000000003115','USD',9800003115,'SYSTEM','SYSTEM')
ON CONFLICT ("Wallet_MSISDN") DO NOTHING;

ALTER TABLE public.treasury_funding_requests
  ADD COLUMN IF NOT EXISTS accounting_journal_id bigint NULL;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='FK_TREASURY_ACCOUNTING_JOURNAL'
      AND conrelid='public.treasury_funding_requests'::regclass
  ) THEN
    ALTER TABLE public.treasury_funding_requests
      ADD CONSTRAINT "FK_TREASURY_ACCOUNTING_JOURNAL"
      FOREIGN KEY(accounting_journal_id)
      REFERENCES public.sw_tbl_accounting_journal(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;
END
$constraint$;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_TREASURY_ACCOUNTING_JOURNAL"
  ON public.treasury_funding_requests(accounting_journal_id)
  WHERE accounting_journal_id IS NOT NULL;

INSERT INTO public.sw_tbl_accounting_journal(
  transactionid,mode,action,leg,status,keyword,reference,currency,payload,
  payload_hash,completed_at,business_date,reporting_entity
)
SELECT
  -(700000000000000000::bigint+request.id),
  'DIRECT','POST',1,'COMPLETED','TREASURY_SAFEGUARDING',
  request.reference,request.currency,
  jsonb_build_object(
    'treasuryRequestId',request.id,
    'fundingType',request.funding_type,
    'direction',request.direction,
    'businessPurpose',request.business_purpose,
    'bankName',request.bank_name,
    'bankAccount',request.bank_account,
    'valueDate',request.value_date,
    'evidenceReference',request.evidence_reference
  ),
  md5(jsonb_build_object(
    'treasuryRequestId',request.id,
    'reference',request.reference,
    'direction',request.direction,
    'amount',request.amount
  )::text),
  COALESCE(request.decided_at,CURRENT_TIMESTAMP),
  request.value_date,'FINIFY_UK'
FROM public.treasury_funding_requests request
WHERE request.status='APPROVED'
  AND request.funding_type='SAFEGUARDING'
ON CONFLICT (transactionid,mode,action,leg) DO NOTHING;

UPDATE public.treasury_funding_requests request
SET accounting_journal_id=journal.id
FROM public.sw_tbl_accounting_journal journal
WHERE journal.transactionid=-(700000000000000000::bigint+request.id)
  AND journal.mode='DIRECT' AND journal.action='POST' AND journal.leg=1
  AND request.status='APPROVED' AND request.funding_type='SAFEGUARDING'
  AND request.accounting_journal_id IS NULL;

WITH movement AS (
  SELECT request.*,
         CASE WHEN request.direction='CREDIT' THEN request.amount ELSE -request.amount END AS source_delta,
         sum(CASE WHEN request.direction='CREDIT' THEN request.amount ELSE -request.amount END)
           OVER (
             PARTITION BY request.currency
             ORDER BY request.value_date,request.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS source_after
  FROM public.treasury_funding_requests request
  WHERE request.status='APPROVED' AND request.funding_type='SAFEGUARDING'
)
INSERT INTO public.sw_tbl_accounting_entry(
  transactionid,"Debit","Credit",entrydate,accounttype,accountnumber,
  journal_id,line_number,account_code,currency,description,
  balance_before,balance_after,metadata
)
SELECT
  -(700000000000000000::bigint+movement.id),
  CASE WHEN line.line_number=1 AND movement.direction='CREDIT' THEN movement.amount
       WHEN line.line_number=2 AND movement.direction='DEBIT' THEN movement.amount
       ELSE 0 END,
  CASE WHEN line.line_number=1 AND movement.direction='DEBIT' THEN movement.amount
       WHEN line.line_number=2 AND movement.direction='CREDIT' THEN movement.amount
       ELSE 0 END,
  COALESCE(movement.decided_at,CURRENT_TIMESTAMP),
  category.id,
  CASE WHEN line.line_number=1 THEN movement.wallet_msisdn ELSE source."Wallet_MSISDN" END,
  movement.accounting_journal_id,
  line.line_number,
  CASE WHEN line.line_number=1
    THEN 'SAFEGUARDING:' || movement.wallet_msisdn::text
    ELSE 'TREASURY_FUNDING:' || source."Wallet_MSISDN"::text END,
  movement.currency,
  CASE
    WHEN line.line_number=1 AND movement.direction='CREDIT' THEN 'Bank safeguarding funding'
    WHEN line.line_number=1 THEN 'Bank safeguarding withdrawal'
    WHEN movement.direction='CREDIT' THEN 'Treasury funding source'
    ELSE 'Treasury funding source reduction'
  END,
  CASE WHEN line.line_number=1
    THEN movement.wallet_balance_before
    ELSE movement.source_after-movement.source_delta END,
  CASE WHEN line.line_number=1
    THEN movement.wallet_balance_after
    ELSE movement.source_after END,
  jsonb_build_object('treasuryRequestId',movement.id,'direction',movement.direction)
FROM movement
CROSS JOIN (VALUES (1),(2)) line(line_number)
JOIN public."SW_TBL_WALLET" source
  ON source."Wallet_Code"=115
 AND upper(source.currency)=movement.currency
 AND source.owner_type='SYSTEM' AND source."Status"=0
JOIN public.sw_tbl_accounting_category category
  ON category.accountname=CASE WHEN line.line_number=1
    THEN 'SAFEGUARDING_ASSET' ELSE 'TREASURY_FUNDING' END
WHERE NOT EXISTS (
  SELECT 1 FROM public.sw_tbl_accounting_entry entry
  WHERE entry.journal_id=movement.accounting_journal_id
    AND entry.line_number=line.line_number
);

WITH totals AS (
  SELECT currency,
         sum(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END) AS balance
  FROM public.treasury_funding_requests
  WHERE status='APPROVED' AND funding_type='SAFEGUARDING'
  GROUP BY currency
)
UPDATE public."SW_TBL_WALLET" source
SET "Balance_Before"=source."Amount",
    "Amount"=totals.balance,
    "Modified_By"='MIGRATION_029',
    "Modified_Date"=CURRENT_TIMESTAMP
FROM totals
WHERE source."Wallet_Code"=115
  AND upper(source.currency)=totals.currency
  AND source.owner_type='SYSTEM' AND source."Status"=0;

ALTER TABLE public.treasury_funding_requests
  DROP CONSTRAINT IF EXISTS "CK_TREASURY_SAFEGUARDING_JOURNAL";

ALTER TABLE public.treasury_funding_requests
  ADD CONSTRAINT "CK_TREASURY_SAFEGUARDING_JOURNAL"
  CHECK (
    status<>'APPROVED'
    OR funding_type<>'SAFEGUARDING'
    OR accounting_journal_id IS NOT NULL
  );

-- A positive variance is additional safeguarding coverage and remains visible
-- as a warning. Only a negative variance is an underfunding control failure.
DO $function_patch$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.sw_proc_accounting_close_eod(date,character varying,character varying,text,boolean,character varying)'::regprocedure
  ) INTO definition;
  definition := replace(
    definition,
    'CASE WHEN v_variance=0 OR NOT v_config.strict_safeguarding THEN ''PASSED'' ELSE ''FAILED'' END',
    'CASE WHEN v_variance>=0 OR NOT v_config.strict_safeguarding THEN ''PASSED'' ELSE ''FAILED'' END'
  );
  definition := replace(
    definition,
    'CASE WHEN v_config.strict_safeguarding THEN ''CRITICAL'' ELSE ''WARNING'' END',
    'CASE WHEN v_variance<0 AND v_config.strict_safeguarding THEN ''CRITICAL'' ELSE ''WARNING'' END'
  );
  definition := replace(
    definition,
    '''Master safeguarding balance does not equal safeguarded wallet liabilities''',
    'CASE WHEN v_variance<0 THEN ''Safeguarding balance is below safeguarded wallet liabilities'' ELSE ''Safeguarding balance exceeds safeguarded wallet liabilities'' END'
  );
  EXECUTE definition;
END
$function_patch$;

COMMIT;
