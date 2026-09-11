BEGIN;

ALTER TABLE public.treasury_funding_requests
  DROP CONSTRAINT IF EXISTS "CK_TREASURY_FUNDING_CLASSIFICATION",
  DROP COLUMN IF EXISTS funding_classification;

DELETE FROM public.sw_tbl_wallet_gl_mapping WHERE wallet_code IN (116,117);
DELETE FROM public."SW_TBL_WALLET" WHERE "Wallet_Code" IN (116,117) AND "Amount"=0;
DELETE FROM public."SW_TBL_WALLET_TYPE" WHERE "Wallet_ID" IN (116,117);
DELETE FROM public.sw_tbl_accounting_category
WHERE accountname IN ('OWNER_CAPITAL','CUSTOMER_FUNDS_LIABILITY','BANK_PREFUNDING');

COMMIT;
