BEGIN;
UPDATE public.credit_lenders SET settlement_wallet_type_code=NULL WHERE code='DTB_UGA';
UPDATE public.business_merchants SET default_wallet_type_code=NULL WHERE code='DTB';
ALTER TABLE public.credit_lenders DROP COLUMN IF EXISTS settlement_wallet_type_code;
ALTER TABLE public.business_merchants DROP COLUMN IF EXISTS default_wallet_type_code;
DELETE FROM public.sw_tbl_wallet_gl_mapping WHERE wallet_code=205;
DELETE FROM public."SW_TBL_WALLET_TYPE" WHERE "Wallet_ID"=205;
COMMIT;
