BEGIN;

-- Safeguarding cash is always an asset. This migration records and posts the
-- source of that cash separately so capital, customer money, and bank
-- prefunding reach the correct balance-sheet section.
INSERT INTO public.sw_tbl_gl_account(
  account_code,account_name,account_type,normal_balance,statement_section,
  display_order,is_control_account,created_by,approved_by,approved_at
) VALUES
  ('2910-TREASURY-FUNDING','Bank and partner prefunding','LIABILITY','CREDIT',
   'OTHER_LIABILITIES',291,true,'MIGRATION_044','MIGRATION_044',CURRENT_TIMESTAMP)
ON CONFLICT (account_code) DO UPDATE
SET account_name=EXCLUDED.account_name,
    account_type=EXCLUDED.account_type,
    normal_balance=EXCLUDED.normal_balance,
    statement_section=EXCLUDED.statement_section,
    display_order=EXCLUDED.display_order,
    is_control_account=EXCLUDED.is_control_account;

INSERT INTO public.sw_tbl_accounting_category(accountname,accounttype,normal_balance)
VALUES
  ('OWNER_CAPITAL','EQUITY','CREDIT'),
  ('CUSTOMER_FUNDS_LIABILITY','LIABILITY','CREDIT'),
  ('BANK_PREFUNDING','LIABILITY','CREDIT')
ON CONFLICT (accountname) DO UPDATE
SET accounttype=EXCLUDED.accounttype,
    normal_balance=EXCLUDED.normal_balance;

INSERT INTO public."SW_TBL_WALLET_TYPE"(
  "Wallet_ID","Wallet_Name","Wallet_Details","Created_By","Approved_By",
  "Approved_Date","Wallet_Type","Status"
) VALUES
  (115,'Bank Prefunding Liability',
   'Bank or partner prefunding balance-sheet control account',
   'MIGRATION_044','MIGRATION_044',CURRENT_TIMESTAMP,900,true),
  (116,'Owner Capital',
   'Owner and shareholder paid-in capital balance-sheet control account',
   'MIGRATION_044','MIGRATION_044',CURRENT_TIMESTAMP,900,true),
  (117,'Customer Funds Liability',
   'Unallocated customer safeguarding liability control account',
   'MIGRATION_044','MIGRATION_044',CURRENT_TIMESTAMP,900,true)
ON CONFLICT ("Wallet_ID") DO UPDATE
SET "Wallet_Name"=EXCLUDED."Wallet_Name",
    "Wallet_Details"=EXCLUDED."Wallet_Details",
    "Status"=true,
    "Modified_By"='MIGRATION_044',
    "Modified_Date"=CURRENT_TIMESTAMP;

INSERT INTO public.sw_tbl_wallet_gl_mapping(
  wallet_code,gl_account_code,mapping_source,is_safeguarded,is_active,
  created_by,approved_by,approved_at
) VALUES
  (115,'2910-TREASURY-FUNDING','WALLET_CODE',false,true,
   'MIGRATION_044','MIGRATION_044',CURRENT_TIMESTAMP),
  (116,'3000-CAPITAL','WALLET_CODE',false,true,
   'MIGRATION_044','MIGRATION_044',CURRENT_TIMESTAMP),
  (117,'2000-CUSTOMER-WALLET','WALLET_CODE',true,true,
   'MIGRATION_044','MIGRATION_044',CURRENT_TIMESTAMP)
ON CONFLICT (wallet_code) DO UPDATE
SET gl_account_code=EXCLUDED.gl_account_code,
    mapping_source=EXCLUDED.mapping_source,
    is_safeguarded=EXCLUDED.is_safeguarded,
    is_active=true,
    approved_by='MIGRATION_044',
    approved_at=CURRENT_TIMESTAMP;

WITH required AS (
  SELECT DISTINCT upper(currency) AS currency,wallet_code
  FROM public.sw_tbl_accounting_configuration
  CROSS JOIN (VALUES (116),(117)) codes(wallet_code)
  WHERE is_active
), generated AS (
  SELECT required.*,nextval('public.sw_wallet_account_number_seq')::bigint AS wallet_id
  FROM required
  WHERE NOT EXISTS (
    SELECT 1 FROM public."SW_TBL_WALLET" wallet
    WHERE wallet.owner_type='SYSTEM'
      AND wallet."Wallet_Code"=required.wallet_code
      AND upper(wallet.currency)=required.currency
      AND wallet."Status"=0
  )
)
INSERT INTO public."SW_TBL_WALLET"(
  "Wallet_MSISDN","Wallet_Code","Amount","Created_By","Status",is_default,
  currency,owner_msisdn,owner_type,wallet_purpose
)
SELECT wallet_id,wallet_code,0,'MIGRATION_044',0,false,
       currency,wallet_id,'SYSTEM','SYSTEM'
FROM generated;

ALTER TABLE public.treasury_funding_requests
  ADD COLUMN IF NOT EXISTS funding_classification varchar(32);

UPDATE public.treasury_funding_requests
SET funding_classification=CASE
  WHEN funding_type='SAFEGUARDING' THEN 'BANK_PREFUNDING'
  ELSE 'NOT_APPLICABLE'
END
WHERE funding_classification IS NULL;

ALTER TABLE public.treasury_funding_requests
  ALTER COLUMN funding_classification SET NOT NULL,
  ALTER COLUMN funding_classification SET DEFAULT 'NOT_APPLICABLE';

ALTER TABLE public.treasury_funding_requests
  DROP CONSTRAINT IF EXISTS "CK_TREASURY_FUNDING_CLASSIFICATION";

ALTER TABLE public.treasury_funding_requests
  ADD CONSTRAINT "CK_TREASURY_FUNDING_CLASSIFICATION"
  CHECK (
    (funding_type='SAFEGUARDING' AND funding_classification IN (
      'OWNER_INVESTMENT','CUSTOMER_FUNDS','BANK_PREFUNDING'
    ))
    OR
    (funding_type<>'SAFEGUARDING' AND funding_classification='NOT_APPLICABLE')
  );

COMMENT ON COLUMN public.treasury_funding_requests.funding_classification IS
  'Immutable balance-sheet classification selected by the maker for safeguarding movements.';

COMMIT;
