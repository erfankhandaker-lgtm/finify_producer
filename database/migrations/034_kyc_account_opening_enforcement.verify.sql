DO $$
BEGIN
  IF to_regclass('public.customer_account_opening_requests') IS NULL THEN
    RAISE EXCEPTION 'Customer account-opening request table is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='IDX_CUSTOMER_ACCOUNT_OPENING_QUEUE'
  ) THEN
    RAISE EXCEPTION 'Customer account-opening queue index is missing';
  END IF;
  IF to_regprocedure('public.sw_fn_enforce_wallet_kyc()') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname='TRG_CUSTOMER_WALLET_KYC' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Customer wallet KYC enforcement trigger is missing';
  END IF;
END $$;
