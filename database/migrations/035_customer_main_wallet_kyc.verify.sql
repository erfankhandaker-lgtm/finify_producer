DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."SW_TBL_WALLET_TYPE"
    WHERE "Wallet_ID"=103
      AND "Wallet_Type"=100
      AND "Status"
      AND COALESCE("Is_Kyc_Needed",false)
  ) THEN
    RAISE EXCEPTION 'Customer Main wallet type 103 is not active and KYC-required';
  END IF;
END $$;
