DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."SW_TBL_WALLET_TYPE" wallet_type
    JOIN public.sw_tbl_wallet_gl_mapping mapping ON mapping.wallet_code=wallet_type."Wallet_ID"
    WHERE wallet_type."Wallet_ID"=205 AND wallet_type."Wallet_Type"=200
      AND wallet_type."Status" AND wallet_type."Created_By"<>wallet_type."Approved_By"
      AND mapping.gl_account_code='2010-MERCHANT-WALLET' AND mapping.is_active
  ) THEN RAISE EXCEPTION 'Bank Merchant Settlement wallet type or GL mapping is invalid'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_merchants merchant
    JOIN public.credit_lenders lender ON lender.merchant_id=merchant.id
    WHERE merchant.code='DTB' AND merchant.default_wallet_type_code=205
      AND lender.code='DTB_UGA' AND lender.settlement_wallet_type_code=205
  ) THEN RAISE EXCEPTION 'DTB wallet-type assignment is missing'; END IF;
END $$;
