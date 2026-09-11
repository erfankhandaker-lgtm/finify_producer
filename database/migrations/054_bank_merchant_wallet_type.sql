BEGIN;

INSERT INTO public."SW_TBL_WALLET_TYPE"(
  "Wallet_ID","Wallet_Name","Wallet_Details","Created_By","Created_Date",
  "Approved_By","Approved_Date","Is_Kyc_Needed","Wallet_Type","Is_Charge","Fee","Status"
) VALUES(
  205,'Bank Merchant Settlement',
  'Merchant-class settlement wallet type for bank lenders and funding partners',
  'wallet-type-maker',CURRENT_TIMESTAMP,'wallet-type-checker',CURRENT_TIMESTAMP,
  false,200,false,0,true
)
ON CONFLICT("Wallet_ID") DO UPDATE SET
  "Wallet_Name"=EXCLUDED."Wallet_Name",
  "Wallet_Details"=EXCLUDED."Wallet_Details",
  "Modified_By"='migration-054',"Modified_Date"=CURRENT_TIMESTAMP,
  "Approved_By"='wallet-type-checker',"Approved_Date"=CURRENT_TIMESTAMP,
  "Wallet_Type"=200,"Is_Charge"=false,"Fee"=0,"Status"=true;

ALTER TABLE public.business_merchants
  ADD COLUMN IF NOT EXISTS default_wallet_type_code integer NULL
    REFERENCES public."SW_TBL_WALLET_TYPE"("Wallet_ID") ON DELETE RESTRICT;

ALTER TABLE public.credit_lenders
  ADD COLUMN IF NOT EXISTS settlement_wallet_type_code integer NULL
    REFERENCES public."SW_TBL_WALLET_TYPE"("Wallet_ID") ON DELETE RESTRICT;

UPDATE public.business_merchants
SET default_wallet_type_code=205,updated_by='wallet-assignment-maker',updated_at=CURRENT_TIMESTAMP
WHERE code='DTB' AND merchant_type_code='BANK';

UPDATE public.credit_lenders
SET settlement_wallet_type_code=205
WHERE code='DTB_UGA' AND status='ACTIVE';

COMMIT;
