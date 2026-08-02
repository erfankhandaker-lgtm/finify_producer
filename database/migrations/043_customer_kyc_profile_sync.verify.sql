DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='SW_TBL_PROFILE_CUST'
      AND column_name='KYC_Case_ID'
  ) THEN
    RAISE EXCEPTION 'Customer profile KYC case link is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='FK_CUSTOMER_PROFILE_APPROVED_KYC_CASE'
      AND conrelid='public."SW_TBL_PROFILE_CUST"'::regclass
  ) THEN
    RAISE EXCEPTION 'Customer profile approved KYC foreign key is missing';
  END IF;
END $$;
